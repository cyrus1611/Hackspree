const { body, param, query, validationResult, sanitizeBody } = require('express-validator');
const mongoose = require('mongoose');

/**
 * Validation Middleware for Hackspree Wallet Application
 * Comprehensive validation rules with security considerations
 */

/**
 * Common Validation Helpers
 */
const validationHelpers = {
  // Check if string is a valid MongoDB ObjectId
  isValidObjectId: (value) => {
    return mongoose.Types.ObjectId.isValid(value);
  },

  // Check if amount is valid for financial transactions
  isValidAmount: (value) => {
    const amount = parseFloat(value);
    return !isNaN(amount) && amount > 0 && amount <= 1000000 && /^\d+(\.\d{1,2})?$/.test(value.toString());
  },

  // Check if wallet PIN format is valid
  isValidPin: (value) => {
    return /^\d{4,6}$/.test(value);
  },

  // Check if transaction ID format is valid
  isValidTransactionId: (value) => {
    return /^[A-Z0-9_-]{10,50}$/.test(value);
  },

  // Check if phone number is valid
  isValidPhone: (value) => {
    return /^(\+\d{1,3}[- ]?)?\d{10}$/.test(value);
  },

  // Check if password meets security requirements
  isSecurePassword: (value) => {
    return value.length >= 8 &&
           /[a-z]/.test(value) &&
           /[A-Z]/.test(value) &&
           /\d/.test(value) &&
           /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(value);
  }
};

/**
 * Basic Validation Rules
 */
const validators = {
  // MongoDB ObjectId validation
  isMongoId: (field, location = 'param') => {
    const validator = location === 'param' ? param : location === 'query' ? query : body;
    return validator(field)
      .custom(validationHelpers.isValidObjectId)
      .withMessage(`${field} must be a valid MongoDB ObjectId`);
  },

  // Required string with length constraints
  isRequiredString: (field, min = 1, max = 255) => {
    return body(field)
      .notEmpty()
      .withMessage(`${field} is required`)
      .isString()
      .withMessage(`${field} must be a string`)
      .trim()
      .isLength({ min, max })
      .withMessage(`${field} must be between ${min} and ${max} characters`)
      .escape(); // Prevent XSS
  },

  // Optional string with length constraints
  isOptionalString: (field, min = 1, max = 255) => {
    return body(field)
      .optional()
      .isString()
      .withMessage(`${field} must be a string`)
      .trim()
      .isLength({ min, max })
      .withMessage(`${field} must be between ${min} and ${max} characters`)
      .escape();
  },

  // Email validation with normalization
  isEmail: (field) => {
    return body(field)
      .isEmail()
      .withMessage(`${field} must be a valid email address`)
      .normalizeEmail({
        gmail_lowercase: true,
        gmail_remove_dots: false,
        outlookdotcom_lowercase: true,
        yahoo_lowercase: true
      });
  },

  // Phone number validation
  isPhone: (field) => {
    return body(field)
      .custom(validationHelpers.isValidPhone)
      .withMessage(`${field} must be a valid phone number (10 digits with optional country code)`);
  },

  // Strong password validation
  isStrongPassword: (field) => {
    return body(field)
      .custom(validationHelpers.isSecurePassword)
      .withMessage(`${field} must be at least 8 characters long and contain uppercase, lowercase, number, and special character`);
  },

  // Password confirmation
  passwordConfirmation: (passwordField, confirmationField) => {
    return body(confirmationField)
      .custom((value, { req }) => {
        if (value !== req.body[passwordField]) {
          throw new Error('Password confirmation does not match password');
        }
        return true;
      });
  },

  // Amount validation for financial transactions
  isValidAmount: (field) => {
    return body(field)
      .custom(validationHelpers.isValidAmount)
      .withMessage(`${field} must be a positive number with up to 2 decimal places and not exceed $1,000,000`);
  },

  // Currency code validation
  isCurrencyCode: (field) => {
    return body(field)
      .isLength({ min: 3, max: 3 })
      .withMessage(`${field} must be exactly 3 characters`)
      .matches(/^[A-Z]{3}$/)
      .withMessage(`${field} must be a valid 3-letter uppercase currency code`);
  },

  // Date validation
  isValidDate: (field, options = {}) => {
    return body(field)
      .isISO8601(options)
      .withMessage(`${field} must be a valid ISO 8601 date`)
      .toDate();
  },

  // Future date validation
  isFutureDate: (field) => {
    return body(field)
      .isISO8601()
      .withMessage(`${field} must be a valid date`)
      .custom((value) => {
        if (new Date(value) <= new Date()) {
          throw new Error(`${field} must be in the future`);
        }
        return true;
      });
  },

  // Boolean validation
  isBoolean: (field) => {
    return body(field)
      .isBoolean()
      .withMessage(`${field} must be a boolean value`);
  },

  // Integer validation with range
  isInteger: (field, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) => {
    return body(field)
      .isInt({ min, max })
      .withMessage(`${field} must be an integer between ${min} and ${max}`);
  },

  // Float validation with range
  isFloat: (field, min = Number.MIN_VALUE, max = Number.MAX_VALUE) => {
    return body(field)
      .isFloat({ min, max })
      .withMessage(`${field} must be a number between ${min} and ${max}`);
  },

  // URL validation
  isURL: (field) => {
    return body(field)
      .isURL({
        protocols: ['http', 'https'],
        require_protocol: true
      })
      .withMessage(`${field} must be a valid HTTP or HTTPS URL`);
  },

  // Enum validation
  isEnum: (field, allowedValues) => {
    return body(field)
      .isIn(allowedValues)
      .withMessage(`${field} must be one of: ${allowedValues.join(', ')}`);
  },

  // Array validation
  isArray: (field, minLength = 0, maxLength = 100) => {
    return body(field)
      .isArray({ min: minLength, max: maxLength })
      .withMessage(`${field} must be an array with ${minLength}-${maxLength} elements`);
  },

  // Array of MongoDB ObjectIds
  isArrayOfMongoIds: (field) => {
    return body(field)
      .isArray()
      .withMessage(`${field} must be an array`)
      .custom((array) => {
        return array.every(id => validationHelpers.isValidObjectId(id));
      })
      .withMessage(`${field} must contain valid MongoDB ObjectIds`);
  },

  // PIN validation (4-6 digits)
  isValidPin: (field) => {
    return body(field)
      .custom(validationHelpers.isValidPin)
      .withMessage(`${field} must be 4-6 digits`);
  },

  // Transaction ID validation
  isTransactionId: (field) => {
    return body(field)
      .custom(validationHelpers.isValidTransactionId)
      .withMessage(`${field} must be a valid transaction ID format`);
  },

  // Base64 string validation
  isBase64: (field) => {
    return body(field)
      .isBase64()
      .withMessage(`${field} must be a valid Base64 string`);
  },

  // JSON string validation
  isJSONString: (field) => {
    return body(field)
      .custom((value) => {
        try {
          JSON.parse(value);
          return true;
        } catch (error) {
          return false;
        }
      })
      .withMessage(`${field} must be valid JSON`);
  },

  // UUID validation
  isUUID: (field, version = null) => {
    return body(field)
      .isUUID(version)
      .withMessage(`${field} must be a valid UUID${version ? ` version ${version}` : ''}`);
  },

  // Credit card validation (for Square payments)
  isCreditCard: (field) => {
    return body(field)
      .isCreditCard()
      .withMessage(`${field} must be a valid credit card number`);
  },

  // Postal code validation
  isPostalCode: (field, locale = 'any') => {
    return body(field)
      .isPostalCode(locale)
      .withMessage(`${field} must be a valid postal code`);
  }
};

/**
 * Wallet-Specific Validations
 */
const walletValidations = {
  // Wallet top-up validation
  topUp: [
    validators.isValidAmount('amount'),
    validators.isEnum('paymentMethod', ['SQUARE', 'BANK_TRANSFER', 'CREDIT_CARD']),
    validators.isOptionalString('note', 1, 500)
  ],

  // Wallet transfer validation
  transfer: [
    validators.isMongoId('toUserId', 'body'),
    validators.isValidAmount('amount'),
    validators.isOptionalString('description', 1, 500),
    validators.isOptionalString('pin', 4, 6)
  ],

  // Wallet creation validation
  create: [
    validators.isMongoId('userId', 'body'),
    validators.isCurrencyCode('currency')
  ],

  // PIN update validation
  updatePin: [
    validators.isValidPin('currentPin'),
    validators.isValidPin('newPin'),
    validators.passwordConfirmation('newPin', 'confirmPin')
  ]
};

/**
 * User Authentication Validations
 */
const authValidations = {
  // User registration validation
  register: [
    validators.isRequiredString('name', 2, 50),
    validators.isEmail('email'),
    validators.isStrongPassword('password'),
    validators.passwordConfirmation('password', 'confirmPassword'),
    validators.isPhone('phone'),
    validators.isValidDate('dateOfBirth')
  ],

  // User login validation
  login: [
    validators.isEmail('email'),
    validators.isRequiredString('password', 6, 128)
  ],

  // Password reset validation
  passwordReset: [
    validators.isEmail('email')
  ],

  // Password change validation
  changePassword: [
    validators.isRequiredString('currentPassword', 6, 128),
    validators.isStrongPassword('newPassword'),
    validators.passwordConfirmation('newPassword', 'confirmPassword')
  ],

  // Profile update validation
  updateProfile: [
    validators.isOptionalString('name', 2, 50),
    validators.isPhone('phone'),
    validators.isValidDate('dateOfBirth')
  ]
};

/**
 * Transaction Validations
 */
const transactionValidations = {
  // Create transaction validation
  create: [
    validators.isMongoId('userId', 'body'),
    validators.isMongoId('walletId', 'body'),
    validators.isValidAmount('amount'),
    validators.isEnum('type', ['CREDIT', 'DEBIT']),
    validators.isEnum('category', ['TRANSFER', 'TOP_UP', 'WITHDRAWAL', 'PAYMENT', 'REFUND']),
    validators.isOptionalString('description', 1, 500)
  ],

  // Update transaction status validation
  updateStatus: [
    validators.isEnum('status', ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED']),
    validators.isOptionalString('notes', 1, 1000)
  ]
};

/**
 * Merchant Validations
 */
const merchantValidations = {
  // Create merchant validation
  create: [
    validators.isRequiredString('name', 2, 100),
    validators.isRequiredString('businessName', 2, 100),
    validators.isRequiredString('category', 2, 50),
    validators.isOptionalString('subcategory', 2, 50),
    validators.isRequiredString('description', 10, 1000),
    validators.isEmail('contact.email'),
    validators.isPhone('contact.phone'),
    validators.isRequiredString('location.address', 5, 200)
  ],

  // Update merchant validation
  update: [
    validators.isOptionalString('name', 2, 100),
    validators.isOptionalString('description', 10, 1000),
    validators.isOptionalString('contact.phone')
  ],

  // Verify merchant validation
  verify: [
    validators.isEnum('verificationStatus', ['pending', 'under_review', 'verified', 'rejected']),
    validators.isOptionalString('verificationNotes', 1, 1000)
  ]
};

/**
 * Event Validations
 */
const eventValidations = {
  // Create event validation
  create: [
    validators.isRequiredString('title', 5, 200),
    validators.isRequiredString('description', 20, 5000),
    validators.isOptionalString('shortDescription', 10, 500),
    validators.isValidAmount('price'),
    validators.isFutureDate('startDate'),
    validators.isFutureDate('endDate'),
    validators.isRequiredString('venue.name', 2, 100),
    validators.isRequiredString('venue.address', 5, 200),
    validators.isInteger('maxParticipants', 1, 10000),
    validators.isRequiredString('category', 2, 50)
  ],

  // Event registration validation
  register: [
    validators.isEnum('paymentMethod', ['WALLET', 'SQUARE']),
    validators.isOptionalString('nonce', 10, 100) // Square payment nonce
  ]
};

/**
 * Query Parameter Validations
 */
const queryValidations = {
  // Pagination validation
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Page must be a positive integer not exceeding 1000'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ],

  // Date range validation
  dateRange: [
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid ISO 8601 date'),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO 8601 date')
  ],

  // Amount range validation
  amountRange: [
    query('minAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Minimum amount must be a positive number'),
    query('maxAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Maximum amount must be a positive number')
  ]
};

/**
 * Sanitization Functions
 */
const sanitizers = {
  // Trim and escape HTML
  sanitizeString: (field) => {
    return body(field).trim().escape();
  },

  // Convert to lowercase
  toLowerCase: (field) => {
    return body(field).trim().toLowerCase();
  },

  // Convert to uppercase
  toUpperCase: (field) => {
    return body(field).trim().toUpperCase();
  },

  // Sanitize amount (ensure proper decimal format)
  sanitizeAmount: (field) => {
    return body(field).customSanitizer((value) => {
      return parseFloat(parseFloat(value).toFixed(2));
    });
  },

  // Sanitize phone number (remove non-digits except +)
  sanitizePhone: (field) => {
    return body(field).customSanitizer((value) => {
      return value.replace(/[^\d+]/g, '');
    });
  }
};

/**
 * Main Validation Handler
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.param || error.path,
      message: error.msg,
      value: error.value,
      location: error.location
    }));

    // Log validation errors for security monitoring
    console.warn('Validation failed:', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userId: req.userId || 'anonymous',
      errors: formattedErrors
    });

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      errors: formattedErrors
    });
  }

  next();
};

/**
 * Custom Validation Middleware for Complex Rules
 */
const customValidations = {
  // Validate transfer amount against wallet balance
  validateTransferAmount: async (req, res, next) => {
    try {
      const { amount } = req.body;
      const Wallet = require('../models/Wallet');
      
      const wallet = await Wallet.findOne({ userId: req.userId });
      if (!wallet) {
        return res.status(404).json({
          success: false,
          message: 'Wallet not found'
        });
      }

      if (wallet.balance < amount) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient balance',
          code: 'INSUFFICIENT_BALANCE'
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  },

  // Validate business hours for merchant operations
  validateBusinessHours: (req, res, next) => {
    const currentHour = new Date().getHours();
    const businessStart = 9; // 9 AM
    const businessEnd = 21;  // 9 PM

    if (currentHour < businessStart || currentHour >= businessEnd) {
      return res.status(400).json({
        success: false,
        message: 'Operations are only allowed during business hours (9 AM - 9 PM)',
        code: 'OUTSIDE_BUSINESS_HOURS'
      });
    }

    next();
  },

  // Validate file upload
  validateFileUpload: (allowedTypes = [], maxSize = 5 * 1024 * 1024) => {
    return (req, res, next) => {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }

      // Check file type
      if (allowedTypes.length && !allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`
        });
      }

      // Check file size
      if (req.file.size > maxSize) {
        return res.status(400).json({
          success: false,
          message: `File too large. Maximum size: ${maxSize / 1024 / 1024}MB`
        });
      }

      next();
    };
  }
};

module.exports = {
  // Basic validators
  validators,
  sanitizers,
  
  // Specialized validations
  walletValidations,
  authValidations,
  transactionValidations,
  merchantValidations,
  eventValidations,
  queryValidations,
  
  // Custom validations
  customValidations,
  
  // Error handler
  handleValidationErrors,
  
  // Helpers
  validationHelpers
};
