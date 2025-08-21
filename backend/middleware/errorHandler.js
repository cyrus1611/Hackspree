const mongoose = require('mongoose');

/**
 * Custom Error Classes
 */
class AppError extends Error {
  constructor(message, statusCode, errorCode = null, isOperational = true) {
    super(message);
    
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.errorCode = errorCode;
    this.isOperational = isOperational;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, errors = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND_ERROR');
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

class PaymentError extends AppError {
  constructor(message, details = null) {
    super(message, 402, 'PAYMENT_ERROR');
    this.details = details;
  }
}

class InsufficientFundsError extends AppError {
  constructor(message = 'Insufficient funds', availableBalance = 0, requiredAmount = 0) {
    super(message, 402, 'INSUFFICIENT_FUNDS');
    this.availableBalance = availableBalance;
    this.requiredAmount = requiredAmount;
  }
}

class WalletError extends AppError {
  constructor(message, walletId = null) {
    super(message, 400, 'WALLET_ERROR');
    this.walletId = walletId;
  }
}

class TransactionError extends AppError {
  constructor(message, transactionId = null) {
    super(message, 400, 'TRANSACTION_ERROR');
    this.transactionId = transactionId;
  }
}

class SquarePaymentError extends AppError {
  constructor(message, squareErrors = []) {
    super(message, 402, 'SQUARE_PAYMENT_ERROR');
    this.squareErrors = squareErrors;
  }
}

/**
 * Error Logger
 */
const errorLogger = {
  log: (error, req = null) => {
    const timestamp = new Date().toISOString();
    const errorInfo = {
      timestamp,
      message: error.message,
      statusCode: error.statusCode || 500,
      errorCode: error.errorCode,
      stack: error.stack,
      ...(req && {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.userId || 'anonymous',
        body: this.sanitizeRequestBody(req.body)
      })
    };

    // Log different levels based on error type
    if (error.statusCode >= 500) {
      console.error('🚨 SERVER ERROR:', JSON.stringify(errorInfo, null, 2));
    } else if (error.statusCode >= 400) {
      console.warn('⚠️ CLIENT ERROR:', JSON.stringify(errorInfo, null, 2));
    } else {
      console.log('ℹ️ INFO:', JSON.stringify(errorInfo, null, 2));
    }

    // In production, you might want to send to external logging service
    if (process.env.NODE_ENV === 'production' && error.statusCode >= 500) {
      // Send to logging service (Sentry, CloudWatch, etc.)
      this.sendToExternalLogger(errorInfo);
    }
  },

  sanitizeRequestBody: (body) => {
    if (!body) return null;
    
    const sanitized = { ...body };
    const sensitiveFields = ['password', 'token', 'nonce', 'pin', 'secret', 'key'];
    
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '***REDACTED***';
      }
    });
    
    return sanitized;
  },

  sendToExternalLogger: (errorInfo) => {
    // Implement external logging service integration
    // Example: Sentry, CloudWatch, LogRocket, etc.
    console.log('📤 Sending to external logger:', errorInfo.errorCode);
  }
};

/**
 * Error Parsers for different error types
 */
const errorParsers = {
  // MongoDB/Mongoose errors
  parseMongoError: (error) => {
    if (error.name === 'CastError') {
      return new ValidationError(
        `Invalid ${error.path}: ${error.value}`,
        [{ field: error.path, message: 'Invalid format' }]
      );
    }

    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      const value = error.keyValue[field];
      return new ConflictError(
        `Duplicate field value: ${field}. Please use another value!`,
        [{ field, message: `${value} already exists` }]
      );
    }

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(val => ({
        field: val.path,
        message: val.message
      }));
      return new ValidationError('Invalid input data', errors);
    }

    return error;
  },

  // JWT errors
  parseJWTError: (error) => {
    if (error.name === 'JsonWebTokenError') {
      return new AuthenticationError('Invalid token. Please log in again!');
    }
    if (error.name === 'TokenExpiredError') {
      return new AuthenticationError('Your token has expired! Please log in again.');
    }
    return error;
  },

  // Square payment errors
  parseSquareError: (error) => {
    if (error.response && error.response.data && error.response.data.errors) {
      const squareErrors = error.response.data.errors;
      const message = squareErrors[0]?.detail || 'Payment processing failed';
      return new SquarePaymentError(message, squareErrors);
    }
    return error;
  },

  // Express validation errors
  parseExpressValidatorError: (errors) => {
    const validationErrors = errors.map(error => ({
      field: error.param || error.path,
      message: error.msg,
      value: error.value
    }));
    
    return new ValidationError('Validation failed', validationErrors);
  }
};

/**
 * Error Response Formatter
 */
const formatErrorResponse = (error, req) => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  const baseResponse = {
    success: false,
    message: error.message,
    timestamp: new Date().toISOString(),
    path: req?.originalUrl,
    method: req?.method
  };

  // Add error code if available
  if (error.errorCode) {
    baseResponse.code = error.errorCode;
  }

  // Add request ID for tracking
  if (req?.id) {
    baseResponse.requestId = req.id;
  }

  // Add validation errors
  if (error.errors && Array.isArray(error.errors)) {
    baseResponse.errors = error.errors;
  }

  // Add specific error details based on type
  if (error instanceof InsufficientFundsError) {
    baseResponse.details = {
      availableBalance: error.availableBalance,
      requiredAmount: error.requiredAmount
    };
  }

  if (error instanceof SquarePaymentError && error.squareErrors) {
    baseResponse.paymentErrors = error.squareErrors.map(err => ({
      category: err.category,
      code: err.code,
      detail: err.detail,
      field: err.field
    }));
  }

  if (error instanceof WalletError && error.walletId) {
    baseResponse.walletId = error.walletId;
  }

  if (error instanceof TransactionError && error.transactionId) {
    baseResponse.transactionId = error.transactionId;
  }

  // Add stack trace in development
  if (isDevelopment && error.stack) {
    baseResponse.stack = error.stack;
  }

  return baseResponse;
};

/**
 * Main Error Handling Middleware
 */
const globalErrorHandler = (error, req, res, next) => {
  // Log the error
  errorLogger.log(error, req);

  // Parse specific error types
  let parsedError = error;
  
  // MongoDB errors
  if (error.name === 'CastError' || error.name === 'ValidationError' || error.code === 11000) {
    parsedError = errorParsers.parseMongoError(error);
  }
  
  // JWT errors
  else if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    parsedError = errorParsers.parseJWTError(error);
  }
  
  // Square payment errors
  else if (error.response && error.response.data && error.response.data.errors) {
    parsedError = errorParsers.parseSquareError(error);
  }

  // Set default values for unknown errors
  if (!parsedError.statusCode) {
    parsedError.statusCode = 500;
    parsedError.message = 'Something went wrong!';
    parsedError.errorCode = 'INTERNAL_SERVER_ERROR';
  }

  // Format the error response
  const errorResponse = formatErrorResponse(parsedError, req);
  
  // Send the response
  res.status(parsedError.statusCode).json(errorResponse);
};

/**
 * 404 Not Found Handler
 */
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`Can't find ${req.originalUrl} on this server!`);
  next(error);
};

/**
 * Async Error Wrapper
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * Validation Error Handler for express-validator
 */
const handleValidationErrors = (req, res, next) => {
  const { validationResult } = require('express-validator');
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const error = errorParsers.parseExpressValidatorError(errors.array());
    return next(error);
  }
  
  next();
};

/**
 * Database Connection Error Handler
 */
const handleDatabaseErrors = () => {
  // Handle MongoDB connection errors
  mongoose.connection.on('error', (error) => {
    console.error('🔥 Database connection error:', error);
    errorLogger.log(new AppError('Database connection failed', 500, 'DATABASE_ERROR'));
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ Database disconnected');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('✅ Database reconnected');
  });
};

/**
 * Process Error Handlers
 */
const handleProcessErrors = () => {
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 UNHANDLED PROMISE REJECTION! Shutting down...');
    console.error('Reason:', reason);
    console.error('Promise:', promise);
    
    errorLogger.log(new AppError(
      `Unhandled Promise Rejection: ${reason}`,
      500,
      'UNHANDLED_REJECTION'
    ));
    
    process.exit(1);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('🔥 UNCAUGHT EXCEPTION! Shutting down...');
    console.error('Error:', error);
    
    errorLogger.log(new AppError(
      `Uncaught Exception: ${error.message}`,
      500,
      'UNCAUGHT_EXCEPTION'
    ));
    
    process.exit(1);
  });

  // Handle SIGTERM
  process.on('SIGTERM', () => {
    console.log('👋 SIGTERM received. Shutting down gracefully...');
    process.exit(0);
  });

  // Handle SIGINT
  process.on('SIGINT', () => {
    console.log('👋 SIGINT received. Shutting down gracefully...');
    process.exit(0);
  });
};

/**
 * Error Metrics (for monitoring)
 */
const errorMetrics = {
  counts: {
    total: 0,
    byStatusCode: {},
    byErrorCode: {},
    byPath: {}
  },

  increment: (statusCode, errorCode, path) => {
    this.counts.total++;
    this.counts.byStatusCode[statusCode] = (this.counts.byStatusCode[statusCode] || 0) + 1;
    this.counts.byErrorCode[errorCode] = (this.counts.byErrorCode[errorCode] || 0) + 1;
    this.counts.byPath[path] = (this.counts.byPath[path] || 0) + 1;
  },

  getMetrics: () => {
    return this.counts;
  },

  reset: () => {
    this.counts = {
      total: 0,
      byStatusCode: {},
      byErrorCode: {},
      byPath: {}
    };
  }
};

/**
 * Error Middleware Setup Function
 */
const setupErrorHandling = (app) => {
  // Handle database errors
  handleDatabaseErrors();
  
  // Handle process errors
  handleProcessErrors();
  
  // 404 handler (should be before global error handler)
  app.use(notFoundHandler);
  
  // Global error handler (should be last)
  app.use(globalErrorHandler);
  
  console.log('✅ Error handling middleware setup complete');
};

module.exports = {
  // Error Classes
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  PaymentError,
  InsufficientFundsError,
  WalletError,
  TransactionError,
  SquarePaymentError,
  
  // Middleware Functions
  globalErrorHandler,
  notFoundHandler,
  catchAsync,
  handleValidationErrors,
  setupErrorHandling,
  
  // Utility Functions
  errorLogger,
  errorParsers,
  formatErrorResponse,
  errorMetrics
};
