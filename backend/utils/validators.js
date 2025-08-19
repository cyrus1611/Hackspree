const validator = require('validator');
const { PATTERNS } = require('./constants');

/**
 * Custom validation error class
 */
class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Validation result class
 */
class ValidationResult {
  constructor() {
    this.errors = [];
    this.isValid = true;
  }

  addError(field, message) {
    this.errors.push({ field, message });
    this.isValid = false;
  }

  hasErrors() {
    return !this.isValid;
  }

  getErrors() {
    return this.errors;
  }

  getFirstError() {
    return this.errors.length > 0 ? this.errors[0] : null;
  }
}

/**
 * Base validator class
 */
class BaseValidator {
  constructor(value, fieldName = 'field') {
    this.value = value;
    this.fieldName = fieldName;
    this.errors = [];
  }

  /**
   * Add validation error
   */
  addError(message) {
    this.errors.push(message);
    return this;
  }

  /**
   * Check if validation passed
   */
  isValid() {
    return this.errors.length === 0;
  }

  /**
   * Get all errors
   */
  getErrors() {
    return this.errors;
  }

  /**
   * Required validation
   */
  required(message = null) {
    if (this.value === null || this.value === undefined || this.value === '') {
      this.addError(message || `${this.fieldName} is required`);
    }
    return this;
  }

  /**
   * Optional validation (skip if empty)
   */
  optional() {
    if (this.value === null || this.value === undefined || this.value === '') {
      // Skip further validations for empty optional fields
      this.skipValidation = true;
    }
    return this;
  }

  /**
   * Check if should skip validation
   */
  shouldSkip() {
    return this.skipValidation === true;
  }
}

/**
 * String validator
 */
class StringValidator extends BaseValidator {
  /**
   * Minimum length validation
   */
  minLength(min, message = null) {
    if (this.shouldSkip()) return this;
    
    if (typeof this.value !== 'string' || this.value.length < min) {
      this.addError(message || `${this.fieldName} must be at least ${min} characters long`);
    }
    return this;
  }

  /**
   * Maximum length validation
   */
  maxLength(max, message = null) {
    if (this.shouldSkip()) return this;
    
    if (typeof this.value !== 'string' || this.value.length > max) {
      this.addError(message || `${this.fieldName} cannot exceed ${max} characters`);
    }
    return this;
  }

  /**
   * Exact length validation
   */
  length(len, message = null) {
    if (this.shouldSkip()) return this;
    
    if (typeof this.value !== 'string' || this.value.length !== len) {
      this.addError(message || `${this.fieldName} must be exactly ${len} characters long`);
    }
    return this;
  }

  /**
   * Pattern validation
   */
  matches(pattern, message = null) {
    if (this.shouldSkip()) return this;
    
    if (typeof this.value !== 'string' || !pattern.test(this.value)) {
      this.addError(message || `${this.fieldName} format is invalid`);
    }
    return this;
  }

  /**
   * Email validation
   */
  email(message = null) {
    if (this.shouldSkip()) return this;
    
    if (!validator.isEmail(this.value)) {
      this.addError(message || `${this.fieldName} must be a valid email address`);
    }
    return this;
  }

  /**
   * URL validation
   */
  url(message = null) {
    if (this.shouldSkip()) return this;
    
    if (!validator.isURL(this.value)) {
      this.addError(message || `${this.fieldName} must be a valid URL`);
    }
    return this;
  }

  /**
   * Alphanumeric validation
   */
  alphanumeric(message = null) {
    if (this.shouldSkip()) return this;
    
    if (!validator.isAlphanumeric(this.value)) {
      this.addError(message || `${this.fieldName} must contain only letters and numbers`);
    }
    return this;
  }

  /**
   * Trim whitespace
   */
  trim() {
    if (typeof this.value === 'string') {
      this.value = this.value.trim();
    }
    return this;
  }

  /**
   * Convert to lowercase
   */
  toLowerCase() {
    if (typeof this.value === 'string') {
      this.value = this.value.toLowerCase();
    }
    return this;
  }

  /**
   * Convert to uppercase
   */
  toUpperCase() {
    if (typeof this.value === 'string') {
      this.value = this.value.toUpperCase();
    }
    return this;
  }

  /**
   * Check if string contains only letters
   */
  alpha(message = null) {
    if (this.shouldSkip()) return this;
    
    if (!validator.isAlpha(this.value.replace(/\s/g, ''))) {
      this.addError(message || `${this.fieldName} must contain only letters`);
    }
    return this;
  }

  /**
   * Custom validation function
   */
  custom(fn, message) {
    if (this.shouldSkip()) return this;
    
    try {
      const result = fn(this.value);
      if (!result) {
        this.addError(message || `${this.fieldName} validation failed`);
      }
    } catch (error) {
      this.addError(message || error.message);
    }
    return this;
  }
}

/**
 * Number validator
 */
class NumberValidator extends BaseValidator {
  /**
   * Minimum value validation
   */
  min(minVal, message = null) {
    if (this.shouldSkip()) return this;
    
    const num = Number(this.value);
    if (isNaN(num) || num < minVal) {
      this.addError(message || `${this.fieldName} must be at least ${minVal}`);
    }
    return this;
  }

  /**
   * Maximum value validation
   */
  max(maxVal, message = null) {
    if (this.shouldSkip()) return this;
    
    const num = Number(this.value);
    if (isNaN(num) || num > maxVal) {
      this.addError(message || `${this.fieldName} cannot exceed ${maxVal}`);
    }
    return this;
  }

  /**
   * Integer validation
   */
  integer(message = null) {
    if (this.shouldSkip()) return this;
    
    if (!Number.isInteger(Number(this.value))) {
      this.addError(message || `${this.fieldName} must be an integer`);
    }
    return this;
  }

  /**
   * Positive number validation
   */
  positive(message = null) {
    if (this.shouldSkip()) return this;
    
    const num = Number(this.value);
    if (isNaN(num) || num <= 0) {
      this.addError(message || `${this.fieldName} must be positive`);
    }
    return this;
  }

  /**
   * Non-negative number validation
   */
  nonNegative(message = null) {
    if (this.shouldSkip()) return this;
    
    const num = Number(this.value);
    if (isNaN(num) || num < 0) {
      this.addError(message || `${this.fieldName} cannot be negative`);
    }
    return this;
  }

  /**
   * Decimal places validation
   */
  decimal(places, message = null) {
    if (this.shouldSkip()) return this;
    
    const num = Number(this.value);
    if (isNaN(num)) {
      this.addError(message || `${this.fieldName} must be a valid number`);
      return this;
    }
    
    const decimalPart = num.toString().split('.')[1];
    if (decimalPart && decimalPart.length > places) {
      this.addError(message || `${this.fieldName} cannot have more than ${places} decimal places`);
    }
    return this;
  }
}

/**
 * Date validator
 */
class DateValidator extends BaseValidator {
  /**
   * Valid date validation
   */
  validDate(message = null) {
    if (this.shouldSkip()) return this;
    
    const date = new Date(this.value);
    if (isNaN(date.getTime())) {
      this.addError(message || `${this.fieldName} must be a valid date`);
    }
    return this;
  }

  /**
   * Future date validation
   */
  future(message = null) {
    if (this.shouldSkip()) return this;
    
    const date = new Date(this.value);
    const now = new Date();
    
    if (isNaN(date.getTime()) || date <= now) {
      this.addError(message || `${this.fieldName} must be a future date`);
    }
    return this;
  }

  /**
   * Past date validation
   */
  past(message = null) {
    if (this.shouldSkip()) return this;
    
    const date = new Date(this.value);
    const now = new Date();
    
    if (isNaN(date.getTime()) || date >= now) {
      this.addError(message || `${this.fieldName} must be a past date`);
    }
    return this;
  }

  /**
   * Minimum age validation
   */
  minAge(years, message = null) {
    if (this.shouldSkip()) return this;
    
    const birthDate = new Date(this.value);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    if (age < years) {
      this.addError(message || `${this.fieldName} indicates age must be at least ${years} years`);
    }
    return this;
  }
}

/**
 * Array validator
 */
class ArrayValidator extends BaseValidator {
  /**
   * Minimum length validation
   */
  minLength(min, message = null) {
    if (this.shouldSkip()) return this;
    
    if (!Array.isArray(this.value) || this.value.length < min) {
      this.addError(message || `${this.fieldName} must have at least ${min} items`);
    }
    return this;
  }

  /**
   * Maximum length validation
   */
  maxLength(max, message = null) {
    if (this.shouldSkip()) return this;
    
    if (!Array.isArray(this.value) || this.value.length > max) {
      this.addError(message || `${this.fieldName} cannot have more than ${max} items`);
    }
    return this;
  }

  /**
   * Each item validation
   */
  each(validatorFn, message = null) {
    if (this.shouldSkip()) return this;
    
    if (!Array.isArray(this.value)) {
      this.addError(message || `${this.fieldName} must be an array`);
      return this;
    }
    
    for (let i = 0; i < this.value.length; i++) {
      try {
        const isValid = validatorFn(this.value[i], i);
        if (!isValid) {
          this.addError(message || `${this.fieldName}[${i}] is invalid`);
        }
      } catch (error) {
        this.addError(message || `${this.fieldName}[${i}]: ${error.message}`);
      }
    }
    return this;
  }
}

/**
 * Collex-specific validators
 */
const collexValidators = {
  /**
   * University ID validation
   */
  universityId(value, fieldName = 'University ID') {
    return new StringValidator(value, fieldName)
      .required()
      .toUpperCase()
      .matches(PATTERNS.UNIVERSITY_ID, 'University ID must be 6-12 characters with only letters and numbers');
  },

  /**
   * Indian phone number validation
   */
  phoneNumber(value, fieldName = 'Phone number') {
    return new StringValidator(value, fieldName)
      .matches(PATTERNS.PHONE, 'Phone number must be a valid 10-digit Indian number');
  },

  /**
   * Transaction amount validation
   */
  transactionAmount(value, fieldName = 'Amount') {
    return new NumberValidator(value, fieldName)
      .required()
      .positive()
      .max(100000, 'Amount cannot exceed ₹1,00,000')
      .decimal(2, 'Amount cannot have more than 2 decimal places');
  },

  /**
   * Wallet balance validation
   */
  walletBalance(value, fieldName = 'Wallet balance') {
    const maxBalance = parseFloat(process.env.MAX_WALLET_BALANCE) || 50000;
    return new NumberValidator(value, fieldName)
      .nonNegative()
      .max(maxBalance, `Wallet balance cannot exceed ${maxBalance} Collex coins`);
  },

  /**
   * Password validation
   */
  password(value, fieldName = 'Password') {
    return new StringValidator(value, fieldName)
      .required()
      .minLength(6)
      .maxLength(128)
      .matches(PATTERNS.PASSWORD, 'Password must contain at least one lowercase, uppercase, and number');
  },

  /**
   * GST number validation
   */
  gstNumber(value, fieldName = 'GST number') {
    return new StringValidator(value, fieldName)
      .toUpperCase()
      .matches(PATTERNS.GST, 'Invalid GST number format');
  },

  /**
   * PAN number validation
   */
  panNumber(value, fieldName = 'PAN number') {
    return new StringValidator(value, fieldName)
      .toUpperCase()
      .matches(PATTERNS.PAN, 'Invalid PAN number format');
  },

  /**
   * Bank account number validation
   */
  accountNumber(value, fieldName = 'Account number') {
    return new StringValidator(value, fieldName)
      .matches(PATTERNS.ACCOUNT_NUMBER, 'Account number must be 9-18 digits');
  },

  /**
   * IFSC code validation
   */
  ifscCode(value, fieldName = 'IFSC code') {
    return new StringValidator(value, fieldName)
      .toUpperCase()
      .matches(PATTERNS.IFSC, 'Invalid IFSC code format');
  },

  /**
   * Event date validation
   */
  eventDate(value, fieldName = 'Event date') {
    return new DateValidator(value, fieldName)
      .validDate()
      .future('Event date must be in the future');
  },

  /**
   * Age validation for events
   */
  dateOfBirth(value, fieldName = 'Date of birth') {
    return new DateValidator(value, fieldName)
      .validDate()
      .past('Date of birth must be in the past')
      .minAge(13, 'Must be at least 13 years old');
  }
};

/**
 * Validation helper functions
 */
const validationHelpers = {
  /**
   * Validate multiple fields
   */
  validateFields(data, validationRules) {
    const result = new ValidationResult();
    
    for (const [field, rules] of Object.entries(validationRules)) {
      const value = data[field];
      
      try {
        const validator = rules(value, field);
        if (!validator.isValid()) {
          validator.getErrors().forEach(error => {
            result.addError(field, error);
          });
        }
        
        // Update the value if it was transformed
        if (validator.value !== undefined) {
          data[field] = validator.value;
        }
      } catch (error) {
        result.addError(field, error.message);
      }
    }
    
    return result;
  },

  /**
   * Sanitize string input
   */
  sanitizeString(str, maxLength = 1000) {
    if (typeof str !== 'string') return str;
    
    return str
      .trim()
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .substring(0, maxLength);
  },

  /**
   * Validate and sanitize user registration data
   */
  validateUserRegistration(data) {
    return this.validateFields(data, {
      universityId: (value) => collexValidators.universityId(value),
      name: (value) => new StringValidator(value, 'Name')
        .required()
        .trim()
        .minLength(2)
        .maxLength(50)
        .alpha('Name can only contain letters'),
      email: (value) => new StringValidator(value, 'Email')
        .required()
        .trim()
        .toLowerCase()
        .email(),
      password: (value) => collexValidators.password(value),
      phone: (value) => new StringValidator(value, 'Phone')
        .optional()
        .custom(val => !val || PATTERNS.PHONE.test(val), 'Invalid phone number'),
      dateOfBirth: (value) => new DateValidator(value, 'Date of birth')
        .optional()
        .validDate()
        .past()
    });
  },

  /**
   * Validate transaction data
   */
  validateTransaction(data) {
    return this.validateFields(data, {
      amount: (value) => collexValidators.transactionAmount(value),
      merchantQrCode: (value) => new StringValidator(value, 'QR Code')
        .required()
        .trim()
        .minLength(10)
        .maxLength(50),
      description: (value) => new StringValidator(value, 'Description')
        .optional()
        .trim()
        .maxLength(500)
    });
  },

  /**
   * Validate merchant registration data
   */
  validateMerchantRegistration(data) {
    return this.validateFields(data, {
      name: (value) => new StringValidator(value, 'Merchant name')
        .required()
        .trim()
        .minLength(2)
        .maxLength(100),
      category: (value) => new StringValidator(value, 'Category')
        .required()
        .custom(val => ['canteen', 'shop', 'stationery', 'event_organizer', 'club'].includes(val)),
      'location.building': (value) => new StringValidator(value, 'Building')
        .required()
        .trim()
        .minLength(1)
        .maxLength(100),
      'contact.phone': (value) => new StringValidator(value, 'Phone')
        .optional()
        .custom(val => !val || PATTERNS.PHONE.test(val)),
      'contact.email': (value) => new StringValidator(value, 'Email')
        .optional()
        .email()
    });
  }
};

/**
 * Create validator instances
 */
const createValidator = {
  string: (value, fieldName) => new StringValidator(value, fieldName),
  number: (value, fieldName) => new NumberValidator(value, fieldName),
  date: (value, fieldName) => new DateValidator(value, fieldName),
  array: (value, fieldName) => new ArrayValidator(value, fieldName)
};

module.exports = {
  ValidationError,
  ValidationResult,
  BaseValidator,
  StringValidator,
  NumberValidator,
  DateValidator,
  ArrayValidator,
  collexValidators,
  validationHelpers,
  createValidator
};
