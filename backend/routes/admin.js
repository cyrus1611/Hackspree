const express = require('express');
const { query, body, validationResult } = require('express-validator');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Merchant = require('../models/Merchant');
const Event = require('../models/Event');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// Apply auth and adminAuth to all routes
router.use(auth);
router.use(adminAuth);

// @route   GET /api/admin/dashboard
// @desc    Get admin dashboard overview
// @access  Private (Admin)
router.get('/dashboard', async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get basic counts
    const [
      totalUsers,
      totalMerchants,
      totalEvents,
      activeUsers,
      verifiedMerchants,
      publishedEvents
    ] = await Promise.all([
      User.countDocuments({ isActive: true }),
      Merchant.countDocuments({ isActive: true }),
      Event.countDocuments({ isActive: true }),
      User.countDocuments({ 
        isActive: true, 
        lastLogin: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } 
      }),
      Merchant.countDocuments({ isActive: true, isVerified: true }),
      Event.countDocuments({ status: 'published', isActive: true })
    ]);

    // Get transaction statistics
    const [todayTransactions, weekTransactions, monthTransactions] = await Promise.all([
      Transaction.aggregate([
        {
          $match: {
            status: 'completed',
            createdAt: { $gte: startOfDay }
          }
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            totalCount: { $sum: 1 },
            avgAmount: { $avg: '$amount' }
          }
        }
      ]),
      Transaction.aggregate([
        {
          $match: {
            status: 'completed',
            createdAt: { $gte: startOfWeek }
          }
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            totalCount: { $sum: 1 }
          }
        }
      ]),
      Transaction.aggregate([
        {
          $match: {
            status: 'completed',
            createdAt: { $gte: startOfMonth }
          }
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            totalCount: { $sum: 1 }
          }
        }
      ])
    ]);

    // Get user growth data (last 30 days)
    const userGrowth = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    // Get transaction volume data (last 30 days)
    const transactionVolume = await Transaction.aggregate([
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
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
          totalCount: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    // Get category wise spending
    const categorySpending = await Transaction.aggregate([
      {
        $match: {
          status: 'completed',
          type: 'payment',
          createdAt: { $gte: startOfMonth }
        }
      },
      {
        $group: {
          _id: '$category',
          totalAmount: { $sum: '$amount' },
          totalTransactions: { $sum: 1 }
        }
      },
      {
        $sort: { totalAmount: -1 }
      }
    ]);

    // Get top merchants
    const topMerchants = await Merchant.find({ isActive: true, isVerified: true })
      .sort({ 'metrics.totalEarnings': -1 })
      .limit(5)
      .select('name category metrics.totalEarnings metrics.totalTransactions')
      .lean();

    // Recent activities
    const recentTransactions = await Transaction.find({ status: 'completed' })
      .populate('fromUser', 'name universityId')
      .populate('toMerchant', 'name category')
      .select('transactionId amount type category createdAt fromUser toMerchant')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const dashboard = {
      overview: {
        totalUsers,
        totalMerchants,
        totalEvents,
        activeUsers,
        verifiedMerchants,
        publishedEvents
      },
      transactions: {
        today: todayTransactions[0] || { totalAmount: 0, totalCount: 0, avgAmount: 0 },
        thisWeek: weekTransactions || { totalAmount: 0, totalCount: 0 },
        thisMonth: monthTransactions || { totalAmount: 0, totalCount: 0 }
      },
      growth: {
        userGrowth,
        transactionVolume
      },
      analytics: {
        categorySpending,
        topMerchants
      },
      recentActivities: recentTransactions
    };

    res.json({
      message: 'Dashboard data fetched successfully',
      dashboard
    });

  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch dashboard data',
      code: 'DASHBOARD_ERROR'
    });
  }
});

// @route   GET /api/admin/users
// @desc    Get all users with filters and pagination
// @access  Private (Admin)
router.get('/users', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('role').optional().isIn(['student', 'merchant', 'admin', 'super_admin']),
  query('status').optional().isIn(['active', 'inactive']),
  query('search').optional().trim().isLength({ min: 1, max: 100 })
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

    // Build filter
    const filter = {};

    if (req.query.role) filter.role = req.query.role;
    if (req.query.status === 'active') filter.isActive = true;
    if (req.query.status === 'inactive') filter.isActive = false;

    if (req.query.search) {
      filter.$or = [
        { name: new RegExp(req.query.search, 'i') },
        { email: new RegExp(req.query.search, 'i') },
        { universityId: new RegExp(req.query.search, 'i') }
      ];
    }

    const [users, totalCount] = await Promise.all([
      User.find(filter)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter)
    ]);

    // Add computed fields
    const conversionRate = parseFloat(process.env.COLLEX_CONVERSION_RATE || 1);
    const usersWithDetails = users.map(user => ({
      ...user,
      walletBalanceInRupees: (user.walletBalance / conversionRate).toFixed(2),
      accountAge: Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
      lastLoginDays: user.lastLogin ? 
        Math.floor((Date.now() - new Date(user.lastLogin).getTime()) / (1000 * 60 * 60 * 24)) : 
        null
    }));

    res.json({
      message: 'Users fetched successfully',
      users: usersWithDetails,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalUsers: totalCount,
        usersPerPage: limit
      }
    });

  } catch (error) {
    console.error('Admin users fetch error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch users',
      code: 'USERS_FETCH_ERROR'
    });
  }
});

// @route   PUT /api/admin/users/:id/status
// @desc    Update user status (activate/deactivate)
// @access  Private (Admin)
router.put('/users/:id/status', [
  body('isActive').isBoolean().withMessage('isActive must be boolean'),
  body('reason').optional().isLength({ min: 5, max: 500 }).withMessage('Reason must be 5-500 characters')
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
    const { isActive, reason } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ 
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Prevent self-deactivation
    if (user._id.toString() === req.userId.toString() && !isActive) {
      return res.status(400).json({ 
        message: 'Cannot deactivate your own account',
        code: 'SELF_DEACTIVATION_NOT_ALLOWED'
      });
    }

    user.isActive = isActive;
    await user.save();

    console.log(`👤 User ${isActive ? 'activated' : 'deactivated'}: ${user.email} by ${req.user.email}`);

    res.json({
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isActive: user.isActive
      },
      reason
    });

  } catch (error) {
    console.error('User status update error:', error);
    res.status(500).json({ 
      message: 'Failed to update user status',
      code: 'USER_STATUS_UPDATE_ERROR'
    });
  }
});

// @route   GET /api/admin/merchants/pending
// @desc    Get merchants pending verification
// @access  Private (Admin)
router.get('/merchants/pending', async (req, res) => {
  try {
    const pendingMerchants = await Merchant.find({
      isActive: true,
      verificationStatus: { $in: ['pending', 'under_review'] }
    })
    .populate('ownerId', 'name email phone universityId')
    .sort({ createdAt: 1 })
    .lean();

    const merchantsWithDetails = pendingMerchants.map(merchant => {
      const merchantObj = new Merchant(merchant);
      return {
        ...merchant,
        fullAddress: merchantObj.fullAddress,
        daysWaiting: Math.floor((Date.now() - new Date(merchant.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      };
    });

    res.json({
      message: 'Pending merchants fetched successfully',
      merchants: merchantsWithDetails,
      count: merchantsWithDetails.length
    });

  } catch (error) {
    console.error('Pending merchants fetch error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch pending merchants',
      code: 'PENDING_MERCHANTS_ERROR'
    });
  }
});

// @route   PUT /api/admin/merchants/:id/verify
// @desc    Verify or reject merchant
// @access  Private (Admin)
router.put('/merchants/:id/verify', [
  body('action').isIn(['approve', 'reject']).withMessage('Action must be approve or reject'),
  body('reason').optional().isLength({ min: 5, max: 500 }).withMessage('Reason must be 5-500 characters')
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
    const { action, reason } = req.body;

    const merchant = await Merchant.findById(id).populate('ownerId', 'name email');
    if (!merchant) {
      return res.status(404).json({ 
        message: 'Merchant not found',
        code: 'MERCHANT_NOT_FOUND'
      });
    }

    if (action === 'approve') {
      merchant.isVerified = true;
      merchant.verificationStatus = 'verified';
      merchant.verificationDate = new Date();
      merchant.verifiedBy = req.userId;
    } else {
      merchant.isVerified = false;
      merchant.verificationStatus = 'rejected';
      merchant.isActive = false; // Deactivate rejected merchants
    }

    await merchant.save();

    // Send notification to merchant owner
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${merchant.ownerId._id}`).emit('merchant_verification_update', {
        merchantId: merchant._id,
        merchantName: merchant.name,
        status: merchant.verificationStatus,
        reason
      });
    }

    console.log(`🏪 Merchant ${action}d: ${merchant.name} by ${req.user.email}`);

    res.json({
      message: `Merchant ${action}d successfully`,
      merchant: {
        id: merchant._id,
        name: merchant.name,
        verificationStatus: merchant.verificationStatus,
        isVerified: merchant.isVerified
      },
      reason
    });

  } catch (error) {
    console.error('Merchant verification error:', error);
    res.status(500).json({ 
      message: 'Failed to verify merchant',
      code: 'MERCHANT_VERIFICATION_ERROR'
    });
  }
});

// @route   GET /api/admin/transactions
// @desc    Get all transactions with filters
// @access  Private (Admin)
router.get('/transactions', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('type').optional().isIn(['topup', 'payment', 'refund', 'cashback']),
  query('status').optional().isIn(['pending', 'processing', 'completed', 'failed', 'cancelled']),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('minAmount').optional().isFloat({ min: 0 }),
  query('maxAmount').optional().isFloat({ min: 0 })
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
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};

    if (req.query.type) filter.type = req.query.type;
    if (req.query.status) filter.status = req.query.status;

    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {};
      if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate) filter.createdAt.$lte = new Date(req.query.endDate);
    }

    if (req.query.minAmount || req.query.maxAmount) {
      filter.amount = {};
      if (req.query.minAmount) filter.amount.$gte = parseFloat(req.query.minAmount);
      if (req.query.maxAmount) filter.amount.$lte = parseFloat(req.query.maxAmount);
    }

    const [transactions, totalCount] = await Promise.all([
      Transaction.find(filter)
        .populate('fromUser', 'name universityId email')
        .populate('toMerchant', 'name category')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Transaction.countDocuments(filter)
    ]);

    const conversionRate = parseFloat(process.env.COLLEX_CONVERSION_RATE || 1);
    const formattedTransactions = transactions.map(transaction => ({
      ...transaction,
      amountInRupees: (transaction.amount / conversionRate).toFixed(2),
      processingTime: transaction.processingTime || null
    }));

    res.json({
      message: 'Transactions fetched successfully',
      transactions: formattedTransactions,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalTransactions: totalCount,
        transactionsPerPage: limit
      }
    });

  } catch (error) {
    console.error('Admin transactions fetch error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch transactions',
      code: 'TRANSACTIONS_FETCH_ERROR'
    });
  }
});

// @route   GET /api/admin/analytics/revenue
// @desc    Get revenue analytics
// @access  Private (Admin)
router.get('/analytics/revenue', [
  query('period').optional().isIn(['daily', 'weekly', 'monthly', 'yearly']),
  query('days').optional().isInt({ min: 1, max: 365 })
], async (req, res) => {
  try {
    const period = req.query.period || 'daily';
    const days = parseInt(req.query.days) || 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let groupBy;
    switch (period) {
      case 'yearly':
        groupBy = { year: { $year: '$createdAt' } };
        break;
      case 'monthly':
        groupBy = { 
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        };
        break;
      case 'weekly':
        groupBy = {
          year: { $year: '$createdAt' },
          week: { $week: '$createdAt' }
        };
        break;
      default: // daily
        groupBy = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        };
    }

    const revenueData = await Transaction.aggregate([
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: groupBy,
          totalRevenue: { $sum: '$amount' },
          totalFees: { $sum: '$fees.totalFees' },
          transactionCount: { $sum: 1 },
          topupRevenue: {
            $sum: {
              $cond: [{ $eq: ['$type', 'topup'] }, '$amount', 0]
            }
          },
          paymentRevenue: {
            $sum: {
              $cond: [{ $eq: ['$type', 'payment'] }, '$amount', 0]
            }
          }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);

    // Category wise revenue
    const categoryRevenue = await Transaction.aggregate([
      {
        $match: {
          status: 'completed',
          type: 'payment',
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$category',
          revenue: { $sum: '$amount' },
          transactionCount: { $sum: 1 }
        }
      },
      {
        $sort: { revenue: -1 }
      }
    ]);

    res.json({
      message: 'Revenue analytics fetched successfully',
      analytics: {
        revenueOverTime: revenueData,
        categoryRevenue,
        period,
        days
      }
    });

  } catch (error) {
    console.error('Revenue analytics error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch revenue analytics',
      code: 'REVENUE_ANALYTICS_ERROR'
    });
  }
});

module.exports = router;
