const crypto = require('crypto');

class Helpers {
  /**
   * Generate unique transaction ID
   */
  static generateTransactionId(prefix = 'TXN') {
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `${prefix}_${timestamp}_${randomString}`;
  }

  /**
   * Generate unique wallet ID
   */
  static generateWalletId(userId) {
    const timestamp = Date.now();
    const userIdSuffix = userId.toString().slice(-4);
    const randomString = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `WALLET_${timestamp}_${userIdSuffix}_${randomString}`;
  }

  /**
   * Format currency amount
   */
  static formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  }

  /**
   * Validate email format
   */
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Generate secure random string
   */
  static generateSecureString(length = 32) {
    return crypto.randomBytes(Math.ceil(length / 2))
      .toString('hex')
      .slice(0, length);
  }

  /**
   * Hash password
   */
  static async hashPassword(password) {
    const bcrypt = require('bcryptjs');
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Compare password with hash
   */
  static async comparePassword(password, hash) {
    const bcrypt = require('bcryptjs');
    return await bcrypt.compare(password, hash);
  }

  /**
   * Calculate percentage
   */
  static calculatePercentage(value, total) {
    if (total === 0) return 0;
    return Math.round((value / total) * 100 * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Generate pagination metadata
   */
  static generatePagination(page, limit, totalCount) {
    const totalPages = Math.ceil(totalCount / limit);
    return {
      currentPage: page,
      totalPages,
      totalItems: totalCount,
      itemsPerPage: limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      nextPage: page < totalPages ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null
    };
  }

  /**
   * Sanitize string for security
   */
  static sanitizeString(str) {
    if (typeof str !== 'string') return str;
    return str
      .trim()
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .substring(0, 1000); // Limit length
  }

  /**
   * Get time difference in human readable format
   */
  static getTimeAgo(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - new Date(date)) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 604800)} weeks ago`;
    
    return new Date(date).toLocaleDateString();
  }

  /**
   * Validate transaction amount
   */
  static validateTransactionAmount(amount) {
    const numAmount = parseFloat(amount);
    
    if (isNaN(numAmount)) {
      return { valid: false, error: 'Amount must be a valid number' };
    }
    
    if (numAmount <= 0) {
      return { valid: false, error: 'Amount must be greater than 0' };
    }
    
    if (numAmount > 10000) {
      return { valid: false, error: 'Amount cannot exceed $10,000' };
    }
    
    // Check for more than 2 decimal places
    if (numAmount.toString().split('.')[1]?.length > 2) {
      return { valid: false, error: 'Amount cannot have more than 2 decimal places' };
    }
    
    return { valid: true, amount: numAmount };
  }

  /**
   * Generate API response format
   */
  static formatApiResponse(success, message, data = null, errors = null) {
    const response = {
      success,
      message,
      timestamp: new Date().toISOString()
    };
    
    if (data !== null) response.data = data;
    if (errors !== null) response.errors = errors;
    
    return response;
  }

  /**
   * Log API requests
   */
  static logRequest(req, message = 'API Request') {
    console.log(`[${new Date().toISOString()}] ${message}:`, {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id || 'anonymous'
    });
  }

  /**
   * Mask sensitive data for logging
   */
  static maskSensitiveData(data, fields = ['password', 'pin', 'nonce', 'token']) {
    if (typeof data !== 'object' || data === null) return data;
    
    const maskedData = { ...data };
    
    fields.forEach(field => {
      if (maskedData[field]) {
        maskedData[field] = '***masked***';
      }
    });
    
    return maskedData;
  }

  /**
   * Generate unique reference ID
   */
  static generateReferenceId(prefix = 'REF') {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}_${timestamp}_${random}`;
  }
}

module.exports = Helpers;
