const express = require('express');
const { query, param } = require('express-validator');
const analyticsController = require('../controllers/analyticsController');
const authMiddleware = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const { handleValidationErrors } = require('../middleware/validation');

const router = express.Router();

/**
 * Analytics Routes for Hackspree Wallet Application
 * Provides comprehensive analytics and reporting endpoints
 */

// Validation middleware for common query parameters
const dateRangeValidation = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  query('period')
    .optional()
    .isIn(['hour', 'day', 'week', 'month', 'quarter', 'year'])
    .withMessage('Period must be one of: hour, day, week, month, quarter, year')
];

const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Page must be a positive integer not exceeding 1000'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

const formatValidation = [
  query('format')
    .optional()
    .isIn(['json', 'csv', 'excel', 'pdf'])
    .withMessage('Format must be one of: json, csv, excel, pdf')
];

// Apply rate limiting to analytics endpoints
router.use(rateLimiter.general);

/**
 * PUBLIC ANALYTICS ENDPOINTS
 * Basic analytics available to authenticated users
 */

// Get user's personal analytics
router.get('/user/overview',
  authMiddleware,
  dateRangeValidation,
  handleValidationErrors,
  analyticsController.getUserOverview
);

// Get user's transaction analytics
router.get('/user/transactions',
  authMiddleware,
  dateRangeValidation,
  paginationValidation,
  handleValidationErrors,
  analyticsController.getUserTransactionAnalytics
);

// Get user's wallet performance
router.get('/user/wallet',
  authMiddleware,
  dateRangeValidation,
  handleValidationErrors,
  analyticsController.getUserWalletAnalytics
);

// Get user's spending patterns
router.get('/user/spending',
  authMiddleware,
  dateRangeValidation,
  query('category').optional().isString(),
  handleValidationErrors,
  analyticsController.getUserSpendingAnalytics
);

// Get user's merchant interactions
router.get('/user/merchants',
  authMiddleware,
  dateRangeValidation,
  paginationValidation,
  handleValidationErrors,
  analyticsController.getUserMerchantAnalytics
);

// Get user's event participation
router.get('/user/events',
  authMiddleware,
  dateRangeValidation,
  paginationValidation,
  handleValidationErrors,
  analyticsController.getUserEventAnalytics
);

/**
 * MERCHANT ANALYTICS ENDPOINTS
 * Available to verified merchants for their own data
 */

// Get merchant's business analytics
router.get('/merchant/overview',
  authMiddleware,
  dateRangeValidation,
  handleValidationErrors,
  analyticsController.getMerchantOverview
);

// Get merchant's revenue analytics
router.get('/merchant/revenue',
  authMiddleware,
  dateRangeValidation,
  query('breakdown').optional().isIn(['daily', 'weekly', 'monthly']),
  handleValidationErrors,
  analyticsController.getMerchantRevenue
);

// Get merchant's customer analytics
router.get('/merchant/customers',
  authMiddleware,
  dateRangeValidation,
  paginationValidation,
  handleValidationErrors,
  analyticsController.getMerchantCustomers
);

// Get merchant's payment methods analytics
router.get('/merchant/payment-methods',
  authMiddleware,
  dateRangeValidation,
  handleValidationErrors,
  analyticsController.getMerchantPaymentMethods
);

// Get merchant's peak hours analytics
router.get('/merchant/peak-hours',
  authMiddleware,
  dateRangeValidation,
  handleValidationErrors,
  analyticsController.getMerchantPeakHours
);

/**
 * ADMIN ANALYTICS ENDPOINTS
 * Comprehensive system-wide analytics for administrators
 */

// System overview analytics
router.get('/admin/overview',
  authMiddleware,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  },
  dateRangeValidation,
  handleValidationErrors,
  analyticsController.getSystemOverview
);

// User growth and demographics
router.get('/admin/users',
  authMiddleware,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  },
  dateRangeValidation,
  query('breakdown').optional().isIn(['age', 'location', 'activity', 'registration']),
  handleValidationErrors,
  analyticsController.getUserAnalytics
);

// Transaction analytics
router.get('/admin/transactions',
  authMiddleware,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  },
  dateRangeValidation,
  query('type').optional().isIn(['all', 'credit', 'debit', 'transfer', 'payment']),
  query('status').optional().isIn(['all', 'pending', 'completed', 'failed']),
  handleValidationErrors,
  analyticsController.getTransactionAnalytics
);

// Wallet analytics
router.get('/admin/wallets',
  authMiddleware,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  },
  dateRangeValidation,
  query('metric').optional().isIn(['balance', 'activity', 'distribution']),
  handleValidationErrors,
  analyticsController.getWalletAnalytics
);

// Merchant analytics
router.get('/admin/merchants',
  authMiddleware,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  },
  dateRangeValidation,
  query('category').optional().isString(),
  query('status').optional().isIn(['all', 'pending', 'verified', 'rejected']),
  handleValidationErrors,
  analyticsController.getMerchantAnalytics
);

// Event analytics
router.get('/admin/events',
  authMiddleware,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  },
  dateRangeValidation,
  query('category').optional().isString(),
  query('status').optional().isIn(['all', 'upcoming', 'ongoing', 'completed', 'cancelled']),
  handleValidationErrors,
  analyticsController.getEventAnalytics
);

// Revenue analytics
router.get('/admin/revenue',
  authMiddleware,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  },
  dateRangeValidation,
  query('breakdown').optional().isIn(['source', 'merchant', 'category', 'geography']),
  handleValidationErrors,
  analyticsController.getRevenueAnalytics
);

// Security analytics
router.get('/admin/security',
  authMiddleware,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  },
  dateRangeValidation,
  query('type').optional().isIn(['all', 'login_attempts', 'suspicious_activity', 'blocked_ips']),
  handleValidationErrors,
  analyticsController.getSecurityAnalytics
);

// Performance analytics
router.get('/admin/performance',
  authMiddleware,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  },
  dateRangeValidation,
  query('metric').optional().isIn(['response_time', 'error_rate', 'throughput', 'uptime']),
  handleValidationErrors,
  analyticsController.getPerformanceAnalytics
);

/**
 * REAL-TIME ANALYTICS ENDPOINTS
 */

// Real-time dashboard data
router.get('/realtime/dashboard',
  authMiddleware,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  },
  analyticsController.getRealtimeDashboard
);

// Real-time transaction monitoring
router.get('/realtime/transactions',
  authMiddleware,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  },
  query('limit').optional().isInt({ min: 1, max: 100 }),
  handleValidationErrors,
  analyticsController.getRealtimeTransactions
);

// Real-time user activity
router.get('/realtime/users',
  authMiddleware,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  },
  analyticsController.getRealtimeUsers
);

/**
 * COMPARATIVE ANALYTICS ENDPOINTS
 */

// Compare time periods
router.get('/compare/periods',
  authMiddleware,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  },
  query('period1Start').isISO8601(),
  query('period1End').isISO8601(),
  query('period2Start').isISO8601(),
  query('period2End').isISO8601(),
  query('metrics').optional().isString(),
  handleValidationErrors,
  analyticsController.comparePeriods
);

// Compare user cohorts
router.get('/compare/cohorts',
  authMiddleware,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  },
  dateRangeValidation,
  query('cohortType').optional().isIn(['registration', 'firstTransaction', 'location']),
  handleValidationErrors,
  analyticsController.compareCohorts
);

/**
 * PREDICTIVE ANALYTICS ENDPOINTS
 */

// Revenue forecasting
router.get('/forecast/revenue',
  authMiddleware,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  },
  query('months').optional().isInt({ min: 1, max: 12 }),
  query('model').optional().isIn(['linear', 'exponential', 'seasonal']),
  handleValidationErrors,
  analyticsController.getForecastRevenue
);

// User growth predictions
router.get('/forecast/users',
  authMiddleware,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  },
  query('months').optional().isInt({ min: 1, max: 12 }),
  handleValidationErrors,
  analyticsController.getForecastUsers
);

/**
 * EXPORT AND REPORTING ENDPOINTS
 */

// Export analytics data
router.get('/export/:type',
  authMiddleware,
  param('type').isIn(['users', 'transactions', 'merchants', 'events', 'revenue']),
  formatValidation,
  dateRangeValidation,
  handleValidationErrors,
  analyticsController.exportAnalytics
);

// Generate custom reports
router.post('/reports/custom',
  authMiddleware,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  },
  rateLimiter.createCustomLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 custom reports per hour
    keyPrefix: 'custom_reports'
  }),
  analyticsController.generateCustomReport
);

// Schedule recurring reports
router.post('/reports/schedule',
  authMiddleware,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  },
  analyticsController.scheduleReport
);

// Get scheduled reports
router.get('/reports/scheduled',
  authMiddleware,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  },
  paginationValidation,
  handleValidationErrors,
  analyticsController.getScheduledReports
);

/**
 * ANALYTICS CONFIGURATION ENDPOINTS
 */

// Get analytics configuration
router.get('/config',
  authMiddleware,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  },
  analyticsController.getAnalyticsConfig
);

// Update analytics configuration
router.put('/config',
  authMiddleware,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  },
  analyticsController.updateAnalyticsConfig
);

/**
 * HEALTH AND MONITORING ENDPOINTS
 */

// Analytics service health check
router.get('/health',
  analyticsController.getHealthStatus
);

// Analytics cache status
router.get('/cache/status',
  authMiddleware,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  },
  analyticsController.getCacheStatus
);

// Clear analytics cache
router.delete('/cache',
  authMiddleware,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  },
  query('type').optional().isIn(['all', 'user', 'transaction', 'merchant', 'event']),
  handleValidationErrors,
  analyticsController.clearCache
);

/**
 * ERROR HANDLING
 */
router.use((error, req, res, next) => {
  console.error('Analytics route error:', error);
  res.status(500).json({
    success: false,
    message: 'Analytics service error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
  });
});

module.exports = router;
