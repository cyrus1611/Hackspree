const mongoose = require('mongoose');

/**
 * Audit Log Schema for Hackspree Wallet Application
 * Tracks all user actions and system events for security and compliance
 */
const auditLogSchema = new mongoose.Schema({
  // User identification
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // Some system actions may not have a user
    index: true
  },
  
  // Session and request identification
  sessionId: {
    type: String,
    required: false,
    index: true
  },
  
  requestId: {
    type: String,
    required: false,
    index: true
  },

  // Action details
  action: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
    index: true
  },

  // Resource information
  resourceType: {
    type: String,
    required: false,
    trim: true,
    enum: [
      'USER', 'WALLET', 'TRANSACTION', 'MERCHANT', 'EVENT', 
      'ADMIN', 'SYSTEM', 'PAYMENT', 'AUTHENTICATION', 'AUTHORIZATION'
    ],
    index: true
  },

  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false,
    index: true
  },

  // Request information
  method: {
    type: String,
    required: false,
    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    uppercase: true
  },

  endpoint: {
    type: String,
    required: false,
    trim: true,
    maxlength: 200
  },

  // Client information
  ipAddress: {
    type: String,
    required: false,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true;
        // Basic IP validation (IPv4 and IPv6)
        const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[1]?[0-9][0-9]?)$/;
        const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
        return ipv4Regex.test(v) || ipv6Regex.test(v);
      },
      message: 'Invalid IP address format'
    }
  },

  userAgent: {
    type: String,
    required: false,
    trim: true,
    maxlength: 500
  },

  // Geographic information
  location: {
    country: {
      type: String,
      required: false,
      trim: true,
      maxlength: 2 // ISO country code
    },
    region: {
      type: String,
      required: false,
      trim: true,
      maxlength: 100
    },
    city: {
      type: String,
      required: false,
      trim: true,
      maxlength: 100
    },
    coordinates: {
      latitude: {
        type: Number,
        min: -90,
        max: 90
      },
      longitude: {
        type: Number,
        min: -180,
        max: 180
      }
    }
  },

  // Device information
  device: {
    type: {
      type: String,
      enum: ['web', 'mobile', 'tablet', 'desktop', 'api', 'unknown'],
      default: 'unknown'
    },
    os: {
      type: String,
      trim: true,
      maxlength: 50
    },
    browser: {
      type: String,
      trim: true,
      maxlength: 50
    },
    version: {
      type: String,
      trim: true,
      maxlength: 20
    }
  },

  // Action result
  status: {
    type: String,
    required: true,
    enum: ['SUCCESS', 'FAILURE', 'WARNING', 'INFO', 'ERROR'],
    default: 'INFO',
    index: true
  },

  // HTTP status code (for API requests)
  statusCode: {
    type: Number,
    required: false,
    min: 100,
    max: 599
  },

  // Detailed information
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
    validate: {
      validator: function(v) {
        // Limit the size of details object to prevent excessive storage
        return JSON.stringify(v).length <= 10000; // 10KB limit
      },
      message: 'Details object is too large (max 10KB)'
    }
  },

  // Changes made (for update operations)
  changes: {
    before: {
      type: mongoose.Schema.Types.Mixed,
      required: false
    },
    after: {
      type: mongoose.Schema.Types.Mixed,
      required: false
    }
  },

  // Error information (for failed actions)
  error: {
    message: {
      type: String,
      trim: true,
      maxlength: 500
    },
    code: {
      type: String,
      trim: true,
      maxlength: 50
    },
    stack: {
      type: String,
      trim: true,
      maxlength: 2000
    }
  },

  // Performance metrics
  duration: {
    type: Number, // in milliseconds
    required: false,
    min: 0
  },

  // Risk assessment
  riskLevel: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'LOW',
    index: true
  },

  // Flags for security monitoring
  flags: {
    suspicious: {
      type: Boolean,
      default: false,
      index: true
    },
    automated: {
      type: Boolean,
      default: false
    },
    adminAction: {
      type: Boolean,
      default: false,
      index: true
    },
    systemGenerated: {
      type: Boolean,
      default: false
    }
  },

  // Compliance and retention
  category: {
    type: String,
    enum: [
      'AUTHENTICATION', 'AUTHORIZATION', 'DATA_ACCESS', 'DATA_MODIFICATION',
      'FINANCIAL_TRANSACTION', 'SECURITY_EVENT', 'SYSTEM_EVENT', 'USER_ACTION',
      'ADMIN_ACTION', 'API_ACCESS', 'COMPLIANCE', 'AUDIT'
    ],
    required: true,
    index: true
  },

  severity: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'LOW',
    index: true
  },

  // Retention policy
  retentionPeriod: {
    type: Number, // in days
    default: 2555, // 7 years for financial compliance
    min: 1
  },

  expiresAt: {
    type: Date,
    required: false,
    index: { expireAfterSeconds: 0 } // TTL index
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'auditlogs'
});

// Compound indexes for efficient querying
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, status: 1, createdAt: -1 });
auditLogSchema.index({ category: 1, severity: 1, createdAt: -1 });
auditLogSchema.index({ ipAddress: 1, createdAt: -1 });
auditLogSchema.index({ 'flags.suspicious': 1, createdAt: -1 });
auditLogSchema.index({ 'flags.adminAction': 1, createdAt: -1 });

// Text index for searching
auditLogSchema.index({
  action: 'text',
  endpoint: 'text',
  'details.description': 'text',
  'error.message': 'text'
});

// Pre-save middleware
auditLogSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Set expiration date based on retention period
  if (!this.expiresAt && this.retentionPeriod) {
    this.expiresAt = new Date(Date.now() + (this.retentionPeriod * 24 * 60 * 60 * 1000));
  }
  
  // Sanitize sensitive data in details
  if (this.details) {
    this.details = this.sanitizeSensitiveData(this.details);
  }
  
  next();
});

// Instance methods
auditLogSchema.methods.sanitizeSensitiveData = function(data) {
  if (!data || typeof data !== 'object') return data;
  
  const sensitiveFields = [
    'password', 'pin', 'token', 'secret', 'key', 'nonce',
    'authorization', 'cardNumber', 'cvv', 'ssn', 'bankAccount'
  ];
  
  const sanitized = JSON.parse(JSON.stringify(data));
  
  const sanitizeObject = (obj) => {
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      
      if (sensitiveFields.some(field => lowerKey.includes(field))) {
        obj[key] = '***REDACTED***';
      } else if (typeof value === 'object' && value !== null) {
        sanitizeObject(value);
      }
    }
  };
  
  sanitizeObject(sanitized);
  return sanitized;
};

auditLogSchema.methods.toSecureJSON = function() {
  const obj = this.toObject();
  
  // Remove sensitive information from public view
  delete obj.error?.stack;
  delete obj.__v;
  
  return obj;
};

// Static methods
auditLogSchema.statics.logAction = async function(logData) {
  try {
    const auditLog = new this(logData);
    return await auditLog.save();
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw error to prevent breaking the main operation
    return null;
  }
};

// Authentication events
auditLogSchema.statics.logAuth = async function({
  userId, action, status, ipAddress, userAgent, details = {}, sessionId, requestId
}) {
  return this.logAction({
    userId,
    action,
    category: 'AUTHENTICATION',
    status,
    ipAddress,
    userAgent,
    details,
    sessionId,
    requestId,
    riskLevel: status === 'FAILURE' ? 'HIGH' : 'LOW',
    severity: status === 'FAILURE' ? 'HIGH' : 'LOW'
  });
};

// Financial transaction events
auditLogSchema.statics.logTransaction = async function({
  userId, action, transactionId, amount, status, ipAddress, userAgent, details = {}
}) {
  return this.logAction({
    userId,
    action,
    resourceType: 'TRANSACTION',
    resourceId: transactionId,
    category: 'FINANCIAL_TRANSACTION',
    status,
    ipAddress,
    userAgent,
    details: { ...details, amount },
    riskLevel: amount > 10000 ? 'HIGH' : amount > 1000 ? 'MEDIUM' : 'LOW',
    severity: 'MEDIUM',
    retentionPeriod: 2555 // 7 years for financial records
  });
};

// Security events
auditLogSchema.statics.logSecurity = async function({
  userId, action, status, ipAddress, userAgent, details = {}, severity = 'HIGH'
}) {
  return this.logAction({
    userId,
    action,
    category: 'SECURITY_EVENT',
    status,
    ipAddress,
    userAgent,
    details,
    severity,
    riskLevel: 'HIGH',
    flags: { suspicious: true }
  });
};

// Admin actions
auditLogSchema.statics.logAdmin = async function({
  adminId, action, resourceType, resourceId, status, ipAddress, userAgent, changes, details = {}
}) {
  return this.logAction({
    userId: adminId,
    action,
    resourceType,
    resourceId,
    category: 'ADMIN_ACTION',
    status,
    ipAddress,
    userAgent,
    details,
    changes,
    flags: { adminAction: true },
    severity: 'HIGH',
    retentionPeriod: 2555 // Long retention for admin actions
  });
};

// System events
auditLogSchema.statics.logSystem = async function({
  action, status, details = {}, severity = 'LOW'
}) {
  return this.logAction({
    action,
    category: 'SYSTEM_EVENT',
    status,
    details,
    severity,
    flags: { systemGenerated: true }
  });
};

// Data access events
auditLogSchema.statics.logDataAccess = async function({
  userId, action, resourceType, resourceId, status, ipAddress, userAgent, details = {}
}) {
  return this.logAction({
    userId,
    action,
    resourceType,
    resourceId,
    category: 'DATA_ACCESS',
    status,
    ipAddress,
    userAgent,
    details,
    severity: 'LOW'
  });
};

// API access events
auditLogSchema.statics.logAPIAccess = async function({
  userId, method, endpoint, statusCode, duration, ipAddress, userAgent, details = {}
}) {
  return this.logAction({
    userId,
    action: `API_${method}`,
    method,
    endpoint,
    category: 'API_ACCESS',
    status: statusCode < 400 ? 'SUCCESS' : 'FAILURE',
    statusCode,
    duration,
    ipAddress,
    userAgent,
    details,
    severity: statusCode >= 500 ? 'HIGH' : statusCode >= 400 ? 'MEDIUM' : 'LOW'
  });
};

// Bulk operations
auditLogSchema.statics.logBulk = async function(logEntries) {
  try {
    return await this.insertMany(logEntries, { ordered: false });
  } catch (error) {
    console.error('Failed to create bulk audit logs:', error);
    return null;
  }
};

// Query helpers
auditLogSchema.statics.findByUser = function(userId, options = {}) {
  const query = this.find({ userId });
  
  if (options.startDate) query.where('createdAt').gte(options.startDate);
  if (options.endDate) query.where('createdAt').lte(options.endDate);
  if (options.action) query.where('action', options.action);
  if (options.status) query.where('status', options.status);
  if (options.category) query.where('category', options.category);
  
  return query.sort({ createdAt: -1 }).limit(options.limit || 100);
};

auditLogSchema.statics.findSuspicious = function(options = {}) {
  const query = this.find({ 'flags.suspicious': true });
  
  if (options.startDate) query.where('createdAt').gte(options.startDate);
  if (options.endDate) query.where('createdAt').lte(options.endDate);
  if (options.severity) query.where('severity', options.severity);
  
  return query.sort({ createdAt: -1 }).limit(options.limit || 100);
};

auditLogSchema.statics.getSecuritySummary = async function(timeframe = 24) {
  const startDate = new Date(Date.now() - (timeframe * 60 * 60 * 1000));
  
  return this.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: {
          category: '$category',
          status: '$status',
          severity: '$severity'
        },
        count: { $sum: 1 },
        latestEvent: { $max: '$createdAt' }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

// Cleanup expired logs
auditLogSchema.statics.cleanupExpired = async function() {
  try {
    const result = await this.deleteMany({
      expiresAt: { $lte: new Date() }
    });
    
    console.log(`Cleaned up ${result.deletedCount} expired audit log entries`);
    return result.deletedCount;
  } catch (error) {
    console.error('Failed to cleanup expired audit logs:', error);
    return 0;
  }
};

module.exports = mongoose.model('AuditLog', auditLogSchema);
