const winston = require('winston');
const path = require('path');
const fs = require('fs');
const morgan = require('morgan');
const crypto = require('crypto');

/**
 * Ensure logs directory exists
 */
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Custom Winston Configuration
 */
const logConfiguration = {
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.prettyPrint()
  ),
  defaultMeta: {
    service: 'hackspree-wallet',
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
        })
      )
    }),

    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'app.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),

    // Separate file for errors
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),

    // Security events log
    new winston.transports.File({
      filename: path.join(logsDir, 'security.log'),
      level: 'warn',
      maxsize: 5242880, // 5MB
      maxFiles: 10,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ],

  // Handle exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log')
    })
  ],

  // Handle rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log')
    })
  ]
};

/**
 * Create Winston Logger Instance
 */
const logger = winston.createLogger(logConfiguration);

/**
 * Request ID Generator
 */
const generateRequestId = () => {
  return crypto.randomBytes(16).toString('hex');
};

/**
 * Sanitize Sensitive Data
 */
const sanitizeData = (data) => {
  if (!data || typeof data !== 'object') return data;

  const sensitiveFields = [
    'password', 'token', 'authorization', 'nonce', 'pin', 'secret', 
    'key', 'apikey', 'api_key', 'access_token', 'refresh_token',
    'squarePaymentId', 'cardNumber', 'cvv', 'ssn'
  ];

  const sanitized = Array.isArray(data) ? [] : {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    
    if (sensitiveFields.some(field => lowerKey.includes(field))) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
};

/**
 * Get Client IP Address
 */
const getClientIP = (req) => {
  return req.ip || 
         req.connection?.remoteAddress || 
         req.socket?.remoteAddress ||
         req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         'unknown';
};

/**
 * Get User Agent Info
 */
const getUserAgent = (req) => {
  const userAgent = req.get('User-Agent') || 'unknown';
  return {
    raw: userAgent,
    isMobile: /Mobile|Android|iPhone|iPad/.test(userAgent),
    isBot: /bot|crawler|spider/i.test(userAgent)
  };
};

/**
 * Request Logger Middleware
 */
const requestLogger = (req, res, next) => {
  // Generate unique request ID
  req.id = generateRequestId();
  res.setHeader('X-Request-ID', req.id);

  // Start time for performance tracking
  req.startTime = Date.now();

  // Log request details
  const requestInfo = {
    requestId: req.id,
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    ip: getClientIP(req),
    userAgent: getUserAgent(req),
    headers: sanitizeData(req.headers),
    query: sanitizeData(req.query),
    body: sanitizeData(req.body),
    userId: req.userId || null,
    timestamp: new Date().toISOString(),
    protocol: req.protocol,
    httpVersion: req.httpVersion
  };

  logger.info('Incoming Request', requestInfo);

  // Store original end function
  const originalEnd = res.end;

  // Override res.end to log response
  res.end = function(chunk, encoding) {
    const duration = Date.now() - req.startTime;
    
    const responseInfo = {
      requestId: req.id,
      statusCode: res.statusCode,
      statusMessage: res.statusMessage,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length') || 0,
      headers: sanitizeData(res.getHeaders()),
      timestamp: new Date().toISOString()
    };

    // Log based on status code
    if (res.statusCode >= 500) {
      logger.error('Server Error Response', responseInfo);
    } else if (res.statusCode >= 400) {
      logger.warn('Client Error Response', responseInfo);
    } else {
      logger.info('Successful Response', responseInfo);
    }

    // Call original end function
    originalEnd.call(this, chunk, encoding);
  };

  next();
};

/**
 * Morgan Configuration for HTTP Requests
 */
const morganFormat = ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms';

const morganLogger = morgan(morganFormat, {
  stream: {
    write: (message) => {
      logger.info('HTTP Request', { message: message.trim() });
    }
  },
  skip: (req, res) => {
    // Skip logging for health checks and static assets
    return req.url === '/health' || 
           req.url === '/favicon.ico' ||
           req.url.startsWith('/static/');
  }
});

/**
 * Security Event Logger
 */
const securityLogger = {
  logAuthAttempt: (req, success, userId = null, reason = null) => {
    logger.warn('Authentication Attempt', {
      success,
      userId,
      reason,
      ip: getClientIP(req),
      userAgent: getUserAgent(req),
      timestamp: new Date().toISOString(),
      requestId: req.id
    });
  },

  logSuspiciousActivity: (req, activity, details = {}) => {
    logger.warn('Suspicious Activity', {
      activity,
      details,
      ip: getClientIP(req),
      userAgent: getUserAgent(req),
      userId: req.userId || null,
      timestamp: new Date().toISOString(),
      requestId: req.id
    });
  },

  logRateLimitExceeded: (req, limit, window) => {
    logger.warn('Rate Limit Exceeded', {
      limit,
      window,
      ip: getClientIP(req),
      userAgent: getUserAgent(req),
      timestamp: new Date().toISOString(),
      requestId: req.id
    });
  },

  logPaymentEvent: (req, event, transactionId, amount, status) => {
    logger.info('Payment Event', {
      event,
      transactionId,
      amount,
      status,
      userId: req.userId,
      ip: getClientIP(req),
      timestamp: new Date().toISOString(),
      requestId: req.id
    });
  },

  logWalletEvent: (req, event, walletId, previousBalance, newBalance) => {
    logger.info('Wallet Event', {
      event,
      walletId,
      previousBalance,
      newBalance,
      balanceChange: newBalance - previousBalance,
      userId: req.userId,
      ip: getClientIP(req),
      timestamp: new Date().toISOString(),
      requestId: req.id
    });
  },

  logAdminAction: (req, action, targetResource, targetId = null) => {
    logger.warn('Admin Action', {
      action,
      targetResource,
      targetId,
      adminId: req.userId,
      adminEmail: req.user?.email,
      ip: getClientIP(req),
      timestamp: new Date().toISOString(),
      requestId: req.id
    });
  }
};

/**
 * Transaction Logger
 */
const transactionLogger = {
  logTransactionCreated: (transactionData) => {
    logger.info('Transaction Created', {
      transactionId: transactionData.transactionId,
      userId: transactionData.userId,
      amount: transactionData.amount,
      type: transactionData.type,
      category: transactionData.category,
      timestamp: new Date().toISOString()
    });
  },

  logTransactionCompleted: (transactionData) => {
    logger.info('Transaction Completed', {
      transactionId: transactionData.transactionId,
      userId: transactionData.userId,
      amount: transactionData.amount,
      finalStatus: transactionData.status,
      duration: transactionData.completedAt - transactionData.createdAt,
      timestamp: new Date().toISOString()
    });
  },

  logTransactionFailed: (transactionData, error) => {
    logger.error('Transaction Failed', {
      transactionId: transactionData.transactionId,
      userId: transactionData.userId,
      amount: transactionData.amount,
      error: error.message,
      errorCode: error.code,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Performance Logger
 */
const performanceLogger = {
  logSlowQuery: (query, duration, collection = null) => {
    if (duration > 1000) { // Log queries taking more than 1 second
      logger.warn('Slow Database Query', {
        query: sanitizeData(query),
        duration: `${duration}ms`,
        collection,
        timestamp: new Date().toISOString()
      });
    }
  },

  logSlowRequest: (req, res, duration) => {
    if (duration > 5000) { // Log requests taking more than 5 seconds
      logger.warn('Slow Request', {
        requestId: req.id,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      });
    }
  },

  logMemoryUsage: () => {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    logger.info('System Performance', {
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`
      },
      cpu: {
        user: `${cpuUsage.user}μs`,
        system: `${cpuUsage.system}μs`
      },
      uptime: `${Math.round(process.uptime())}s`,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * API Response Logger
 */
const apiLogger = {
  logAPICall: (req, endpoint, method, statusCode, duration) => {
    logger.info('API Call', {
      endpoint,
      method,
      statusCode,
      duration: `${duration}ms`,
      ip: getClientIP(req),
      userId: req.userId || null,
      timestamp: new Date().toISOString(),
      requestId: req.id
    });
  },

  logAPIError: (req, endpoint, error) => {
    logger.error('API Error', {
      endpoint,
      method: req.method,
      error: error.message,
      errorCode: error.code,
      stack: error.stack,
      ip: getClientIP(req),
      userId: req.userId || null,
      timestamp: new Date().toISOString(),
      requestId: req.id
    });
  }
};

/**
 * Middleware for logging errors
 */
const errorLogger = (error, req, res, next) => {
  const errorInfo = {
    requestId: req.id,
    error: {
      message: error.message,
      name: error.name,
      code: error.code || error.statusCode,
      stack: error.stack
    },
    request: {
      method: req.method,
      url: req.originalUrl,
      headers: sanitizeData(req.headers),
      body: sanitizeData(req.body),
      params: req.params,
      query: sanitizeData(req.query)
    },
    user: {
      id: req.userId || null,
      ip: getClientIP(req),
      userAgent: getUserAgent(req)
    },
    timestamp: new Date().toISOString()
  };

  logger.error('Application Error', errorInfo);
  next(error);
};

/**
 * Structured Logging Helper
 */
const structuredLogger = {
  info: (message, meta = {}) => {
    logger.info(message, { ...meta, timestamp: new Date().toISOString() });
  },

  warn: (message, meta = {}) => {
    logger.warn(message, { ...meta, timestamp: new Date().toISOString() });
  },

  error: (message, meta = {}) => {
    logger.error(message, { ...meta, timestamp: new Date().toISOString() });
  },

  debug: (message, meta = {}) => {
    logger.debug(message, { ...meta, timestamp: new Date().toISOString() });
  }
};

/**
 * Log Rotation and Cleanup
 */
const logMaintenance = {
  cleanupOldLogs: () => {
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    const now = Date.now();

    fs.readdir(logsDir, (err, files) => {
      if (err) return;

      files.forEach((file) => {
        const filePath = path.join(logsDir, file);
        fs.stat(filePath, (err, stats) => {
          if (err) return;
          
          if (now - stats.mtime.getTime() > maxAge) {
            fs.unlink(filePath, (err) => {
              if (!err) {
                logger.info('Old log file cleaned up', { file });
              }
            });
          }
        });
      });
    });
  },

  // Run cleanup daily
  startCleanupSchedule: () => {
    setInterval(() => {
      logMaintenance.cleanupOldLogs();
    }, 24 * 60 * 60 * 1000); // Run daily
  }
};

/**
 * Performance Monitoring Setup
 */
const setupPerformanceMonitoring = () => {
  // Log system performance every 5 minutes
  setInterval(() => {
    performanceLogger.logMemoryUsage();
  }, 5 * 60 * 1000);

  // Start log cleanup schedule
  logMaintenance.startCleanupSchedule();
};

/**
 * Logger Initialization
 */
const initializeLogger = () => {
  // Setup performance monitoring
  setupPerformanceMonitoring();
  
  logger.info('Logger initialized', {
    environment: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL || 'info',
    logsDirectory: logsDir
  });
};

// Initialize logger
initializeLogger();

module.exports = {
  // Winston logger instance
  logger,
  
  // Middleware functions
  requestLogger,
  morganLogger,
  errorLogger,
  
  // Specialized loggers
  securityLogger,
  transactionLogger,
  performanceLogger,
  apiLogger,
  structuredLogger,
  
  // Utility functions
  sanitizeData,
  generateRequestId,
  getClientIP,
  getUserAgent,
  
  // Maintenance
  logMaintenance,
  
  // Setup function
  initializeLogger
};
