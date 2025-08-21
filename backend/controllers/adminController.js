const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Merchant = require('../models/Merchant');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

class AdminController {
  /**
   * Get admin dashboard overview
   */
  async getDashboard(req, res) {
    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Get basic counts
      const [
        totalUsers,
        activeUsers,
        totalWallets,
        totalMerchants,
        verifiedMerchants,
        pendingMerchants,
        totalTransactions,
        todayTransactions,
        monthlyTransactions
      ] = await Promise.all([
        User.countDocuments({}),
        User.countDocuments({ isActive: true }),
        Wallet.countDocuments({}),
        Merchant.countDocuments({}),
        Merchant.countDocuments({ verificationStatus: 'verified' }),
        Merchant.countDocuments({ verificationStatus: 'pending' }),
        Transaction.countDocuments({}),
        Transaction.countDocuments({ createdAt: { $gte: startOfDay } }),
        Transaction.countDocuments({ createdAt: { $gte: startOfMonth } })
      ]);

      // Get transaction volume statistics
      const totalVolumeResult = await Transaction.aggregate([
        { $match: { status: 'COMPLETED' } },
        { $group: { _id: null, totalVolume: { $sum: '$amount' } } }
      ]);

      const monthlyVolumeResult = await Transaction.aggregate([
        { 
          $match: { 
            status: 'COMPLETED',
            createdAt: { $gte: startOfMonth }
          }
        },
        { $group: { _id: null, monthlyVolume: { $sum: '$amount' } } }
      ]);

      // Get transaction breakdown by category
      const categoryBreakdown = await Transaction.aggregate([
        { $match: { status: 'COMPLETED' } },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        },
        { $sort: { totalAmount: -1 } }
      ]);

      // Recent user registrations (last 7 days)
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentUsers = await User.countDocuments({ 
        createdAt: { $gte: weekAgo } 
      });

      res.json({
        success: true,
        message: 'Dashboard data retrieved successfully',
        data: {
          overview: {
            totalUsers,
            activeUsers,
            totalWallets,
            totalMerchants,
            verifiedMerchants,
            pendingMerchants,
            totalTransactions,
            todayTransactions,
            monthlyTransactions,
            recentUsers
          },
          volume: {
            totalVolume: totalVolumeResult[0]?.totalVolume || 0,
            monthlyVolume: monthlyVolumeResult?.monthlyVolume || 0
          },
          categoryBreakdown,
          generatedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Dashboard error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve dashboard data',
        error: error.message
      });
    }
  }

  /**
   * Get all users with pagination and filters
   */
  async listUsers(req, res) {
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
        search, 
        status, 
        role,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build query
      const query = {};
      
      if (search) {
        query.$or = [
          { name: new RegExp(search, 'i') },
          { email: new RegExp(search, 'i') }
        ];
      }
      
      if (status) query.isActive = status === 'active';
      if (role) query.role = role;

      // Build sort object
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Execute queries
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      const [users, totalUsers] = await Promise.all([
        User.find(query)
          .select('-password')
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        User.countDocuments(query)
      ]);

      // Add wallet information for each user
      const usersWithWallets = await Promise.all(
        users.map(async (user) => {
          const wallet = await Wallet.findOne({ userId: user._id }).select('walletId balance status');
          return {
            ...user,
            wallet: wallet || null
          };
        })
      );

      res.json({
        success: true,
        message: 'Users retrieved successfully',
        data: {
          users: usersWithWallets,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalUsers / parseInt(limit)),
            totalUsers,
            usersPerPage: parseInt(limit),
            hasNextPage: skip + parseInt(limit) < totalUsers,
            hasPrevPage: parseInt(page) > 1
          }
        }
      });

    } catch (error) {
      console.error('List users error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve users',
        error: error.message
      });
    }
  }

  /**
   * Get detailed user information
   */
  async getUserDetails(req, res) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user ID format'
        });
      }

      const user = await User.findById(id).select('-password').lean();
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Get user's wallet
      const wallet = await Wallet.findOne({ userId: id });

      // Get user's recent transactions
      const recentTransactions = await Transaction.find({ userId: id })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('walletId', 'walletId')
        .lean();

      // Get transaction statistics
      const transactionStats = await Transaction.aggregate([
        { $match: { userId: mongoose.Types.ObjectId(id) } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        }
      ]);

      res.json({
        success: true,
        message: 'User details retrieved successfully',
        data: {
          user,
          wallet: wallet || null,
          recentTransactions,
          statistics: {
            transactionStats,
            totalTransactions: recentTransactions.length
          }
        }
      });

    } catch (error) {
      console.error('Get user details error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve user details',
        error: error.message
      });
    }
  }

  /**
   * Update user status (activate/deactivate/suspend)
   */
  async updateUserStatus(req, res) {
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
      const { status, reason } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user ID format'
        });
      }

      const validStatuses = ['active', 'inactive', 'suspended'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Must be: active, inactive, or suspended'
        });
      }

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Prevent admin from deactivating themselves
      if (user._id.toString() === req.userId.toString() && status !== 'active') {
        return res.status(400).json({
          success: false,
          message: 'Cannot deactivate your own account'
        });
      }

      const previousStatus = user.isActive ? 'active' : 'inactive';
      user.isActive = status === 'active';
      
      // Add to user's activity log (if you have this field)
      if (!user.adminActions) user.adminActions = [];
      user.adminActions.push({
        action: 'status_change',
        previousValue: previousStatus,
        newValue: status,
        reason: reason || 'No reason provided',
        adminId: req.userId,
        timestamp: new Date()
      });

      await user.save();

      // If user is being suspended/deactivated, also suspend their wallet
      if (status !== 'active') {
        await Wallet.findOneAndUpdate(
          { userId: id },
          { status: 'SUSPENDED' }
        );
      } else {
        await Wallet.findOneAndUpdate(
          { userId: id },
          { status: 'ACTIVE' }
        );
      }

      res.json({
        success: true,
        message: `User status updated to ${status}`,
        data: {
          userId: user._id,
          previousStatus,
          newStatus: status,
          updatedAt: new Date()
        }
      });

    } catch (error) {
      console.error('Update user status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update user status',
        error: error.message
      });
    }
  }

  /**
   * List all merchants with filters
   */
  async listMerchants(req, res) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        status, 
        category,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build query
      const query = {};
      
      if (status) query.verificationStatus = status;
      if (category) query.category = category;
      if (search) {
        query.$or = [
          { name: new RegExp(search, 'i') },
          { businessName: new RegExp(search, 'i') }
        ];
      }

      // Build sort
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [merchants, totalMerchants] = await Promise.all([
        Merchant.find(query)
          .populate('ownerId', 'name email')
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Merchant.countDocuments(query)
      ]);

      res.json({
        success: true,
        message: 'Merchants retrieved successfully',
        data: {
          merchants,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalMerchants / parseInt(limit)),
            totalMerchants,
            merchantsPerPage: parseInt(limit)
          }
        }
      });

    } catch (error) {
      console.error('List merchants error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve merchants',
        error: error.message
      });
    }
  }

  /**
   * Verify or reject merchant application
   */
  async verifyMerchant(req, res) {
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
      const { verificationStatus, notes } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid merchant ID format'
        });
      }

      const validStatuses = ['pending', 'verified', 'rejected'];
      if (!validStatuses.includes(verificationStatus)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid verification status'
        });
      }

      const merchant = await Merchant.findById(id).populate('ownerId', 'name email');
      if (!merchant) {
        return res.status(404).json({
          success: false,
          message: 'Merchant not found'
        });
      }

      const previousStatus = merchant.verificationStatus;
      merchant.verificationStatus = verificationStatus;
      merchant.verificationNotes = notes || '';
      merchant.verifiedAt = verificationStatus === 'verified' ? new Date() : null;
      merchant.verifiedBy = req.userId;

      await merchant.save();

      // Log this action
      console.log(`Merchant ${merchant.name} verification status changed from ${previousStatus} to ${verificationStatus} by admin ${req.userId}`);

      res.json({
        success: true,
        message: `Merchant ${verificationStatus} successfully`,
        data: {
          merchantId: merchant._id,
          merchantName: merchant.name,
          previousStatus,
          newStatus: verificationStatus,
          verifiedAt: merchant.verifiedAt,
          notes: notes || ''
        }
      });

    } catch (error) {
      console.error('Verify merchant error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify merchant',
        error: error.message
      });
    }
  }

  /**
   * List all transactions with admin filters
   */
  async listTransactions(req, res) {
    try {
      const { 
        page = 1, 
        limit = 50, 
        status, 
        type, 
        category,
        userId,
        startDate,
        endDate,
        minAmount,
        maxAmount,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build query
      const query = {};
      
      if (status) query.status = status;
      if (type) query.type = type;
      if (category) query.category = category;
      if (userId) query.userId = userId;
      
      // Date range filter
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }
      
      // Amount range filter
      if (minAmount || maxAmount) {
        query.amount = {};
        if (minAmount) query.amount.$gte = parseFloat(minAmount);
        if (maxAmount) query.amount.$lte = parseFloat(maxAmount);
      }

      // Build sort
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const skip = (parseInt(page) - 1) * parseInt(limit);

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

      // Calculate totals for the filtered results
      const totalsResult = await Transaction.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            avgAmount: { $avg: '$amount' }
          }
        }
      ]);

      const totals = totalsResult[0] || { totalAmount: 0, avgAmount: 0 };

      res.json({
        success: true,
        message: 'Transactions retrieved successfully',
        data: {
          transactions,
          summary: {
            totalTransactions,
            totalAmount: totals.totalAmount,
            averageAmount: totals.avgAmount
          },
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalTransactions / parseInt(limit)),
            totalTransactions,
            transactionsPerPage: parseInt(limit)
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
   * Get analytics and reports
   */
  async getAnalytics(req, res) {
    try {
      const { period = 'month', startDate, endDate } = req.query;

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
        case 'custom':
          if (startDate && endDate) {
            dateFilter = {
              createdAt: {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
              }
            };
          }
          break;
      }

      // Revenue by category
      const revenueByCategory = await Transaction.aggregate([
        { $match: { status: 'COMPLETED', ...dateFilter } },
        {
          $group: {
            _id: '$category',
            totalAmount: { $sum: '$amount' },
            transactionCount: { $sum: 1 },
            avgAmount: { $avg: '$amount' }
          }
        },
        { $sort: { totalAmount: -1 } }
      ]);

      // Daily transaction volume (last 30 days)
      const dailyVolume = await Transaction.aggregate([
        { 
          $match: { 
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

      // User growth
      const userGrowth = await User.aggregate([
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            newUsers: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
        { $limit: 12 } // Last 12 months
      ]);

      // Transaction status breakdown
      const statusBreakdown = await Transaction.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        }
      ]);

      // Top users by transaction volume
      const topUsers = await Transaction.aggregate([
        { $match: { status: 'COMPLETED', ...dateFilter } },
        {
          $group: {
            _id: '$userId',
            totalAmount: { $sum: '$amount' },
            transactionCount: { $sum: 1 }
          }
        },
        { $sort: { totalAmount: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $project: {
            totalAmount: 1,
            transactionCount: 1,
            'user.name': 1,
            'user.email': 1
          }
        }
      ]);

      res.json({
        success: true,
        message: 'Analytics data retrieved successfully',
        data: {
          period,
          dateRange: dateFilter,
          revenueByCategory,
          dailyVolume,
          userGrowth,
          statusBreakdown,
          topUsers,
          generatedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Analytics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve analytics data',
        error: error.message
      });
    }
  }

  /**
   * Export data to CSV (basic implementation)
   */
  async exportData(req, res) {
    try {
      const { type = 'transactions', format = 'json' } = req.query;

      let data = [];
      let filename = `${type}_export_${Date.now()}`;

      switch (type) {
        case 'users':
          data = await User.find({}).select('-password').lean();
          break;
        case 'transactions':
          data = await Transaction.find({})
            .populate('userId', 'name email')
            .lean();
          break;
        case 'merchants':
          data = await Merchant.find({})
            .populate('ownerId', 'name email')
            .lean();
          break;
        default:
          return res.status(400).json({
            success: false,
            message: 'Invalid export type'
          });
      }

      if (format === 'csv') {
        // Convert to CSV format (basic implementation)
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
        
        // You would implement CSV conversion logic here
        res.send('CSV export not fully implemented yet');
      } else {
        res.json({
          success: true,
          message: `${type} data exported successfully`,
          data,
          exportedAt: new Date().toISOString(),
          totalRecords: data.length
        });
      }

    } catch (error) {
      console.error('Export data error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export data',
        error: error.message
      });
    }
  }
}

module.exports = new AdminController();
