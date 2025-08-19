const express = require('express');
const { body, query, validationResult } = require('express-validator');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Merchant = require('../models/Merchant');
const { auth } = require('../middleware/auth');
const { generateTransactionId } = require('../utils/helpers');

const router = express.Router();

// @route   POST /api/transactions/pay
// @desc    Make a payment via QR code
// @access  Private
router.post('/pay', auth, [
  body('merchantQrCode')
    .notEmpty()
    .withMessage('Merchant QR code is required')
    .isLength({ min: 10, max: 50 })
    .withMessage('Invalid QR code format'),
  
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0')
    .custom(value => {
      if (value > 10000) {
        throw new Error('Amount cannot exceed ₹10,000 per transaction');
      }
      return true;
    }),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  
  body('location')
    .optional()
    .isObject()
    .withMessage('Location must be an object'),
  
  body('location.latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Invalid latitude'),
  
  body('location.longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Invalid longitude')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { merchantQrCode, amount, description, location } = req.body;

    // Find merchant by QR code
    const merchant = await Merchant.findOne({ 
      qrCode: merchantQrCode.toUpperCase(), 
      isActive: true,
      isVerified: true
    }).populate('ownerId', 'name email');

    if (!merchant) {
      return res.status(404).json({ 
        message: 'Invalid QR code or merchant not found',
        code: 'INVALID_MERCHANT_QR'
      });
    }

    // Check if merchant is currently open
    if (!merchant.isOpenNow()) {
      return res.status(400).json({ 
        message: `${merchant.name} is currently closed`,
        code: 'MERCHANT_CLOSED',
        operatingHours: merchant.operatingHours
      });
    }

    // Get user and check spending capacity
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({ 
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const conversionRate = parseFloat(process.env.COLLEX_CONVERSION_RATE || 1);
    const collexAmount = amount * conversionRate;

    // Check if user can spend this amount
    const spendingCheck = user.canSpend(collexAmount);
    
    if (!spendingCheck.canSpend) {
      if (!spendingCheck.hasBalance) {
        return res.status(400).json({ 
          message: 'Insufficient wallet balance',
          code: 'INSUFFICIENT_BALANCE',
          available: spendingCheck.availableBalance,
          required: collexAmount
        });
      }
      
      if (!spendingCheck.withinDailyLimit) {
        return res.status(400).json({ 
          message: `Daily transaction limit exceeded. Remaining: ${spendingCheck.dailyLimit - spendingCheck.dailySpent} Collex`,
          code: 'DAILY_LIMIT_EXCEEDED',
          dailySpent: spendingCheck.dailySpent,
          dailyLimit: spendingCheck.dailyLimit
        });
      }
    }

    // Calculate fees
    const merchantFee = collexAmount * merchant.commissionRate;
    const platformFee = 0; // No platform fee for now
    const totalFees = merchantFee + platformFee;
    const merchantEarning = collexAmount - totalFees;

    // Create transaction
    const transaction = new Transaction({
      transactionId: generateTransactionId(),
      fromUser: req.userId,
      toMerchant: merchant._id,
      amount: collexAmount,
      type: 'payment',
      category: merchant.category,
      description: description || `Payment to ${merchant.name}`,
      status: 'processing',
      balanceBeforeTransaction: user.walletBalance,
      balanceAfterTransaction: user.walletBalance - collexAmount,
      fees: {
        platformFee,
        merchantFee,
        totalFees
      },
      metadata: {
        qrCode: merchantQrCode,
        location,
        deviceInfo: {
          userAgent: req.get('User-Agent'),
          ip: req.ip
        },
        merchantInfo: {
          merchantName: merchant.name,
          merchantCategory: merchant.category
        }
      }
    });

    // Start database transaction
    const session = await Transaction.startSession();
    
    try {
      await session.withTransaction(async () => {
        // Update user balance and daily spending
        user.resetDailySpentIfNeeded();
        user.walletBalance -= collexAmount;
        user.dailySpentAmount += collexAmount;
        user.totalSpent += collexAmount;

        // Update merchant metrics
        await merchant.updateMetrics(collexAmount);

        // Save transaction and user
        await Promise.all([
          transaction.save({ session }),
          user.save({ session })
        ]);

        // Mark transaction as completed
        transaction.status = 'completed';
        transaction.completedAt = new Date();
        await transaction.save({ session });
      });

      await session.commitTransaction();

    } catch (sessionError) {
      await session.abortTransaction();
      throw sessionError;
    } finally {
      await session.endSession();
    }

    // Populate transaction for response
    await transaction.populate('toMerchant', 'name category location');

    // Real-time updates
    const io = req.app.get('io');
    if (io) {
      // Update user's wallet
      io.to(`wallet_${req.userId}`).emit('transaction_completed', {
        transaction: {
          id: transaction._id,
          transactionId: transaction.transactionId,
          amount: collexAmount,
          type: 'payment',
          merchant: {
            name: merchant.name,
            category: merchant.category
          },
          timestamp: transaction.completedAt
        },
        newBalance: user.walletBalance,
        dailySpent: user.dailySpentAmount
      });

      // Notify merchant
      if (merchant.ownerId) {
        io.to(`merchant_${merchant.ownerId._id}`).emit('payment_received', {
          transaction: {
            id: transaction._id,
            transactionId: transaction.transactionId,
            amount: collexAmount,
            earning: merchantEarning,
            customer: user.name,
            timestamp: transaction.completedAt
          }
        });
      }
    }

    console.log(`💳 Payment completed: ${user.email} → ${merchant.name} - ${collexAmount} Collex`);

    res.json({
      message: 'Payment successful',
      transaction: {
        id: transaction._id,
        transactionId: transaction.transactionId,
        amount: collexAmount,
        amountInRupees: amount,
        type: 'payment',
        merchant: {
          name: merchant.name,
          category: merchant.category,
          location: merchant.fullAddress
        },
        timestamp: transaction.completedAt,
        fees: {
          merchantFee: (merchantFee / conversionRate).toFixed(2),
          totalFees: (totalFees / conversionRate).toFixed(2)
        }
      },
      wallet: {
        newBalance: user.walletBalance,
        newBalanceInRupees: (user.walletBalance / conversionRate).toFixed(2),
        dailySpent: user.dailySpentAmount,
        dailyRemaining: Math.max(0, spendingCheck.dailyLimit - user.dailySpentAmount)
      }
    });

  } catch (error) {
    console.error('Payment error:', error);
    
    // Mark transaction as failed if it was created
    if (req.body.merchantQrCode) {
      await Transaction.findOneAndUpdate(
        { 
          fromUser: req.userId,
          'metadata.qrCode': req.body.merchantQrCode,
          status: 'processing',
          createdAt: { $gte: new Date(Date.now() - 60000) } // Within last minute
        },
        {
          status: 'failed',
          errorCode: 'PROCESSING_ERROR',
          errorMessage: error.message,
          failedAt: new Date()
        }
      );
    }
    
    res.status(500).json({ 
      message: 'Payment processing failed',
      code: 'PAYMENT_ERROR'
    });
  }
});

// @route   GET /api/transactions/history
// @desc    Get user transaction history with filters
// @access  Private
router.get('/history', auth, [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('type')
    .optional()
    .isIn(['topup', 'payment', 'refund', 'cashback', 'transfer'])
    .withMessage('Invalid transaction type'),
  
  query('category')
    .optional()
    .isIn(['canteen', 'event', 'club', 'shop', 'stationery', 'transport', 'library', 'other'])
    .withMessage('Invalid category'),
  
  query('status')
    .optional()
    .isIn(['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'])
    .withMessage('Invalid status'),
  
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format'),
  
  query('minAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum amount must be positive'),
  
  query('maxAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum amount must be positive')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Build filter query
    const filter = { fromUser: req.userId };

    // Add filters
    if (req.query.type) filter.type = req.query.type;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.status) filter.status = req.query.status;

    // Date range filter
    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {};
      if (req.query.startDate) {
        filter.createdAt.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        filter.createdAt.$lte = new Date(req.query.endDate);
      }
    }

    // Amount range filter
    if (req.query.minAmount || req.query.maxAmount) {
      filter.amount = {};
      if (req.query.minAmount) {
        const conversionRate = parseFloat(process.env.COLLEX_CONVERSION_RATE || 1);
        filter.amount.$gte = parseFloat(req.query.minAmount) * conversionRate;
      }
      if (req.query.maxAmount) {
        const conversionRate = parseFloat(process.env.COLLEX_CONVERSION_RATE || 1);
        filter.amount.$lte = parseFloat(req.query.maxAmount) * conversionRate;
      }
    }

    // Execute queries in parallel
    const [transactions, totalCount] = await Promise.all([
      Transaction.find(filter)
        .populate('toMerchant', 'name category location')
        .populate('toUser', 'name universityId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Transaction.countDocuments(filter)
    ]);

    // Format transactions
    const conversionRate = parseFloat(process.env.COLLEX_CONVERSION_RATE || 1);
    const formattedTransactions = transactions.map(transaction => ({
      ...transaction,
      amountInRupees: (transaction.amount / conversionRate).toFixed(2),
      formattedAmount: `${transaction.amount} Collex (₹${(transaction.amount / conversionRate).toFixed(2)})`,
      merchant: transaction.toMerchant ? {
        name: transaction.toMerchant.name,
        category: transaction.toMerchant.category,
        location: transaction.toMerchant.location
      } : null,
      recipient: transaction.toUser ? {
        name: transaction.toUser.name,
        universityId: transaction.toUser.universityId
      } : null,
      processingTime: transaction.processingTime || null
    }));

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      message: 'Transaction history fetched successfully',
      transactions: formattedTransactions,
      pagination: {
        currentPage: page,
        totalPages,
        totalTransactions: totalCount,
        transactionsPerPage: limit,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? page + 1 : null,
        prevPage: hasPrevPage ? page - 1 : null
      },
      filters: {
        type: req.query.type || null,
        category: req.query.category || null,
        status: req.query.status || null,
        dateRange: {
          startDate: req.query.startDate || null,
          endDate: req.query.endDate || null
        },
        amountRange: {
          minAmount: req.query.minAmount || null,
          maxAmount: req.query.maxAmount || null
        }
      }
    });

  } catch (error) {
    console.error('Transaction history error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch transaction history',
      code: 'TRANSACTION_HISTORY_ERROR'
    });
  }
});

// @route   GET /api/transactions/:id
// @desc    Get specific transaction details
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        message: 'Invalid transaction ID format',
        code: 'INVALID_TRANSACTION_ID'
      });
    }

    const transaction = await Transaction.findOne({
      _id: id,
      fromUser: req.userId
    })
    .populate('toMerchant', 'name category location contact operatingHours')
    .populate('toUser', 'name universityId email')
    .populate('fromUser', 'name universityId email')
    .lean();

    if (!transaction) {
      return res.status(404).json({ 
        message: 'Transaction not found',
        code: 'TRANSACTION_NOT_FOUND'
      });
    }

    // Format transaction details
    const conversionRate = parseFloat(process.env.COLLEX_CONVERSION_RATE || 1);
    const formattedTransaction = {
      ...transaction,
      amountInRupees: (transaction.amount / conversionRate).toFixed(2),
      formattedAmount: `${transaction.amount} Collex (₹${(transaction.amount / conversionRate).toFixed(2)})`,
      fees: transaction.fees ? {
        ...transaction.fees,
        platformFeeInRupees: (transaction.fees.platformFee / conversionRate).toFixed(2),
        merchantFeeInRupees: (transaction.fees.merchantFee / conversionRate).toFixed(2),
        totalFeesInRupees: (transaction.fees.totalFees / conversionRate).toFixed(2)
      } : null,
      processingTime: transaction.processingTime,
      formattedTransactionId: transaction.transactionId.replace(/(.{4})/g, '$1-').slice(0, -1)
    };

    res.json({
      message: 'Transaction details fetched successfully',
      transaction: formattedTransaction
    });

  } catch (error) {
    console.error('Transaction details error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch transaction details',
      code: 'TRANSACTION_DETAILS_ERROR'
    });
  }
});

// @route   GET /api/transactions/stats/summary
// @desc    Get transaction statistics summary
// @access  Private
router.get('/stats/summary', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const now = new Date();
    
    // Date ranges
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Aggregate queries
    const [todayStats, weekStats, monthStats, yearStats, categoryStats] = await Promise.all([
      // Today's stats
      Transaction.aggregate([
        {
          $match: {
            fromUser: userId,
            status: 'completed',
            createdAt: { $gte: startOfToday }
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

      // This week's stats
      Transaction.aggregate([
        {
          $match: {
            fromUser: userId,
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

      // This month's stats
      Transaction.aggregate([
        {
          $match: {
            fromUser: userId,
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

      // This year's stats
      Transaction.aggregate([
        {
          $match: {
            fromUser: userId,
            status: 'completed',
            createdAt: { $gte: startOfYear }
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

      // Category-wise spending
      Transaction.aggregate([
        {
          $match: {
            fromUser: userId,
            status: 'completed',
            type: { $ne: 'topup' }
          }
        },
        {
          $group: {
            _id: '$category',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
            avgAmount: { $avg: '$amount' }
          }
        },
        {
          $sort: { totalAmount: -1 }
        }
      ])
    ]);

    // Process stats
    const processStats = (stats) => {
      const result = { spent: 0, topups: 0, transactions: 0 };
      stats.forEach(stat => {
        if (stat._id === 'topup') {
          result.topups = stat.totalAmount;
        } else {
          result.spent += stat.totalAmount;
        }
        result.transactions += stat.count;
      });
      return result;
    };

    const conversionRate = parseFloat(process.env.COLLEX_CONVERSION_RATE || 1);

    const summary = {
      today: processStats(todayStats),
      thisWeek: processStats(weekStats),
      thisMonth: processStats(monthStats),
      thisYear: processStats(yearStats),
      categoryBreakdown: categoryStats.map(cat => ({
        category: cat._id,
        totalAmount: cat.totalAmount,
        totalAmountInRupees: (cat.totalAmount / conversionRate).toFixed(2),
        count: cat.count,
        averageAmount: cat.avgAmount,
        averageAmountInRupees: (cat.avgAmount / conversionRate).toFixed(2)
      }))
    };

    res.json({
      message: 'Transaction statistics fetched successfully',
      summary
    });

  } catch (error) {
    console.error('Transaction stats error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch transaction statistics',
      code: 'TRANSACTION_STATS_ERROR'
    });
  }
});

// @route   POST /api/transactions/:id/dispute
// @desc    Report a transaction dispute
// @access  Private
router.post('/:id/dispute', auth, [
  body('reason')
    .notEmpty()
    .withMessage('Dispute reason is required')
    .isIn(['unauthorized', 'incorrect_amount', 'service_not_received', 'duplicate_charge', 'other'])
    .withMessage('Invalid dispute reason'),
  
  body('description')
    .notEmpty()
    .withMessage('Dispute description is required')
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be 10-1000 characters'),
  
  body('evidence')
    .optional()
    .isArray()
    .withMessage('Evidence must be an array of URLs')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { reason, description, evidence } = req.body;

    // Find transaction
    const transaction = await Transaction.findOne({
      _id: id,
      fromUser: req.userId,
      status: 'completed'
    });

    if (!transaction) {
      return res.status(404).json({ 
        message: 'Transaction not found or cannot be disputed',
        code: 'TRANSACTION_NOT_FOUND'
      });
    }

    // Check if dispute window is still open (e.g., 7 days)
    const disputeWindow = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    if (Date.now() - transaction.completedAt.getTime() > disputeWindow) {
      return res.status(400).json({ 
        message: 'Dispute window has expired. Disputes must be filed within 7 days.',
        code: 'DISPUTE_WINDOW_EXPIRED'
      });
    }

    // Add dispute information to transaction
    transaction.status = 'disputed';
    transaction.disputeInfo = {
      reason,
      description,
      evidence: evidence || [],
      reportedAt: new Date(),
      reportedBy: req.userId,
      status: 'pending'
    };

    await transaction.save();

    console.log(`⚠️ Transaction disputed: ${transaction.transactionId} by ${req.user.email}`);

    res.json({
      message: 'Dispute reported successfully',
      disputeId: transaction._id,
      status: 'pending',
      expectedResolution: '3-5 business days'
    });

  } catch (error) {
    console.error('Transaction dispute error:', error);
    res.status(500).json({ 
      message: 'Failed to report transaction dispute',
      code: 'DISPUTE_ERROR'
    });
  }
});

module.exports = router;
