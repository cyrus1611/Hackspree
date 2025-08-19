const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { body, query, validationResult } = require('express-validator');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { auth } = require('../middleware/auth');
const { generateTransactionId } = require('../utils/helpers');

const router = express.Router();

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// @route   GET /api/wallet/balance
// @desc    Get user wallet balance
// @access  Private
router.get('/balance', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('walletBalance dailySpentAmount lastSpentReset');
    
    if (!user) {
      return res.status(404).json({ 
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Reset daily spending if needed
    const wasReset = user.resetDailySpentIfNeeded();
    if (wasReset) {
      await user.save();
    }

    const conversionRate = parseFloat(process.env.COLLEX_CONVERSION_RATE) || 1;
    const dailyLimit = parseFloat(process.env.DAILY_TRANSACTION_LIMIT) || 5000;

    res.json({ 
      balance: user.walletBalance,
      balanceInRupees: (user.walletBalance / conversionRate).toFixed(2),
      dailySpentAmount: user.dailySpentAmount,
      dailyRemainingAmount: Math.max(0, dailyLimit - user.dailySpentAmount),
      dailyLimit,
      lastSpentReset: user.lastSpentReset,
      canSpend: user.walletBalance > 0 && user.dailySpentAmount < dailyLimit
    });

  } catch (error) {
    console.error('Balance fetch error:', error);
    res.status(500).json({ 
      message: 'Server error fetching balance',
      code: 'BALANCE_FETCH_ERROR'
    });
  }
});

// @route   POST /api/wallet/topup/create-order
// @desc    Create Razorpay order for wallet top-up
// @access  Private
router.post('/topup/create-order', auth, [
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0')
    .custom(value => {
      const minAmount = parseFloat(process.env.MIN_TOPUP_AMOUNT) || 50;
      const maxAmount = parseFloat(process.env.MAX_TOPUP_AMOUNT) || 10000;
      
      if (value < minAmount) {
        throw new Error(`Minimum top-up amount is ₹${minAmount}`);
      }
      if (value > maxAmount) {
        throw new Error(`Maximum top-up amount is ₹${maxAmount}`);
      }
      return true;
    })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { amount } = req.body;
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({ 
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Check wallet balance limit
    const conversionRate = parseFloat(process.env.COLLEX_CONVERSION_RATE) || 1;
    const collexCoinsToAdd = amount * conversionRate;
    const maxWalletBalance = parseFloat(process.env.MAX_WALLET_BALANCE) || 50000;
    const newBalance = user.walletBalance + collexCoinsToAdd;
    
    if (newBalance > maxWalletBalance) {
      return res.status(400).json({ 
        message: `Wallet balance cannot exceed ${maxWalletBalance} Collex Coins (₹${(maxWalletBalance / conversionRate).toFixed(2)})`,
        code: 'WALLET_LIMIT_EXCEEDED',
        currentBalance: user.walletBalance,
        maxBalance: maxWalletBalance
      });
    }

    // Create Razorpay order
    const orderOptions = {
      amount: Math.round(amount * 100), // amount in smallest currency unit (paise)
      currency: 'INR',
      receipt: `topup_${user._id}_${Date.now()}`,
      payment_capture: 1, // Auto capture
      notes: {
        userId: user._id.toString(),
        universityId: user.universityId,
        type: 'wallet_topup',
        collexCoins: collexCoinsToAdd.toString()
      }
    };

    const order = await razorpay.orders.create(orderOptions);

    // Create pending transaction record
    const transaction = new Transaction({
      transactionId: generateTransactionId(),
      fromUser: req.userId,
      amount: collexCoinsToAdd,
      type: 'topup',
      description: `Wallet top-up of ₹${amount}`,
      status: 'pending',
      razorpayOrderId: order.id,
      balanceBeforeTransaction: user.walletBalance,
      balanceAfterTransaction: user.walletBalance, // Will be updated on success
      metadata: {
        razorpayOrderId: order.id,
        amountInRupees: amount
      }
    });

    await transaction.save();

    console.log(`💰 Top-up order created: ${order.id} for ${user.email} - ₹${amount}`);

    res.json({
      message: 'Top-up order created successfully',
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      transactionId: transaction.transactionId,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      userDetails: {
        name: user.name,
        email: user.email,
        contact: user.phone
      },
      metadata: {
        collexCoinsToAdd,
        newBalanceWillBe: newBalance
      }
    });

  } catch (error) {
    console.error('Order creation error:', error);
    
    if (error.error && error.error.description) {
      return res.status(400).json({ 
        message: `Payment gateway error: ${error.error.description}`,
        code: 'RAZORPAY_ERROR'
      });
    }
    
    res.status(500).json({ 
      message: 'Failed to create payment order',
      code: 'ORDER_CREATION_ERROR'
    });
  }
});

// @route   POST /api/wallet/topup/verify
// @desc    Verify payment and add balance to wallet
// @access  Private
router.post('/topup/verify', auth, [
  body('razorpayOrderId').notEmpty().withMessage('Order ID is required'),
  body('razorpayPaymentId').notEmpty().withMessage('Payment ID is required'),
  body('razorpaySignature').notEmpty().withMessage('Signature is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    // Verify payment signature
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (generatedSignature !== razorpaySignature) {
      console.error('❌ Invalid payment signature:', { razorpayOrderId, razorpayPaymentId });
      return res.status(400).json({ 
        message: 'Invalid payment signature',
        code: 'INVALID_SIGNATURE'
      });
    }

    // Find the pending transaction
    const transaction = await Transaction.findOne({
      razorpayOrderId,
      fromUser: req.userId,
      status: 'pending',
      type: 'topup'
    });

    if (!transaction) {
      return res.status(404).json({ 
        message: 'Transaction not found or already processed',
        code: 'TRANSACTION_NOT_FOUND'
      });
    }

    // Get payment details from Razorpay to double-check
    const payment = await razorpay.payments.fetch(razorpayPaymentId);
    
    if (payment.status !== 'captured') {
      return res.status(400).json({ 
        message: `Payment not captured. Status: ${payment.status}`,
        code: 'PAYMENT_NOT_CAPTURED'
      });
    }

    if (payment.order_id !== razorpayOrderId) {
      return res.status(400).json({ 
        message: 'Payment order mismatch',
        code: 'ORDER_MISMATCH'
      });
    }

    // Update user wallet balance
    const user = await User.findById(req.userId);
    const previousBalance = user.walletBalance;
    user.walletBalance += transaction.amount;
    
    // Update transaction
    transaction.status = 'completed';
    transaction.razorpayPaymentId = razorpayPaymentId;
    transaction.razorpaySignature = razorpaySignature;
    transaction.balanceAfterTransaction = user.walletBalance;
    transaction.completedAt = new Date();

    // Save both user and transaction
    await Promise.all([
      user.save(),
      transaction.save()
    ]);

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(`wallet_${req.userId}`).emit('balance_updated', {
        newBalance: user.walletBalance,
        previousBalance,
        amountAdded: transaction.amount,
        transaction: {
          id: transaction._id,
          transactionId: transaction.transactionId,
          amount: transaction.amount,
          type: 'topup',
          timestamp: transaction.completedAt,
          description: transaction.description
        }
      });
    }

    console.log(`✅ Wallet topped up: ${user.email} - ${transaction.amount} Collex Coins`);

    res.json({
      message: 'Wallet topped up successfully',
      transaction: {
        id: transaction._id,
        transactionId: transaction.transactionId,
        amount: transaction.amount,
        type: 'topup',
        status: 'completed',
        timestamp: transaction.completedAt,
        razorpayPaymentId
      },
      wallet: {
        previousBalance,
        newBalance: user.walletBalance,
        amountAdded: transaction.amount,
        balanceInRupees: (user.walletBalance / parseFloat(process.env.COLLEX_CONVERSION_RATE || 1)).toFixed(2)
      }
    });

  } catch (error) {
    console.error('Payment verification error:', error);
    
    // Mark transaction as failed if it exists
    if (req.body.razorpayOrderId) {
      await Transaction.findOneAndUpdate(
        { 
          razorpayOrderId: req.body.razorpayOrderId,
          status: 'pending'
        },
        {
          status: 'failed',
          errorCode: 'VERIFICATION_FAILED',
          errorMessage: error.message,
          failedAt: new Date()
        }
      );
    }
    
    if (error.error && error.error.description) {
      return res.status(400).json({ 
        message: `Payment verification failed: ${error.error.description}`,
        code: 'RAZORPAY_ERROR'
      });
    }
    
    res.status(500).json({ 
      message: 'Payment verification failed',
      code: 'VERIFICATION_ERROR'
    });
  }
});

// @route   GET /api/wallet/transactions/recent
// @desc    Get recent wallet transactions
// @access  Private
router.get('/transactions/recent', auth, [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const limit = parseInt(req.query.limit) || 10;

    const transactions = await Transaction.find({
      fromUser: req.userId,
      status: 'completed'
    })
    .populate('toMerchant', 'name category')
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('transactionId amount type category description createdAt toMerchant metadata')
    .lean();

    // Add formatted data
    const formattedTransactions = transactions.map(transaction => ({
      ...transaction,
      amountInRupees: (transaction.amount / parseFloat(process.env.COLLEX_CONVERSION_RATE || 1)).toFixed(2),
      formattedAmount: `₹${(transaction.amount / parseFloat(process.env.COLLEX_CONVERSION_RATE || 1)).toFixed(2)}`,
      merchant: transaction.toMerchant ? {
        name: transaction.toMerchant.name,
        category: transaction.toMerchant.category
      } : null
    }));

    res.json({
      message: 'Recent transactions fetched successfully',
      transactions: formattedTransactions,
      count: formattedTransactions.length
    });

  } catch (error) {
    console.error('Recent transactions error:', error);
    res.status(500).json({ 
      message: 'Server error fetching recent transactions',
      code: 'RECENT_TRANSACTIONS_ERROR'
    });
  }
});

// @route   GET /api/wallet/summary
// @desc    Get wallet summary with statistics
// @access  Private
router.get('/summary', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({ 
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Get transaction statistics
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));

    const [monthlyStats, weeklyStats, totalStats] = await Promise.all([
      Transaction.aggregate([
        {
          $match: {
            fromUser: user._id,
            status: 'completed',
            createdAt: { $gte: startOfMonth }
          }
        },
        {
          $group: {
            _id: '$type',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]),
      Transaction.aggregate([
        {
          $match: {
            fromUser: user._id,
            status: 'completed',
            createdAt: { $gte: startOfWeek }
          }
        },
        {
          $group: {
            _id: '$type',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]),
      Transaction.aggregate([
        {
          $match: {
            fromUser: user._id,
            status: 'completed'
          }
        },
        {
          $group: {
            _id: null,
            totalSpent: {
              $sum: {
                $cond: [{ $ne: ['$type', 'topup'] }, '$amount', 0]
              }
            },
            totalTopups: {
              $sum: {
                $cond: [{ $eq: ['$type', 'topup'] }, '$amount', 0]
              }
            },
            totalTransactions: { $sum: 1 }
          }
        }
      ])
    ]);

    const conversionRate = parseFloat(process.env.COLLEX_CONVERSION_RATE || 1);
    const dailyLimit = parseFloat(process.env.DAILY_TRANSACTION_LIMIT || 5000);

    // Reset daily spending if needed
    const wasReset = user.resetDailySpentIfNeeded();
    if (wasReset) {
      await user.save();
    }

    const summary = {
      wallet: {
        balance: user.walletBalance,
        balanceInRupees: (user.walletBalance / conversionRate).toFixed(2),
        dailySpent: user.dailySpentAmount,
        dailyRemaining: Math.max(0, dailyLimit - user.dailySpentAmount),
        dailyLimit
      },
      monthly: {
        spent: 0,
        topups: 0,
        transactions: 0
      },
      weekly: {
        spent: 0,
        topups: 0,
        transactions: 0
      },
      lifetime: {
        totalSpent: 0,
        totalTopups: 0,
        totalTransactions: 0
      }
    };

    // Process monthly stats
    monthlyStats.forEach(stat => {
      if (stat._id === 'topup') {
        summary.monthly.topups = stat.totalAmount;
      } else {
        summary.monthly.spent += stat.totalAmount;
      }
      summary.monthly.transactions += stat.count;
    });

    // Process weekly stats
    weeklyStats.forEach(stat => {
      if (stat._id === 'topup') {
        summary.weekly.topups = stat.totalAmount;
      } else {
        summary.weekly.spent += stat.totalAmount;
      }
      summary.weekly.transactions += stat.count;
    });

    // Process lifetime stats
    if (totalStats.length > 0) {
      const lifetime = totalStats[0];
      summary.lifetime = {
        totalSpent: lifetime.totalSpent || 0,
        totalTopups: lifetime.totalTopups || 0,
        totalTransactions: lifetime.totalTransactions || 0
      };
    }

    res.json({
      message: 'Wallet summary fetched successfully',
      summary
    });

  } catch (error) {
    console.error('Wallet summary error:', error);
    res.status(500).json({ 
      message: 'Server error fetching wallet summary',
      code: 'WALLET_SUMMARY_ERROR'
    });
  }
});

module.exports = router;
