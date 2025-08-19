const crypto = require('crypto');
const QRCode = require('qrcode');

/**
 * Generate unique transaction ID
 * Format: TXN + timestamp + random hex
 */
const generateTransactionId = () => {
  const timestamp = Date.now().toString();
  const randomBytes = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `TXN${timestamp}${randomBytes}`;
};

/**
 * Generate unique QR code
 * Format: TYPE_timestamp_randomhex
 */
const generateQrCode = (type = 'merchant') => {
  const timestamp = Date.now().toString();
  const randomBytes = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `${type.toUpperCase()}_${timestamp}_${randomBytes}`;
};

/**
 * Generate QR code image data URL
 */
const generateQrCodeImage = async (data, options = {}) => {
  try {
    const defaultOptions = {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: 256
    };

    const qrOptions = { ...defaultOptions, ...options };
    const dataURL = await QRCode.toDataURL(data, qrOptions);
    return dataURL;
  } catch (error) {
    console.error('QR Code generation error:', error);
    throw new Error('Failed to generate QR code');
  }
};

/**
 * Validate university email domain
 */
const validateUniversityEmail = (email) => {
  const universityDomains = [
    'university.edu',
    'college.ac.in',
    'student.university.edu',
    'xyz.edu.in' // Add your specific domains
  ];
  
  const domain = email.split('@')[1];
  return universityDomains.includes(domain?.toLowerCase());
};

/**
 * Format currency amount
 */
const formatCurrency = (amount, currency = 'INR') => {
  const formatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  return formatter.format(amount);
};

/**
 * Format Collex coins
 */
const formatCollexCoins = (amount) => {
  return `${amount.toLocaleString('en-IN')} Collex`;
};

/**
 * Convert rupees to Collex coins
 */
const rupeesToCollex = (rupees) => {
  const conversionRate = parseFloat(process.env.COLLEX_CONVERSION_RATE) || 1;
  return rupees * conversionRate;
};

/**
 * Convert Collex coins to rupees
 */
const collexToRupees = (collex) => {
  const conversionRate = parseFloat(process.env.COLLEX_CONVERSION_RATE) || 1;
  return collex / conversionRate;
};

/**
 * Generate secure random string
 */
const generateSecureToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Hash string using SHA-256
 */
const hashString = (str) => {
  return crypto.createHash('sha256').update(str).digest('hex');
};

/**
 * Generate OTP
 */
const generateOTP = (length = 6) => {
  const digits = '0123456789';
  let otp = '';
  
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  
  return otp;
};

/**
 * Validate phone number (Indian format)
 */
const validatePhoneNumber = (phone) => {
  const phoneRegex = /^[6-9]\d{9}$/;
  return phoneRegex.test(phone);
};

/**
 * Sanitize string for database storage
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  
  return str
    .trim()
    .replace(/[<>\"']/g, '') // Remove potentially dangerous characters
    .substring(0, 1000); // Limit length
};

/**
 * Generate slug from string
 */
const generateSlug = (str) => {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
};

/**
 * Check if date is valid
 */
const isValidDate = (date) => {
  return date instanceof Date && !isNaN(date);
};

/**
 * Format date for display
 */
const formatDate = (date, options = {}) => {
  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata'
  };
  
  const formatOptions = { ...defaultOptions, ...options };
  
  return new Intl.DateTimeFormat('en-IN', formatOptions).format(new Date(date));
};

/**
 * Calculate time difference in human readable format
 */
const getTimeAgo = (date) => {
  const now = new Date();
  const diffInSeconds = Math.floor((now - new Date(date)) / 1000);
  
  const intervals = [
    { label: 'year', seconds: 31536000 },
    { label: 'month', seconds: 2592000 },
    { label: 'week', seconds: 604800 },
    { label: 'day', seconds: 86400 },
    { label: 'hour', seconds: 3600 },
    { label: 'minute', seconds: 60 }
  ];
  
  for (const interval of intervals) {
    const count = Math.floor(diffInSeconds / interval.seconds);
    if (count >= 1) {
      return `${count} ${interval.label}${count !== 1 ? 's' : ''} ago`;
    }
  }
  
  return 'Just now';
};

/**
 * Generate random color for UI elements
 */
const generateRandomColor = () => {
  const colors = [
    '#1D4ED8', '#10B981', '#F97316', '#EF4444', 
    '#8B5CF6', '#06B6D4', '#84CC16', '#F59E0B'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

/**
 * Paginate array
 */
const paginateArray = (array, page = 1, limit = 10) => {
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  
  return {
    data: array.slice(startIndex, endIndex),
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(array.length / limit),
      totalItems: array.length,
      itemsPerPage: limit,
      hasNextPage: endIndex < array.length,
      hasPrevPage: startIndex > 0
    }
  };
};

/**
 * Deep clone object
 */
const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Remove empty/null/undefined values from object
 */
const removeEmpty = (obj) => {
  const cleaned = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && value !== undefined && value !== '') {
      if (typeof value === 'object' && !Array.isArray(value)) {
        const nestedCleaned = removeEmpty(value);
        if (Object.keys(nestedCleaned).length > 0) {
          cleaned[key] = nestedCleaned;
        }
      } else {
        cleaned[key] = value;
      }
    }
  }
  
  return cleaned;
};

/**
 * Calculate percentage
 */
const calculatePercentage = (value, total) => {
  if (total === 0) return 0;
  return ((value / total) * 100).toFixed(2);
};

/**
 * Generate API key
 */
const generateApiKey = () => {
  return `clx_${generateSecureToken(32)}`;
};

/**
 * Validate API key format
 */
const validateApiKey = (key) => {
  return /^clx_[a-f0-9]{64}$/.test(key);
};

module.exports = {
  generateTransactionId,
  generateQrCode,
  generateQrCodeImage,
  validateUniversityEmail,
  formatCurrency,
  formatCollexCoins,
  rupeesToCollex,
  collexToRupees,
  generateSecureToken,
  hashString,
  generateOTP,
  validatePhoneNumber,
  sanitizeString,
  generateSlug,
  isValidDate,
  formatDate,
  getTimeAgo,
  generateRandomColor,
  paginateArray,
  deepClone,
  removeEmpty,
  calculatePercentage,
  generateApiKey,
  validateApiKey
};
