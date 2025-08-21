const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const Merchant = require('../models/Merchant');
const paymentService = require('../services/paymentService');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

class TransactionController {
  /**
   * List transactions with advanced filtering and pagination
   */
  async listTransactions(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const {
        page = 1,
        limit = 20,
        userId,
        walletId,
        status,
        type,
        category,
        startDate,
        endDate,
        minAmount,
        maxAmount,
        merchantId,
        squarePaymentId,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        search
      } = req.query;

      // Build query object
      const query = {};

      // User-specific filtering
      if (userId) {
        if (!mongoose.Types.ObjectId.isValid(userId)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid user ID format'
          });
        }
        query.userId = userId;
      }

      // Wallet-specific filtering
      if (walletId) {
        if (!mongoose.Types.ObjectId.isValid(walletId)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid wallet ID format'
          });
        }
        query.walletId = walletId;
      }

      // Status filtering
      if (status) {
        const validStatuses = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'];
        if (validStatuses.includes(status)) {
          query.status = status;
        }
      }

      // Type filtering
      if (type) {
        const validTypes = ['CREDIT', 'DEBIT'];
        if (validTypes.includes(type)) {
          query.type = type;
        }
      }

      // Category filtering
      if (category) {
        const validCategories = ['TRANSFER', 'TOP_UP', 'WITHDRAWAL', 'PAYMENT', 'REFUND', 'REVERSAL', 'EVENT_PAYMENT'];
        if (validCategories.includes(category)) {
          query.category = category;
        }
      }

      // Date range filtering
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
          query.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
          const endDateObj = new Date(endDate);
          endDateObj.setHours(23, 59, 59, 999); // End of day
          query.createdAt.$lte = endDateObj;
        }
      }

      // Amount range filtering
      if (minAmount || maxAmount) {
        query.amount = {};
        if (minAmount) {
          query.amount.$gte = parseFloat(minAmount);
        }
        if (maxAmount) {
          query.amount.$lte = parseFloat(maxAmount);
        }
      }

      // Merchant filtering
      if (merchantId) {
        query['metadata.merchantId'] = merchantId;
      }

      // Square payment ID filtering
      if (squarePaymentId) {
        query.squarePaymentId = squarePaymentId;
      }

      // Search filtering
      if (search) {
        query.$or = [
          { transactionId: new RegExp(search, 'i') },
          { description: new RegExp(search, 'i') },
          { squarePaymentId: new RegExp(search, 'i') }
        ];
      }

      // Authorization check - users can only see their own transactions unless admin
      if (req.user && req.user.role !== 'admin') {
        query.userId = req.userId;
      }

      // Build sort object
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Execute queries
      const [transactions, totalTransactions] = await Promise.all([
        Transaction.find(query)
          .populate('userId', 'name email')
          .populate('walletId', 'walletId')
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Transaction.countDocuments(query)
      ]);

      // Calculate summary statistics for the filtered results
      const summaryResults = await Transaction.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            avgAmount: { $avg: '$amount' },
            creditCount: { $sum: { $cond: [{ $eq: ['$type', 'CREDIT'] }, 1, 0] } },
            debitCount: { $sum: { $cond: [{ $eq: ['$type', 'DEBIT'] }, 1, 0] } },
            completedCount: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
            pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] } }
          }
        }
      ]);

      const summary = summaryResults[0] || {
        totalAmount: 0,
        avgAmount: 0,
        creditCount: 0,
        debitCount: 0,
        completedCount: 0,
        pendingCount: 0
      };

      res.json({
        success: true,
        message: 'Transactions retrieved successfully',
        data: {
          transactions,
          summary,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalTransactions / parseInt(limit)),
            totalTransactions,
            transactionsPerPage: parseInt(limit),
            hasNextPage: skip + parseInt(limit) < totalTransactions,
            hasPrevPage: parseInt(page) > 1
          },
          filters: {
            status,
            type,
            category,
            dateRange: { startDate, endDate },
            amountRange: { minAmount, maxAmount }
          }
        }
      });

    } catch (error) {
      console.error('List transactions error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve transactions',
        error: error.message
      });
    }
  }

  /**
   * Get detailed transaction information
   */
  async getTransactionDetails(req, res) {
    try {
      const { id } = req.params;

      // Validate transaction ID format
      if (!mongoose.Types.ObjectId.isValid(id)) {
        // Try to find by transactionId string
        const transactionByTxnId = await Transaction.findOne({ transactionId: id })
          .populate('userId', 'name email phone')
          .populate('walletId', 'walletId balance')
          .lean();

        if (!transactionByTxnId) {
          return res.status(400).json({
            success: false,
            message: 'Invalid transaction ID format'
          });
        }

        return this.sendTransactionDetails(res, transactionByTxnId, req.userId, req.user?.role);
      }

      const transaction = await Transaction.findById(id)
        .populate('userId', 'name email phone')
        .populate('walletId', 'walletId balance')
        .lean();

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      return this.sendTransactionDetails(res, transaction, req.userId, req.user?.role);

    } catch (error) {
      console.error('Get transaction details error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve transaction details',
        error: error.message
      });
    }
  }

  /**
   * Helper method to send transaction details with authorization
   */
  async sendTransactionDetails(res, transaction, currentUserId, userRole) {
    try {
      // Authorization check
      if (userRole !== 'admin' && transaction.userId._id.toString() !== currentUserId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view this transaction'
        });
      }

      // Get related merchant info if exists
      let merchantInfo = null;
      if (transaction.metadata?.merchantId) {
        merchantInfo = await Merchant.findById(transaction.metadata.merchantId)
          .select('name businessName category location')
          .lean();
      }

      // Get Square payment details if exists
      let squarePaymentDetails = null;
      if (transaction.squarePaymentId) {
        try {
          const squareResult = await paymentService.getPayment(transaction.squarePaymentId);
          if (squareResult.success) {
            squarePaymentDetails = {
              status: squareResult.payment.status,
              createdAt: squareResult.payment.createdAt,
              updatedAt: squareResult.payment.updatedAt,
              receiptUrl: squareResult.payment.receiptUrl,
              cardDetails: squareResult.payment.cardDetails || null
            };
          }
        } catch (squareError) {
          console.warn('Failed to fetch Square payment details:', squareError);
        }
      }

      // Get related transactions (if this is part of a transfer)
      let relatedTransactions = [];
      if (transaction.category === 'TRANSFER' && transaction.metadata?.transferTo) {
        const relatedTxn = await Transaction.findOne({
          transactionId: transaction.transactionId,
          userId: { $ne: transaction.userId._id }
        }).populate('userId', 'name email').lean();

        if (relatedTxn) {
          relatedTransactions.push(relatedTxn);
        }
      }

      res.json({
        success: true,
        message: 'Transaction details retrieved successfully',
        data: {
          transaction: {
            ...transaction,
            formattedAmount: `$${transaction.amount.toFixed(2)}`,
            timeAgo: this.getTimeAgo(transaction.createdAt),
            merchant: merchantInfo,
            squareDetails: squarePaymentDetails,
            relatedTransactions
          }
        }
      });

    } catch (error) {
      console.error('Send transaction details error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process transaction details',
        error: error.message
      });
    }
  }

  /**
   * Create a new transaction (usually for admin or internal use)
   */
  async createTransaction(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const {
        userId,
        walletId,
        amount,
        type,
        category,
        description,
        metadata = {}
      } = req.body;

      // Validate required fields
      if (!userId || !walletId || !amount || !type || !category) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields'
        });
      }

      // Validate user and wallet
      const [user, wallet] = await Promise.all([
        User.findById(userId).session(session),
        Wallet.findById(walletId).session(session)
      ]);

      if (!user) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!wallet) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'Wallet not found'
        });
      }

      // Check if wallet belongs to user
      if (wallet.userId.toString() !== userId) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Wallet does not belong to user'
        });
      }

      const previousBalance = wallet.balance;

      // Process transaction based on type
      if (type === 'DEBIT') {
        if (wallet.balance < amount) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: 'Insufficient balance'
          });
        }
        wallet.balance -= amount;
      } else if (type === 'CREDIT') {
        wallet.balance += amount;
      }

      // Generate transaction ID
      const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create transaction record
      const transaction = new Transaction({
        transactionId,
        userId,
        walletId,
        amount,
        type,
        category,
        status: 'COMPLETED', // Manual transactions are completed immediately
        balanceBefore: previousBalance,
        balanceAfter: wallet.balance,
        description,
        metadata,
        processedAt: new Date(),
        completedAt: new Date()
      });

      // Save transaction and update wallet
      await Promise.all([
        transaction.save({ session }),
        wallet.save({ session })
      ]);

      await session.commitTransaction();

      res.status(201).json({
        success: true,
        message: 'Transaction created successfully',
        data: {
          transaction: {
            id: transaction._id,
            transactionId: transaction.transactionId,
            amount: transaction.amount,
            type: transaction.type,
            category: transaction.category,
            status: transaction.status,
            newBalance: wallet.balance,
            createdAt: transaction.createdAt
          }
        }
      });

    } catch (error) {
      await session.abortTransaction();
      console.error('Create transaction error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create transaction',
        error: error.message
      });
    } finally {
      session.endSession();
    }
  }

  /**
   * Update transaction status (admin only)
   */
  async updateTransactionStatus(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { id } = req.params;
      const { status, notes } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid transaction ID format'
        });
      }

      const validStatuses = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status value'
        });
      }

      const transaction = await Transaction.findById(id);
      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      const previousStatus = transaction.status;

      // Update status and related fields
      transaction.status = status;
      if (notes) transaction.errorMessage = notes;

      // Update timestamp fields based on status
      switch (status) {
        case 'PROCESSING':
          transaction.processedAt = new Date();
          break;
        case 'COMPLETED':
          transaction.processedAt = transaction.processedAt || new Date();
          transaction.completedAt = new Date();
          break;
        case 'FAILED':
          transaction.failedAt = new Date();
          break;
        case 'CANCELLED':
          transaction.cancelledAt = new Date();
          break;
      }

      await transaction.save();

      // Log the status change
      console.log(`Transaction ${transaction.transactionId} status changed from ${previousStatus} to ${status} by admin ${req.userId}`);

      res.json({
        success: true,
        message: 'Transaction status updated successfully',
        data: {
          transactionId: transaction.transactionId,
          previousStatus,
          newStatus: status,
          updatedAt: new Date()
        }
      });

    } catch (error) {
      console.error('Update transaction status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update transaction status',
        error: error.message
      });
    }
  }

  /**
   * Get transaction statistics
   */
  async getTransactionStats(req, res) {
    try {
      const { period = 'month', userId } = req.query;

      let dateFilter = {};
      const now = new Date();

      // Set date range based on period
      switch (period) {
        case 'today':
          dateFilter = {
            createdAt: {
              $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate())
            }
          };
          break;
        case 'week':
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          dateFilter = { createdAt: { $gte: weekAgo } };
          break;
        case 'month':
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          dateFilter = { createdAt: { $gte: monthAgo } };
          break;
        case 'year':
          const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          dateFilter = { createdAt: { $gte: yearAgo } };
          break;
      }

      // Add user filter if specified and user is not admin
      const baseQuery = { ...dateFilter };
      if (userId) {
        baseQuery.userId = mongoose.Types.ObjectId(userId);
      } else if (req.user?.role !== 'admin') {
        baseQuery.userId = mongoose.Types.ObjectId(req.userId);
      }

      // Get overall statistics
      const overallStats = await Transaction.aggregate([
        { $match: baseQuery },
        {
          $group: {
            _id: null,
            totalTransactions: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            avgAmount: { $avg: '$amount' },
            creditCount: { $sum: { $cond: [{ $eq: ['$type', 'CREDIT'] }, 1, 0] } },
            debitCount: { $sum: { $cond: [{ $eq: ['$type', 'DEBIT'] }, 1, 0] } },
            completedCount: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
            failedCount: { $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] } }
          }
        }
      ]);

      // Get category breakdown
      const categoryBreakdown = await Transaction.aggregate([
        { $match: { ...baseQuery, status: 'COMPLETED' } },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            avgAmount: { $avg: '$amount' }
          }
        },
        { $sort: { totalAmount: -1 } }
      ]);

      // Get daily transaction volume (last 30 days)
      const dailyVolume = await Transaction.aggregate([
        {
          $match: {
            ...baseQuery,
            status: 'COMPLETED',
            createdAt: { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' }
            },
            totalAmount: { $sum: '$amount' },
            transactionCount: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
      ]);

      const stats = overallStats[0] || {
        totalTransactions: 0,
        totalAmount: 0,
        avgAmount: 0,
        creditCount: 0,
        debitCount: 0,
        completedCount: 0,
        failedCount: 0
      };

      res.json({
        success: true,
        message: 'Transaction statistics retrieved successfully',
        data: {
          period,
          overview: stats,
          categoryBreakdown,
          dailyVolume,
          generatedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Get transaction stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve transaction statistics',
        error: error.message
      });
    }
  }

  /**
   * Cancel transaction (if possible)
   */
  async cancelTransaction(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid transaction ID format'
        });
      }

      const transaction = await Transaction.findById(id).session(session);
      if (!transaction) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      // Check authorization
      if (req.user.role !== 'admin' && transaction.userId.toString() !== req.userId.toString()) {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: 'Not authorized to cancel this transaction'
        });
      }

      // Check if transaction can be cancelled
      if (!['PENDING', 'PROCESSING'].includes(transaction.status)) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Transaction cannot be cancelled in current status'
        });
      }

      // Reverse wallet balance if needed
      if (transaction.status === 'PROCESSING' && transaction.balanceAfter !== transaction.balanceBefore) {
        const wallet = await Wallet.findById(transaction.walletId).session(session);
        if (wallet) {
          // Reverse the balance change
          const balanceChange = transaction.balanceAfter - transaction.balanceBefore;
          wallet.balance -= balanceChange;
          await wallet.save({ session });
        }
      }

      // Update transaction
      transaction.status = 'CANCELLED';
      transaction.cancelledAt = new Date();
      transaction.errorMessage = reason || 'Cancelled by user';
      await transaction.save({ session });

      await session.commitTransaction();

      res.json({
        success: true,
        message: 'Transaction cancelled successfully',
        data: {
          transactionId: transaction.transactionId,
          status: transaction.status,
          cancelledAt: transaction.cancelledAt
        }
      });

    } catch (error) {
      await session.abortTransaction();
      console.error('Cancel transaction error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cancel transaction',
        error: error.message
      });
    } finally {
      session.endSession();
    }
  }

  /**
   * Export transactions to CSV
   */
  async exportTransactions(req, res) {
    try {
      const {
        startDate,
        endDate,
        userId,
        status,
        type,
        category,
        format = 'json'
      } = req.query;

      // Build query
      const query = {};
      
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      if (userId) query.userId = userId;
      if (status) query.status = status;
      if (type) query.type = type;
      if (category) query.category = category;

      // Authorization check
      if (req.user?.role !== 'admin') {
        query.userId = req.userId;
      }

      const transactions = await Transaction.find(query)
        .populate('userId', 'name email')
        .populate('walletId', 'walletId')
        .sort({ createdAt: -1 })
        .lean();

      const exportData = transactions.map(txn => ({
        transactionId: txn.transactionId,
        userId: txn.userId?.email || txn.userId?._id,
        userName: txn.userId?.name,
        walletId: txn.walletId?.walletId,
        amount: txn.amount,
        type: txn.type,
        category: txn.category,
        status: txn.status,
        description: txn.description,
        balanceBefore: txn.balanceBefore,
        balanceAfter: txn.balanceAfter,
        createdAt: txn.createdAt,
        completedAt: txn.completedAt,
        squarePaymentId: txn.squarePaymentId
      }));

      if (format === 'csv') {
        // Convert to CSV format
        const csvHeader = Object.keys(exportData[0] || {}).join(',');
        const csvRows = exportData.map(row => 
          Object.values(row).map(value => 
            typeof value === 'string' ? `"${value}"` : value
          ).join(',')
        );
        const csvContent = [csvHeader, ...csvRows].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="transactions_${Date.now()}.csv"`);
        res.send(csvContent);
      } else {
        res.json({
          success: true,
          message: 'Transactions exported successfully',
          data: exportData,
          totalRecords: exportData.length,
          exportedAt: new Date().toISOString()
        });
      }

    } catch (error) {
      console.error('Export transactions error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export transactions',
        error: error.message
      });
    }
  }

  /**
   * Helper method to calculate time ago
   */
  getTimeAgo(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - new Date(date)) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
    
    return new Date(date).toLocaleDateString();
  }
}

module.exports = new TransactionController();
