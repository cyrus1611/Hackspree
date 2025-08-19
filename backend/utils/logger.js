const fs = require('fs');
const path = require('path');
const util = require('util');

// Log levels
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  HTTP: 3,
  VERBOSE: 4,
  DEBUG: 5,
  SILLY: 6
};

const LOG_COLORS = {
  ERROR: '\x1b[31m',   // Red
  WARN: '\x1b[33m',    // Yellow
  INFO: '\x1b[36m',    // Cyan
  HTTP: '\x1b[35m',    // Magenta
  VERBOSE: '\x1b[34m', // Blue
  DEBUG: '\x1b[32m',   // Green
  SILLY: '\x1b[90m',   // Gray
  RESET: '\x1b[0m'     // Reset
};

class Logger {
  constructor(options = {}) {
    this.level = options.level || process.env.LOG_LEVEL || 'info';
    this.logDir = options.logDir || './logs';
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles || 5;
    this.enableConsole = options.enableConsole !== false;
    this.enableFile = options.enableFile !== false;
    this.enableColors = options.enableColors !== false;
    this.service = options.service || 'collex-backend';
    
    // Create logs directory if it doesn't exist
    if (this.enableFile && !fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    
    // Current log file streams
    this.logStreams = new Map();
    
    // Initialize log files
    if (this.enableFile) {
      this.initializeLogFiles();
    }
  }

  /**
   * Initialize log file streams
   */
  initializeLogFiles() {
    const logFiles = ['error', 'combined'];
    
    logFiles.forEach(type => {
      const filePath = path.join(this.logDir, `${type}.log`);
      const stream = fs.createWriteStream(filePath, { flags: 'a' });
      this.logStreams.set(type, stream);
    });

    // Rotate logs on startup if needed
    this.rotateLogs();
  }

  /**
   * Get current timestamp in ISO format
   */
  getTimestamp() {
    return new Date().toISOString();
  }

  /**
   * Format log message
   */
  formatMessage(level, message, meta = {}) {
    const timestamp = this.getTimestamp();
    const service = this.service;
    
    // Base log object
    const logObj = {
      timestamp,
      level: level.toUpperCase(),
      service,
      message,
      ...meta
    };

    // Add request ID if available
    if (meta.requestId) {
      logObj.requestId = meta.requestId;
    }

    // Add user ID if available
    if (meta.userId) {
      logObj.userId = meta.userId;
    }

    // Add error stack if it's an error
    if (meta.error instanceof Error) {
      logObj.error = {
        name: meta.error.name,
        message: meta.error.message,
        stack: meta.error.stack
      };
    }

    return logObj;
  }

  /**
   * Format console output
   */
  formatConsoleMessage(level, message, meta = {}) {
    const timestamp = this.getTimestamp();
    const color = this.enableColors ? LOG_COLORS[level.toUpperCase()] : '';
    const reset = this.enableColors ? LOG_COLORS.RESET : '';
    
    let output = `${color}[${timestamp}] ${level.toUpperCase()}: ${message}${reset}`;
    
    // Add meta information
    if (Object.keys(meta).length > 0) {
      const metaString = util.inspect(meta, { colors: this.enableColors, depth: 3 });
      output += `\n${metaString}`;
    }
    
    return output;
  }

  /**
   * Check if level should be logged
   */
  shouldLog(level) {
    const currentLevel = LOG_LEVELS[this.level.toUpperCase()] || LOG_LEVELS.INFO;
    const messageLevel = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
    return messageLevel <= currentLevel;
  }

  /**
   * Write log to file
   */
  writeToFile(level, formattedMessage) {
    if (!this.enableFile) return;

    const logString = JSON.stringify(formattedMessage) + '\n';
    
    // Write to combined log
    const combinedStream = this.logStreams.get('combined');
    if (combinedStream) {
      combinedStream.write(logString);
    }

    // Write errors to separate error log
    if (level.toUpperCase() === 'ERROR') {
      const errorStream = this.logStreams.get('error');
      if (errorStream) {
        errorStream.write(logString);
      }
    }

    // Check if log rotation is needed
    this.checkLogRotation();
  }

  /**
   * Core logging method
   */
  log(level, message, meta = {}) {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(level, message, meta);
    
    // Console output
    if (this.enableConsole) {
      const consoleMessage = this.formatConsoleMessage(level, message, meta);
      
      if (level.toUpperCase() === 'ERROR') {
        console.error(consoleMessage);
      } else if (level.toUpperCase() === 'WARN') {
        console.warn(consoleMessage);
      } else {
        console.log(consoleMessage);
      }
    }
    
    // File output
    this.writeToFile(level, formattedMessage);
  }

  /**
   * Error logging
   */
  error(message, meta = {}) {
    this.log('error', message, meta);
  }

  /**
   * Warning logging
   */
  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }

  /**
   * Info logging
   */
  info(message, meta = {}) {
    this.log('info', message, meta);
  }

  /**
   * HTTP logging
   */
  http(message, meta = {}) {
    this.log('http', message, meta);
  }

  /**
   * Verbose logging
   */
  verbose(message, meta = {}) {
    this.log('verbose', message, meta);
  }

  /**
   * Debug logging
   */
  debug(message, meta = {}) {
    this.log('debug', message, meta);
  }

  /**
   * Silly logging
   */
  silly(message, meta = {}) {
    this.log('silly', message, meta);
  }

  /**
   * Log HTTP requests
   */
  logRequest(req, res, responseTime) {
    const meta = {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      requestId: req.requestId,
      userId: req.userId
    };

    const message = `${req.method} ${req.originalUrl || req.url} ${res.statusCode} ${responseTime}ms`;
    
    if (res.statusCode >= 400) {
      this.warn(message, meta);
    } else {
      this.http(message, meta);
    }
  }

  /**
   * Log authentication events
   */
  logAuth(event, details = {}) {
    const message = `Auth event: ${event}`;
    this.info(message, { event, ...details });
  }

  /**
   * Log transaction events
   */
  logTransaction(event, transactionData = {}) {
    const message = `Transaction ${event}`;
    this.info(message, { event, transaction: transactionData });
  }

  /**
   * Log security events
   */
  logSecurity(event, details = {}) {
    const message = `Security event: ${event}`;
    this.warn(message, { event, security: true, ...details });
  }

  /**
   * Log database operations
   */
  logDatabase(operation, details = {}) {
    const message = `Database ${operation}`;
    this.debug(message, { operation, database: true, ...details });
  }

  /**
   * Check if log rotation is needed
   */
  checkLogRotation() {
    try {
      this.logStreams.forEach((stream, type) => {
        const filePath = path.join(this.logDir, `${type}.log`);
        
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          
          if (stats.size > this.maxFileSize) {
            this.rotateLogFile(type);
          }
        }
      });
    } catch (error) {
      console.error('Log rotation check failed:', error);
    }
  }

  /**
   * Rotate a specific log file
   */
  rotateLogFile(type) {
    try {
      const stream = this.logStreams.get(type);
      if (stream) {
        stream.end();
      }

      const basePath = path.join(this.logDir, `${type}.log`);
      
      // Rotate existing files
      for (let i = this.maxFiles - 1; i >= 1; i--) {
        const oldPath = `${basePath}.${i}`;
        const newPath = `${basePath}.${i + 1}`;
        
        if (fs.existsSync(oldPath)) {
          if (i === this.maxFiles - 1) {
            fs.unlinkSync(oldPath); // Delete oldest file
          } else {
            fs.renameSync(oldPath, newPath);
          }
        }
      }

      // Rename current log file
      if (fs.existsSync(basePath)) {
        fs.renameSync(basePath, `${basePath}.1`);
      }

      // Create new stream
      const newStream = fs.createWriteStream(basePath, { flags: 'a' });
      this.logStreams.set(type, newStream);

      this.info('Log file rotated', { type, maxSize: this.maxFileSize });
    } catch (error) {
      console.error(`Log rotation failed for ${type}:`, error);
    }
  }

  /**
   * Rotate all log files
   */
  rotateLogs() {
    this.logStreams.forEach((stream, type) => {
      this.rotateLogFile(type);
    });
  }

  /**
   * Create child logger with additional metadata
   */
  child(metadata = {}) {
    const childLogger = Object.create(this);
    childLogger.defaultMeta = { ...this.defaultMeta, ...metadata };
    
    // Override log method to include default metadata
    const originalLog = this.log.bind(this);
    childLogger.log = (level, message, meta = {}) => {
      const combinedMeta = { ...childLogger.defaultMeta, ...meta };
      originalLog(level, message, combinedMeta);
    };

    return childLogger;
  }

  /**
   * Close all log streams
   */
  close() {
    this.logStreams.forEach(stream => {
      stream.end();
    });
    this.logStreams.clear();
  }
}

// Create default logger instance
const defaultLogger = new Logger({
  level: process.env.LOG_LEVEL || 'info',
  enableColors: process.env.NODE_ENV !== 'production'
});

// Express middleware for request logging
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Generate request ID
  req.requestId = require('crypto').randomBytes(16).toString('hex');
  
  // Log request start
  defaultLogger.debug('Request started', {
    method: req.method,
    url: req.originalUrl || req.url,
    requestId: req.requestId,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const responseTime = Date.now() - startTime;
    defaultLogger.logRequest(req, res, responseTime);
    originalEnd.call(res, chunk, encoding);
  };

  next();
};

// Error logging middleware
const errorLogger = (err, req, res, next) => {
  const meta = {
    error: err,
    method: req.method,
    url: req.originalUrl || req.url,
    requestId: req.requestId,
    userId: req.userId,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress
  };

  defaultLogger.error('Request error', meta);
  next(err);
};

module.exports = {
  Logger,
  logger: defaultLogger,
  requestLogger,
  errorLogger,
  LOG_LEVELS
};
