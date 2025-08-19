// Application Constants
const APP_CONSTANTS = {
  // Application Info
  APP_NAME: 'Collex',
  APP_VERSION: '1.0.0',
  APP_DESCRIPTION: 'Digital Campus Wallet System',

  // User Roles
  USER_ROLES: {
    STUDENT: 'student',
    MERCHANT: 'merchant',
    ADMIN: 'admin',
    SUPER_ADMIN: 'super_admin'
  },

  // Transaction Types
  TRANSACTION_TYPES: {
    TOPUP: 'topup',
    PAYMENT: 'payment',
    REFUND: 'refund',
    CASHBACK: 'cashback',
    TRANSFER: 'transfer',
    WITHDRAWAL: 'withdrawal'
  },

  // Transaction Status
  TRANSACTION_STATUS: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    REFUNDED: 'refunded',
    DISPUTED: 'disputed'
  },

  // Transaction Categories
  TRANSACTION_CATEGORIES: {
    CANTEEN: 'canteen',
    EVENT: 'event',
    CLUB: 'club',
    SHOP: 'shop',
    STATIONERY: 'stationery',
    TRANSPORT: 'transport',
    LIBRARY: 'library',
    SPORTS: 'sports',
    MEDICAL: 'medical',
    OTHER: 'other'
  },

  // Merchant Categories
  MERCHANT_CATEGORIES: {
    CANTEEN: 'canteen',
    SHOP: 'shop',
    STATIONERY: 'stationery',
    EVENT_ORGANIZER: 'event_organizer',
    CLUB: 'club',
    TRANSPORT: 'transport',
    LIBRARY: 'library',
    SPORTS: 'sports',
    MEDICAL: 'medical'
  },

  // Event Categories
  EVENT_CATEGORIES: {
    WORKSHOP: 'workshop',
    SEMINAR: 'seminar',
    COMPETITION: 'competition',
    CULTURAL: 'cultural',
    SPORTS: 'sports',
    TECHNICAL: 'technical',
    CAREER: 'career',
    SOCIAL: 'social',
    OTHER: 'other'
  },

  // Event Status
  EVENT_STATUS: {
    DRAFT: 'draft',
    PUBLISHED: 'published',
    CANCELLED: 'cancelled',
    POSTPONED: 'postponed',
    COMPLETED: 'completed',
    ONGOING: 'ongoing'
  },

  // Merchant Verification Status
  MERCHANT_VERIFICATION_STATUS: {
    PENDING: 'pending',
    UNDER_REVIEW: 'under_review',
    VERIFIED: 'verified',
    REJECTED: 'rejected'
  },

  // Payment Methods
  PAYMENT_METHODS: {
    UPI: 'upi',
    CARD: 'card',
    NET_BANKING: 'net_banking',
    WALLET: 'wallet'
  },

  // Settlement Periods
  SETTLEMENT_PERIODS: {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly'
  },

  // Default Values
  DEFAULTS: {
    CONVERSION_RATE: 1,
    MAX_WALLET_BALANCE: 50000,
    DAILY_TRANSACTION_LIMIT: 5000,
    MIN_TOPUP_AMOUNT: 50,
    MAX_TOPUP_AMOUNT: 10000,
    DEFAULT_COMMISSION_RATE: 0.02,
    PASSWORD_MIN_LENGTH: 6,
    OTP_LENGTH: 6,
    TOKEN_EXPIRY: '30d',
    PAGINATION_LIMIT: 20,
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_TIME: 30 * 60 * 1000 // 30 minutes
  },

  // Validation Patterns
  PATTERNS: {
    PHONE: /^[6-9]\d{9}$/,
    UNIVERSITY_ID: /^[A-Z0-9]{6,12}$/,
    EMAIL: /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
    PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    GST: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
    PAN: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,
    IFSC: /^[A-Z]{4}0[A-Z0-9]{6}$/,
    ACCOUNT_NUMBER: /^\d{9,18}$/
  },

  // Error Codes
  ERROR_CODES: {
    // Authentication Errors
    NO_AUTH_HEADER: 'NO_AUTH_HEADER',
    INVALID_TOKEN_FORMAT: 'INVALID_TOKEN_FORMAT',
    NO_TOKEN: 'NO_TOKEN',
    INVALID_TOKEN: 'INVALID_TOKEN',
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    USER_NOT_FOUND: 'USER_NOT_FOUND',
    ACCOUNT_DEACTIVATED: 'ACCOUNT_DEACTIVATED',
    ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
    AUTH_REQUIRED: 'AUTH_REQUIRED',
    ADMIN_REQUIRED: 'ADMIN_REQUIRED',
    MERCHANT_REQUIRED: 'MERCHANT_REQUIRED',

    // User Errors
    USER_EXISTS: 'USER_EXISTS',
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
    SAME_PASSWORD: 'SAME_PASSWORD',
    INVALID_CURRENT_PASSWORD: 'INVALID_CURRENT_PASSWORD',

    // Transaction Errors
    INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
    DAILY_LIMIT_EXCEEDED: 'DAILY_LIMIT_EXCEEDED',
    WALLET_LIMIT_EXCEEDED: 'WALLET_LIMIT_EXCEEDED',
    INVALID_SIGNATURE: 'INVALID_SIGNATURE',
    PAYMENT_NOT_CAPTURED: 'PAYMENT_NOT_CAPTURED',
    ORDER_MISMATCH: 'ORDER_MISMATCH',
    TRANSACTION_NOT_FOUND: 'TRANSACTION_NOT_FOUND',

    // Merchant Errors
    INVALID_MERCHANT_QR: 'INVALID_MERCHANT_QR',
    MERCHANT_CLOSED: 'MERCHANT_CLOSED',
    MERCHANT_NOT_FOUND: 'MERCHANT_NOT_FOUND',
    MERCHANT_EXISTS: 'MERCHANT_EXISTS',

    // Event Errors
    EVENT_NOT_FOUND: 'EVENT_NOT_FOUND',
    EVENT_NOT_AVAILABLE: 'EVENT_NOT_AVAILABLE',
    REGISTRATION_CLOSED: 'REGISTRATION_CLOSED',
    EVENT_FULL: 'EVENT_FULL',
    ALREADY_REGISTERED: 'ALREADY_REGISTERED',

    // General Errors
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    SERVER_ERROR: 'SERVER_ERROR',
    NOT_FOUND: 'NOT_FOUND',
    FORBIDDEN: 'FORBIDDEN'
  },

  // Success Messages
  SUCCESS_MESSAGES: {
    USER_REGISTERED: 'User registered successfully',
    LOGIN_SUCCESSFUL: 'Login successful',
    PROFILE_UPDATED: 'Profile updated successfully',
    PASSWORD_CHANGED: 'Password changed successfully',
    WALLET_TOPPED_UP: 'Wallet topped up successfully',
    PAYMENT_SUCCESSFUL: 'Payment successful',
    MERCHANT_REGISTERED: 'Merchant registered successfully',
    EVENT_CREATED: 'Event created successfully',
    REGISTRATION_SUCCESSFUL: 'Registration successful'
  },

  // File Upload
  FILE_UPLOAD: {
    MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
    ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'image/jpeg', 'image/png'],
    UPLOAD_PATHS: {
      AVATARS: './uploads/avatars/',
      QR_CODES: './uploads/qr-codes/',
      RECEIPTS: './uploads/receipts/',
      DOCUMENTS: './uploads/documents/',
      EVENT_MEDIA: './uploads/events/'
    }
  },

  // Notification Types
  NOTIFICATION_TYPES: {
    TRANSACTION_COMPLETED: 'transaction_completed',
    PAYMENT_RECEIVED: 'payment_received',
    WALLET_LOW_BALANCE: 'wallet_low_balance',
    EVENT_REMINDER: 'event_reminder',
    MERCHANT_VERIFICATION: 'merchant_verification',
    ACCOUNT_LOCKED: 'account_locked'
  },

  // Time Constants (in milliseconds)
  TIME: {
    SECOND: 1000,
    MINUTE: 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
    WEEK: 7 * 24 * 60 * 60 * 1000,
    MONTH: 30 * 24 * 60 * 60 * 1000
  }
};

module.exports = APP_CONSTANTS;
