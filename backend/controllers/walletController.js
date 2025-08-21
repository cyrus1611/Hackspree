const User = require('../models/User');
const Transaction = require('../models/Transaction');
const paymentService = require('../services/paymentService');
const { generateTransactionId } = require('../utils/helpers');
const { applicationId, locationId } = require('../config/square');

class WalletController {
  /**
   * Create top-up order
   */
  async createTopUpOrder(req, res) {
    try {
      const { amount } = req.body;
      const user = await User.findById(req.userId);

      if (!user) {
        return res.status(404).json({ 
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      // Validate amount limits
      const minAmount = parseFloat(process.env.MIN_TOPUP_AMOUNT) || 1;
      const maxAmount = parseFloat(process.env.MAX_TOPUP_AMOUNT) || 10000;
      
      if (amount < minAmount || amount > maxAmount) {
        return res.status(400).json({
          message: `Amount must be between $${minAmount} and $${maxAmount}`,
          code: 'INVALID_AMOUNT'
        });
      }

      // Create pending transaction
      const transaction = new Transaction({
        transactionId: generateTransactionId(),
        fromUser: req.userId,
        amount: amount,
        type: 'topup',
        description: `Wallet top-up of $${amount}`,
        status: 'pending',
        balanceBeforeTransaction: user.walletBalance,
        balanceAfterTransaction: user.walletBalance,
        metadata: {
          amountInDollars: amount,
          squareLocationId: locationId
        }
      });

      await transaction.save();

      res.json({
        message: 'Top-up order created successfully',
        transactionId: transaction.transactionId,
        amount: amount,
        currency: 'USD',
        squareConfig: { applicationId, locationId },
        userDetails: {
          name: user.name,
          email: user.email
        }
      });

    } catch (error) {
      console.error('Order creation error:', error);
      res.status(500).json({ 
        message: 'Failed to create payment order',
        code: 'ORDER_CREATION_ERROR'
      });
    }
  }

  /**
   * Process Square payment
   */
  async processTopUp(req, res) {
    try {
      const { nonce, transactionId, amount } = req.body;

      if (!nonce || !transactionId || !amount) {
        return res.status(400).json({
          message: 'Missing required payment data',
          code: 'MISSING_DATA'
        });
      }

      // Find pending transaction
      const transaction = await Transaction.findOne({
        transactionId,
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

      // Process payment with Square
      const paymentResult = await paymentService.createPayment({
        nonce,
        amount,
        note: `Collex wallet top-up - ${transactionId}`,
        buyerEmailAddress: req.user.email,
        userId: req.userId
      });

      if (!paymentResult.success) {
        // Mark transaction as failed
        transaction.status = 'failed';
        transaction.errorCode = 'PAYMENT_FAILED';
        transaction.errorMessage = paymentResult.message;
        transaction.failedAt = new Date();
        await transaction.save();

        return res.status(400).json({ 
          message: paymentResult.message,
          code: 'PAYMENT_FAILED',
          errors: paymentResult.error
        });
      }

      // Update user wallet balance
      const user = await User.findById(req.userId);
      const previousBalance = user.walletBalance;
      user.walletBalance += amount;
      
      // Update transaction
      transaction.status = 'completed';
      transaction.squarePaymentId = paymentResult.paymentId;
      transaction.balanceAfterTransaction = user.walletBalance;
      transaction.completedAt = new Date();
      transaction.metadata.squarePayment = paymentResult.payment;

      // Save both user and transaction
      await Promise.all([user.save(), transaction.save()]);

      // Real-time update via Socket.io
      const io = req.app.get('io');
      if (io) {
        io.to(`wallet_${req.userId}`).emit('balance_updated', {
          newBalance: user.walletBalance,
          previousBalance,
          amountAdded: amount,
          transaction: {
            id: transaction._id,
            transactionId: transaction.transactionId,
            amount: amount,
            type: 'topup',
            timestamp: transaction.completedAt
          }
        });
      }

      res.json({
        message: 'Wallet topped up successfully',
        transaction: {
          id: transaction._id,
          transactionId: transaction.transactionId,
          amount: amount,
          type: 'topup',
          status: 'completed',
          timestamp: transaction.completedAt,
          squarePaymentId: paymentResult.paymentId,
          receiptUrl: paymentResult.receiptUrl
        },
        wallet: {
          previousBalance,
          newBalance: user.walletBalance,
          amountAdded: amount
        }
      });

    } catch (error) {
      console.error('Payment processing error:', error);
      res.status(500).json({ 
        message: 'Payment processing failed',
        code: 'PROCESSING_ERROR'
      });
    }
  }

  /**
   * Get wallet balance
   */
  async getBalance(req, res) {
    try {
      const user = await User.findById(req.userId);
      
      if (!user) {
        return res.status(404).json({ 
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      res.json({ 
        balance: user.walletBalance,
        balanceInDollars: user.walletBalance.toFixed(2),
        canSpend: user.walletBalance > 0
      });

    } catch (error) {
      console.error('Balance fetch error:', error);
      res.status(500).json({ 
        message: 'Failed to fetch balance',
        code: 'BALANCE_FETCH_ERROR'
      });
    }
  }
}

module.exports = new WalletController();
