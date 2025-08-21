const mongoose = require('mongoose');
const Redis = require('redis');
const moment = require('moment');

// Import Models
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Merchant = require('../models/Merchant');
const Event = require('../models/Event');
const Club = require('../models/Club');
const AuditLog = require('../models/AuditLog');

/**
 * Comprehensive Analytics Service for Hackspree Wallet Application
 * 
 * Features:
 * - Real-time and historical analytics
 * - User behavior analysis and segmentation
 * - Financial transaction insights and trends
 * - Merchant performance and customer analytics
 * - Event participation and engagement metrics
 * - Club membership and activity tracking
 * - Advanced aggregation pipelines with caching
 * - Custom report generation and export
 * - Predictive analytics and forecasting
 * - Performance optimization with Redis caching
 */

class AnalyticsService {
  constructor() {
    this.redis = null;
    this.cacheEnabled = process.env.REDIS_CACHE_ENABLED === 'true';
    this.cacheTTL = parseInt(process.env.ANALYTICS_CACHE_TTL) || 3600; // 1 hour default
    
    if (this.cacheEnabled) {
      this.initializeRedis();
    }
  }

  /**
   * Initialize Redis connection for caching
   */
  async initializeRedis() {
    try {
      this.redis = Redis.createClient({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined
      });
      
      await this.redis.connect();
      console.log('Analytics Service: Redis connected for caching');
    } catch (error) {
      console.error('Analytics Service: Redis connection failed:', error.message);
      this.cacheEnabled = false;
    }
  }

  /**
   * Get cached data or execute query and cache result
   */
  async getCachedData(cacheKey, queryFunction, ttl = this.cacheTTL) {
    if (!this.cacheEnabled) {
      return await queryFunction();
    }

    try {
      const cachedData = await this.redis.get(cacheKey);
      if (cachedData) {
        return JSON.parse(cachedData);
      }

      const freshData = await queryFunction();
      await this.redis.setEx(cacheKey, ttl, JSON.stringify(freshData));
      return freshData;
    } catch (error) {
      console.error('Cache error:', error.message);
      return await queryFunction();
    }
  }

  /**
   * Generate cache key with parameters
   */
  generateCacheKey(prefix, params) {
    const keyParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|');
    return `analytics:${prefix}:${keyParams}`;
  }

  /**
   * Parse and validate date range parameters
   */
  parseDateRange(startDate, endDate, defaultDays = 30) {
    const end = endDate ? moment(endDate) : moment();
    const start = startDate ? moment(startDate) : moment().subtract(defaultDays, 'days');
    
    return {
      startDate: start.startOf('day').toDate(),
      endDate: end.endOf('day').toDate()
    };
  }

  /**
   * USER ANALYTICS METHODS
   */

  /**
   * Get comprehensive user overview analytics
   */
  async getUserOverview(params = {}) {
    const { startDate, endDate } = this.parseDateRange(params.startDate, params.endDate, 30);
    const cacheKey = this.generateCacheKey('user_overview', { startDate, endDate });

    return await this.getCachedData(cacheKey, async () => {
      const pipeline = [
        {
          $facet: {
            // Total user statistics
            totalStats: [
              {
                $group: {
                  _id: null,
                  totalUsers: { $sum: 1 },
                  activeUsers: { $sum: { $cond: ['$isActive', 1, 0] } },
                  verifiedEmails: { $sum: { $cond: ['$isEmailVerified', 1, 0] } },
                  verifiedPhones: { $sum: { $cond: ['$isPhoneVerified', 1, 0] } },
                  avgAge: { 
                    $avg: { 
                      $dateDiff: { 
                        startDate: '$dateOfBirth', 
                        endDate: new Date(), 
                        unit: 'year' 
                      } 
                    } 
                  }
                }
              }
            ],

            // User registration trends
            registrationTrends: [
              {
                $match: {
                  createdAt: { $gte: startDate, $lte: endDate }
                }
              },
              {
                $group: {
                  _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                  newUsers: { $sum: 1 }
                }
              },
              { $sort: { _id: 1 } }
            ],

            // User role distribution
            roleDistribution: [
              {
                $group: {
                  _id: '$role',
                  count: { $sum: 1 }
                }
              }
            ],

            // Geographic distribution
            geographicDistribution: [
              {
                $match: { 'address.country': { $exists: true } }
              },
              {
                $group: {
                  _id: {
                    country: '$address.country',
                    state: '$address.state'
                  },
                  count: { $sum: 1 }
                }
              },
              { $sort: { count: -1 } },
              { $limit: 10 }
            ]
          }
        }
      ];

      const [result] = await User.aggregate(pipeline);
      
      return {
        overview: result.totalStats[0] || {},
        trends: result.registrationTrends || [],
        roleDistribution: result.roleDistribution || [],
        geographicDistribution: result.geographicDistribution || [],
        generatedAt: new Date()
      };
    });
  }

  /**
   * Get user engagement and activity analytics
   */
  async getUserEngagementAnalytics(params = {}) {
    const { startDate, endDate } = this.parseDateRange(params.startDate, params.endDate, 30);
    const cacheKey = this.generateCacheKey('user_engagement', { startDate, endDate });

    return await this.getCachedData(cacheKey, async () => {
      // Get user activity from audit logs
      const activityPipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            userId: { $exists: true }
          }
        },
        {
          $group: {
            _id: {
              userId: '$userId',
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
            },
            actions: { $sum: 1 },
            uniqueActions: { $addToSet: '$action' }
          }
        },
        {
          $group: {
            _id: '$_id.userId',
            activeDays: { $sum: 1 },
            totalActions: { $sum: '$actions' },
            avgActionsPerDay: { $avg: '$actions' }
          }
        },
        {
          $group: {
            _id: null,
            totalActiveUsers: { $sum: 1 },
            avgActiveDaysPerUser: { $avg: '$activeDays' },
            avgActionsPerUser: { $avg: '$totalActions' }
          }
        }
      ];

      const [activityStats] = await AuditLog.aggregate(activityPipeline);

      // Get user retention cohort analysis
      const retentionPipeline = [
        {
          $match: {
            createdAt: { $gte: moment().subtract(90, 'days').toDate() }
          }
        },
        {
          $addFields: {
            registrationWeek: {
              $dateToString: {
                format: '%Y-W%U',
                date: '$createdAt'
              }
            }
          }
        },
        {
          $lookup: {
            from: 'auditlogs',
            let: { userId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$userId', '$$userId'] },
                  createdAt: { $gte: startDate, $lte: endDate }
                }
              },
              {
                $addFields: {
                  weeksSinceRegistration: {
                    $divide: [
                      { $subtract: ['$createdAt', '$$REMOVE'] },
                      7 * 24 * 60 * 60 * 1000
                    ]
                  }
                }
              }
            ],
            as: 'activities'
          }
        }
      ];

      return {
        engagement: activityStats || {},
        retention: [], // Would implement cohort analysis here
        generatedAt: new Date()
      };
    });
  }

  /**
   * TRANSACTION ANALYTICS METHODS
   */

  /**
   * Get comprehensive transaction analytics
   */
  async getTransactionAnalytics(params = {}) {
    const { startDate, endDate } = this.parseDateRange(params.startDate, params.endDate, 30);
    const { type, status, category } = params;
    const cacheKey = this.generateCacheKey('transaction_analytics', { startDate, endDate, type, status, category });

    return await this.getCachedData(cacheKey, async () => {
      const matchConditions = {
        createdAt: { $gte: startDate, $lte: endDate }
      };

      if (type && type !== 'all') matchConditions.type = type;
      if (status && status !== 'all') matchConditions.status = status;
      if (category && category !== 'all') matchConditions.category = category;

      const pipeline = [
        { $match: matchConditions },
        {
          $facet: {
            // Overall statistics
            overview: [
              {
                $group: {
                  _id: null,
                  totalTransactions: { $sum: 1 },
                  totalVolume: { $sum: '$amount' },
                  avgTransactionAmount: { $avg: '$amount' },
                  maxTransactionAmount: { $max: '$amount' },
                  minTransactionAmount: { $min: '$amount' },
                  successfulTransactions: {
                    $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] }
                  },
                  failedTransactions: {
                    $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] }
                  }
                }
              },
              {
                $addFields: {
                  successRate: {
                    $multiply: [
                      { $divide: ['$successfulTransactions', '$totalTransactions'] },
                      100
                    ]
                  },
                  failureRate: {
                    $multiply: [
                      { $divide: ['$failedTransactions', '$totalTransactions'] },
                      100
                    ]
                  }
                }
              }
            ],

            // Daily trends
            dailyTrends: [
              {
                $group: {
                  _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                  transactionCount: { $sum: 1 },
                  totalAmount: { $sum: '$amount' },
                  avgAmount: { $avg: '$amount' },
                  successfulCount: {
                    $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] }
                  }
                }
              },
              { $sort: { _id: 1 } }
            ],

            // Hourly distribution
            hourlyDistribution: [
              {
                $group: {
                  _id: { $hour: '$createdAt' },
                  transactionCount: { $sum: 1 },
                  totalAmount: { $sum: '$amount' }
                }
              },
              { $sort: { _id: 1 } }
            ],

            // Transaction type breakdown
            typeBreakdown: [
              {
                $group: {
                  _id: '$type',
                  count: { $sum: 1 },
                  totalAmount: { $sum: '$amount' },
                  avgAmount: { $avg: '$amount' }
                }
              }
            ],

            // Category breakdown
            categoryBreakdown: [
              {
                $group: {
                  _id: '$category',
                  count: { $sum: 1 },
                  totalAmount: { $sum: '$amount' },
                  avgAmount: { $avg: '$amount' }
                }
              },
              { $sort: { totalAmount: -1 } }
            ],

            // Status distribution
            statusDistribution: [
              {
                $group: {
                  _id: '$status',
                  count: { $sum: 1 },
                  percentage: { $sum: 1 }
                }
              }
            ],

            // Top merchants by transaction volume
            topMerchants: [
              {
                $match: { 'metadata.merchantId': { $exists: true } }
              },
              {
                $group: {
                  _id: '$metadata.merchantId',
                  transactionCount: { $sum: 1 },
                  totalAmount: { $sum: '$amount' }
                }
              },
              { $sort: { totalAmount: -1 } },
              { $limit: 10 },
              {
                $lookup: {
                  from: 'merchants',
                  localField: '_id',
                  foreignField: '_id',
                  as: 'merchantInfo'
                }
              }
            ]
          }
        }
      ];

      const [result] = await Transaction.aggregate(pipeline);

      // Calculate status percentages
      const totalTransactions = result.overview[0]?.totalTransactions || 1;
      result.statusDistribution = result.statusDistribution.map(item => ({
        ...item,
        percentage: ((item.count / totalTransactions) * 100).toFixed(2)
      }));

      return {
        ...result,
        dateRange: { startDate, endDate },
        generatedAt: new Date()
      };
    });
  }

  /**
   * Get transaction flow analysis
   */
  async getTransactionFlowAnalytics(params = {}) {
    const { startDate, endDate } = this.parseDateRange(params.startDate, params.endDate, 30);
    const cacheKey = this.generateCacheKey('transaction_flow', { startDate, endDate });

    return await this.getCachedData(cacheKey, async () => {
      const pipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            status: 'COMPLETED'
          }
        },
        {
          $group: {
            _id: {
              from: '$type',
              to: '$category'
            },
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        },
        {
          $group: {
            _id: null,
            flows: {
              $push: {
                source: '$_id.from',
                target: '$_id.to',
                value: '$totalAmount',
                count: '$count'
              }
            }
          }
        }
      ];

      const [result] = await Transaction.aggregate(pipeline);
      return result?.flows || [];
    });
  }

  /**
   * WALLET ANALYTICS METHODS
   */

  /**
   * Get comprehensive wallet analytics
   */
  async getWalletAnalytics(params = {}) {
    const { userId } = params;
    const cacheKey = this.generateCacheKey('wallet_analytics', { userId: userId || 'all' });

    return await this.getCachedData(cacheKey, async () => {
      const matchConditions = userId ? { userId: new mongoose.Types.ObjectId(userId) } : {};

      const pipeline = [
        { $match: matchConditions },
        {
          $facet: {
            // Overall wallet statistics
            overview: [
              {
                $group: {
                  _id: null,
                  totalWallets: { $sum: 1 },
                  activeWallets: { $sum: { $cond: ['$isActive', 1, 0] } },
                  totalBalance: { $sum: '$balance' },
                  avgBalance: { $avg: '$balance' },
                  maxBalance: { $max: '$balance' },
                  minBalance: { $min: '$balance' },
                  walletsWithPIN: { $sum: { $cond: ['$pin.isSet', 1, 0] } }
                }
              }
            ],

            // Balance distribution
            balanceDistribution: [
              {
                $bucket: {
                  groupBy: '$balance',
                  boundaries: [0, 50, 100, 250, 500, 1000, 5000, 10000],
                  default: '10000+',
                  output: {
                    count: { $sum: 1 },
                    totalBalance: { $sum: '$balance' }
                  }
                }
              }
            ],

            // Currency distribution
            currencyDistribution: [
              {
                $group: {
                  _id: '$currency',
                  count: { $sum: 1 },
                  totalBalance: { $sum: '$balance' }
                }
              }
            ],

            // Wallet creation trends
            creationTrends: [
              {
                $group: {
                  _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
                  walletsCreated: { $sum: 1 }
                }
              },
              { $sort: { _id: 1 } }
            ]
          }
        }
      ];

      const [result] = await Wallet.aggregate(pipeline);
      return {
        ...result,
        generatedAt: new Date()
      };
    });
  }

  /**
   * Get wallet performance metrics
   */
  async getWalletPerformanceAnalytics(userId, params = {}) {
    const { startDate, endDate } = this.parseDateRange(params.startDate, params.endDate, 30);
    const cacheKey = this.generateCacheKey('wallet_performance', { userId, startDate, endDate });

    return await this.getCachedData(cacheKey, async () => {
      // Get wallet information
      const wallet = await Wallet.findOne({ userId: new mongoose.Types.ObjectId(userId) });
      if (!wallet) return null;

      // Get transaction history for balance timeline
      const transactionPipeline = [
        {
          $match: {
            walletId: wallet._id,
            createdAt: { $gte: startDate, $lte: endDate },
            status: 'COMPLETED'
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            transactions: { $sum: 1 },
            totalCredit: {
              $sum: { $cond: [{ $eq: ['$type', 'CREDIT'] }, '$amount', 0] }
            },
            totalDebit: {
              $sum: { $cond: [{ $eq: ['$type', 'DEBIT'] }, '$amount', 0] }
            },
            netChange: {
              $sum: {
                $cond: [
                  { $eq: ['$type', 'CREDIT'] },
                  '$amount',
                  { $multiply: ['$amount', -1] }
                ]
              }
            }
          }
        },
        { $sort: { _id: 1 } }
      ];

      const transactionHistory = await Transaction.aggregate(transactionPipeline);

      // Calculate running balance
      let runningBalance = wallet.balance;
      const balanceTimeline = transactionHistory.reverse().map(day => {
        runningBalance -= day.netChange;
        return {
          date: day._id,
          balance: runningBalance,
          transactions: day.transactions,
          credit: day.totalCredit,
          debit: day.totalDebit,
          netChange: day.netChange
        };
      }).reverse();

      return {
        wallet: {
          id: wallet._id,
          currentBalance: wallet.balance,
          currency: wallet.currency,
          isActive: wallet.isActive
        },
        performance: {
          balanceTimeline,
          totalTransactions: transactionHistory.reduce((sum, day) => sum + day.transactions, 0),
          totalCredits: transactionHistory.reduce((sum, day) => sum + day.totalCredit, 0),
          totalDebits: transactionHistory.reduce((sum, day) => sum + day.totalDebit, 0),
          netChange: transactionHistory.reduce((sum, day) => sum + day.netChange, 0)
        },
        generatedAt: new Date()
      };
    });
  }

  /**
   * MERCHANT ANALYTICS METHODS
   */

  /**
   * Get comprehensive merchant analytics
   */
  async getMerchantAnalytics(params = {}) {
    const { merchantId, category, startDate, endDate } = params;
    const dateRange = this.parseDateRange(startDate, endDate, 30);
    const cacheKey = this.generateCacheKey('merchant_analytics', { 
      merchantId: merchantId || 'all', 
      category: category || 'all',
      ...dateRange 
    });

    return await this.getCachedData(cacheKey, async () => {
      const matchConditions = {};
      if (merchantId) matchConditions._id = new mongoose.Types.ObjectId(merchantId);
      if (category) matchConditions.category = category;

      const pipeline = [
        { $match: matchConditions },
        {
          $facet: {
            // Overall merchant statistics
            overview: [
              {
                $group: {
                  _id: null,
                  totalMerchants: { $sum: 1 },
                  activeMerchants: { $sum: { $cond: ['$isActive', 1, 0] } },
                  verifiedMerchants: { 
                    $sum: { $cond: [{ $eq: ['$verification.status', 'verified'] }, 1, 0] } 
                  },
                  featuredMerchants: { $sum: { $cond: ['$isFeatured', 1, 0] } }
                }
              }
            ],

            // Category distribution
            categoryDistribution: [
              {
                $group: {
                  _id: '$category',
                  count: { $sum: 1 }
                }
              },
              { $sort: { count: -1 } }
            ],

            // Verification status distribution
            verificationStatus: [
              {
                $group: {
                  _id: '$verification.status',
                  count: { $sum: 1 }
                }
              }
            ],

            // Geographic distribution
            locationDistribution: [
              {
                $group: {
                  _id: {
                    country: '$location.country',
                    state: '$location.state',
                    city: '$location.city'
                  },
                  count: { $sum: 1 }
                }
              },
              { $sort: { count: -1 } },
              { $limit: 20 }
            ]
          }
        }
      ];

      const [merchantStats] = await Merchant.aggregate(pipeline);

      // Get transaction statistics for merchants
      const transactionMatchConditions = {
        'metadata.merchantId': { $exists: true },
        createdAt: { $gte: dateRange.startDate, $lte: dateRange.endDate }
      };

      if (merchantId) {
        transactionMatchConditions['metadata.merchantId'] = new mongoose.Types.ObjectId(merchantId);
      }

      const transactionPipeline = [
        { $match: transactionMatchConditions },
        {
          $group: {
            _id: '$metadata.merchantId',
            totalRevenue: { $sum: '$amount' },
            transactionCount: { $sum: 1 },
            avgTransactionValue: { $avg: '$amount' },
            uniqueCustomers: { $addToSet: '$userId' }
          }
        },
        {
          $addFields: {
            uniqueCustomerCount: { $size: '$uniqueCustomers' }
          }
        },
        {
          $lookup: {
            from: 'merchants',
            localField: '_id',
            foreignField: '_id',
            as: 'merchantInfo'
          }
        },
        {
          $unwind: '$merchantInfo'
        },
        {
          $sort: { totalRevenue: -1 }
        },
        {
          $limit: 50
        }
      ];

      const merchantTransactionStats = await Transaction.aggregate(transactionPipeline);

      return {
        merchantOverview: merchantStats,
        topPerformingMerchants: merchantTransactionStats,
        dateRange,
        generatedAt: new Date()
      };
    });
  }

  /**
   * Get merchant performance dashboard
   */
  async getMerchantPerformanceDashboard(merchantId, params = {}) {
    const { startDate, endDate } = this.parseDateRange(params.startDate, params.endDate, 30);
    const cacheKey = this.generateCacheKey('merchant_performance', { merchantId, startDate, endDate });

    return await this.getCachedData(cacheKey, async () => {
      const merchant = await Merchant.findById(merchantId);
      if (!merchant) return null;

      const transactionPipeline = [
        {
          $match: {
            'metadata.merchantId': new mongoose.Types.ObjectId(merchantId),
            createdAt: { $gte: startDate, $lte: endDate },
            status: 'COMPLETED'
          }
        },
        {
          $facet: {
            // Daily sales trends
            dailySales: [
              {
                $group: {
                  _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                  revenue: { $sum: '$amount' },
                  transactionCount: { $sum: 1 },
                  uniqueCustomers: { $addToSet: '$userId' }
                }
              },
              {
                $addFields: {
                  uniqueCustomerCount: { $size: '$uniqueCustomers' }
                }
              },
              { $sort: { _id: 1 } }
            ],

            // Customer analytics
            customerAnalytics: [
              {
                $group: {
                  _id: '$userId',
                  totalSpent: { $sum: '$amount' },
                  transactionCount: { $sum: 1 },
                  firstTransaction: { $min: '$createdAt' },
                  lastTransaction: { $max: '$createdAt' }
                }
              },
              {
                $group: {
                  _id: null,
                  totalCustomers: { $sum: 1 },
                  avgSpendPerCustomer: { $avg: '$totalSpent' },
                  avgTransactionsPerCustomer: { $avg: '$transactionCount' },
                  returningCustomers: {
                    $sum: { $cond: [{ $gt: ['$transactionCount', 1] }, 1, 0] }
                  }
                }
              },
              {
                $addFields: {
                  customerRetentionRate: {
                    $multiply: [
                      { $divide: ['$returningCustomers', '$totalCustomers'] },
                      100
                    ]
                  }
                }
              }
            ],

            // Peak hours analysis
            hourlyAnalysis: [
              {
                $group: {
                  _id: { $hour: '$createdAt' },
                  revenue: { $sum: '$amount' },
                  transactionCount: { $sum: 1 }
                }
              },
              { $sort: { _id: 1 } }
            ]
          }
        }
      ];

      const [transactionAnalytics] = await Transaction.aggregate(transactionPipeline);

      return {
        merchant: {
          id: merchant._id,
          name: merchant.businessName,
          category: merchant.category,
          verificationStatus: merchant.verification.status,
          isActive: merchant.isActive
        },
        performance: transactionAnalytics,
        dateRange: { startDate, endDate },
        generatedAt: new Date()
      };
    });
  }

  /**
   * EVENT ANALYTICS METHODS
   */

  /**
   * Get event analytics overview
   */
  async getEventAnalytics(params = {}) {
    const { eventId, category, startDate, endDate } = params;
    const dateRange = this.parseDateRange(startDate, endDate, 30);
    const cacheKey = this.generateCacheKey('event_analytics', { 
      eventId: eventId || 'all',
      category: category || 'all',
      ...dateRange 
    });

    return await this.getCachedData(cacheKey, async () => {
      const matchConditions = {
        'schedule.startDate': { $gte: dateRange.startDate, $lte: dateRange.endDate }
      };

      if (eventId) matchConditions._id = new mongoose.Types.ObjectId(eventId);
      if (category) matchConditions.category = category;

      const pipeline = [
        { $match: matchConditions },
        {
          $facet: {
            // Overall event statistics
            overview: [
              {
                $group: {
                  _id: null,
                  totalEvents: { $sum: 1 },
                  activeEvents: { $sum: { $cond: ['$isActive', 1, 0] } },
                  freeEvents: { 
                    $sum: { $cond: [{ $eq: ['$pricing.type', 'free'] }, 1, 0] } 
                  },
                  paidEvents: { 
                    $sum: { $cond: [{ $eq: ['$pricing.type', 'paid'] }, 1, 0] } 
                  },
                  avgPrice: { $avg: '$pricing.amount' }
                }
              }
            ],

            // Category distribution
            categoryDistribution: [
              {
                $group: {
                  _id: '$category',
                  count: { $sum: 1 },
                  avgPrice: { $avg: '$pricing.amount' }
                }
              },
              { $sort: { count: -1 } }
            ],

            // Location type distribution
            locationTypeDistribution: [
              {
                $group: {
                  _id: '$location.type',
                  count: { $sum: 1 }
                }
              }
            ],

            // Monthly event trends
            monthlyTrends: [
              {
                $group: {
                  _id: { 
                    $dateToString: { format: '%Y-%m', date: '$schedule.startDate' } 
                  },
                  eventCount: { $sum: 1 },
                  totalCapacity: { $sum: '$capacity.maxParticipants' }
                }
              },
              { $sort: { _id: 1 } }
            ]
          }
        }
      ];

      const [eventStats] = await Event.aggregate(pipeline);

      // Get event participation data from transactions
      const participationPipeline = [
        {
          $match: {
            'metadata.eventId': { $exists: true },
            createdAt: { $gte: dateRange.startDate, $lte: dateRange.endDate },
            status: 'COMPLETED'
          }
        },
        {
          $group: {
            _id: '$metadata.eventId',
            participantCount: { $sum: 1 },
            totalRevenue: { $sum: '$amount' },
            uniqueParticipants: { $addToSet: '$userId' }
          }
        },
        {
          $addFields: {
            uniqueParticipantCount: { $size: '$uniqueParticipants' }
          }
        },
        {
          $lookup: {
            from: 'events',
            localField: '_id',
            foreignField: '_id',
            as: 'eventInfo'
          }
        },
        {
          $unwind: '$eventInfo'
        },
        {
          $addFields: {
            occupancyRate: {
              $multiply: [
                { 
                  $divide: [
                    '$uniqueParticipantCount', 
                    { $ifNull: ['$eventInfo.capacity.maxParticipants', 1] }
                  ] 
                },
                100
              ]
            }
          }
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 20 }
      ];

      const participationStats = await Transaction.aggregate(participationPipeline);

      return {
        eventOverview: eventStats,
        topEvents: participationStats,
        dateRange,
        generatedAt: new Date()
      };
    });
  }

  /**
   * CLUB ANALYTICS METHODS
   */

  /**
   * Get club analytics overview
   */
  async getClubAnalytics(params = {}) {
    const { clubId, category } = params;
    const cacheKey = this.generateCacheKey('club_analytics', { 
      clubId: clubId || 'all',
      category: category || 'all'
    });

    return await this.getCachedData(cacheKey, async () => {
      const matchConditions = {};
      if (clubId) matchConditions._id = new mongoose.Types.ObjectId(clubId);
      if (category) matchConditions.category = category;

      const pipeline = [
        { $match: matchConditions },
        {
          $facet: {
            // Overall club statistics
            overview: [
              {
                $group: {
                  _id: null,
                  totalClubs: { $sum: 1 },
                  activeClubs: { $sum: { $cond: ['$status', 1, 0] } },
                  verifiedClubs: { $sum: { $cond: ['$isVerified', 1, 0] } },
                  publicClubs: { 
                    $sum: { $cond: [
                      { $eq: ['$settings.privacy.visibility', 'public'] }, 1, 0
                    ] }
                  },
                  totalMembers: { $sum: '$statistics.totalMembers' },
                  avgMembersPerClub: { $avg: '$statistics.totalMembers' }
                }
              }
            ],

            // Category distribution
            categoryDistribution: [
              {
                $group: {
                  _id: '$category',
                  count: { $sum: 1 },
                  totalMembers: { $sum: '$statistics.totalMembers' }
                }
              },
              { $sort: { count: -1 } }
            ],

            // Member distribution
            membershipDistribution: [
              {
                $bucket: {
                  groupBy: '$statistics.totalMembers',
                  boundaries: [0, 10, 25, 50, 100, 250, 500],
                  default: '500+',
                  output: {
                    clubCount: { $sum: 1 },
                    totalMembers: { $sum: '$statistics.totalMembers' }
                  }
                }
              }
            ],

            // Most active clubs
            mostActiveClubs: [
              { $sort: { 'statistics.lastActivityAt': -1 } },
              { $limit: 10 },
              {
                $project: {
                  name: 1,
                  category: 1,
                  'statistics.totalMembers': 1,
                  'statistics.activeMembers': 1,
                  'statistics.lastActivityAt': 1
                }
              }
            ]
          }
        }
      ];

      const [result] = await Club.aggregate(pipeline);
      return {
        ...result,
        generatedAt: new Date()
      };
    });
  }

  /**
   * PREDICTIVE ANALYTICS METHODS
   */

  /**
   * Get revenue forecasting
   */
  async getRevenueForecast(params = {}) {
    const { months = 3 } = params;
    const cacheKey = this.generateCacheKey('revenue_forecast', { months });

    return await this.getCachedData(cacheKey, async () => {
      // Get historical revenue data for the last 12 months
      const historicalStartDate = moment().subtract(12, 'months').startOf('month').toDate();
      const historicalEndDate = moment().endOf('month').toDate();

      const historicalPipeline = [
        {
          $match: {
            createdAt: { $gte: historicalStartDate, $lte: historicalEndDate },
            status: 'COMPLETED',
            type: 'CREDIT'
          }
        },
        {
          $group: {
            _id: { 
              $dateToString: { format: '%Y-%m', date: '$createdAt' } 
            },
            revenue: { $sum: '$amount' },
            transactionCount: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ];

      const historicalData = await Transaction.aggregate(historicalPipeline);

      // Simple linear regression for revenue forecasting
      const forecast = this.calculateLinearForecast(historicalData, months);

      return {
        historical: historicalData,
        forecast: forecast,
        generatedAt: new Date()
      };
    }, 1800); // Cache for 30 minutes
  }

  /**
   * Calculate linear forecast (simplified)
   */
  calculateLinearForecast(historicalData, months) {
    if (historicalData.length < 2) return [];

    const revenues = historicalData.map(d => d.revenue);
    const n = revenues.length;
    
    // Simple linear trend calculation
    const sumX = (n * (n - 1)) / 2;
    const sumY = revenues.reduce((a, b) => a + b, 0);
    const sumXY = revenues.reduce((sum, y, i) => sum + (i * y), 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    const forecast = [];
    const lastMonth = moment(historicalData[historicalData.length - 1]._id);
    
    for (let i = 1; i <= months; i++) {
      const forecastMonth = lastMonth.clone().add(i, 'month');
      const predictedRevenue = Math.max(0, intercept + slope * (n + i - 1));
      
      forecast.push({
        month: forecastMonth.format('YYYY-MM'),
        predictedRevenue: Math.round(predictedRevenue * 100) / 100,
        confidence: Math.max(0.5, 1 - (i * 0.1)) // Decreasing confidence
      });
    }
    
    return forecast;
  }

  /**
   * UTILITY METHODS
   */

  /**
   * Clear all analytics cache
   */
  async clearCache(pattern = 'analytics:*') {
    if (!this.cacheEnabled) return;

    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(keys);
        console.log(`Cleared ${keys.length} analytics cache keys`);
      }
    } catch (error) {
      console.error('Error clearing analytics cache:', error.message);
    }
  }

  /**
   * Get cache status
   */
  async getCacheStatus() {
    if (!this.cacheEnabled) {
      return { enabled: false, message: 'Cache disabled' };
    }

    try {
      const info = await this.redis.info('memory');
      const keys = await this.redis.keys('analytics:*');
      
      return {
        enabled: true,
        connected: this.redis.isReady,
        totalKeys: keys.length,
        memoryInfo: info
      };
    } catch (error) {
      return {
        enabled: true,
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Export analytics data to CSV
   */
  async exportToCSV(data, filename) {
    // Implementation would depend on your CSV export library
    // This is a placeholder for the export functionality
    console.log(`Exporting analytics data to ${filename}.csv`);
    return { success: true, filename: `${filename}.csv` };
  }
}

module.exports = new AnalyticsService();
