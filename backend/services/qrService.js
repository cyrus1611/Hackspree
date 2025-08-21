const QRCode = require('qrcode');
const crypto = require('crypto');
const moment = require('moment');

// Import models and services
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Merchant = require('../models/Merchant');
const Event = require('../models/Event');
const encryptionService = require('./encryptionService');
const config = require('../config');

/**
 * Comprehensive QR Code Service for Hackspree Wallet Application
 * 
 * Features:
 * - Payment QR codes for transactions and invoices
 * - Wallet transfer QR codes with encryption
 * - Event check-in and registration QR codes
 * - Merchant payment integration QR codes
 * - Authentication and verification QR codes
 * - Secure data encoding and validation
 * - Multiple output formats (Data URL, Buffer, SVG)
 * - Custom branding and styling options
 * - Batch QR code generation
 * - QR code analytics and tracking
 */

class QRService {
  constructor() {
    this.config = {
      // Default QR code options
      defaultOptions: {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        width: 256,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      },

      // Security settings
      security: {
        encryptionKey: config.qr?.encryptionKey || process.env.QR_ENCRYPTION_KEY,
        expirationTime: 30 * 60 * 1000, // 30 minutes default
        maxUsageCount: 1, // Single use by default
        requireSignature: true
      },

      // Payment settings
      payment: {
        maxAmount: 10000, // Maximum amount for QR payment
        supportedCurrencies: ['USD', 'EUR', 'GBP'],
        merchantFeePercentage: 2.5
      },

      // Branding
      branding: {
        logo: process.env.QR_LOGO_PATH || null,
        brandColors: {
          primary: '#4F46E5',
          secondary: '#10B981'
        }
      }
    };
  }

  /**
   * CORE QR CODE GENERATION METHODS
   */

  /**
   * Generate QR code as data URL
   */
  async generateDataURL(data, options = {}) {
    try {
      const mergedOptions = { ...this.config.defaultOptions, ...options };
      return await QRCode.toDataURL(data, mergedOptions);
    } catch (error) {
      throw new Error(`Failed to generate QR code data URL: ${error.message}`);
    }
  }

  /**
   * Generate QR code as buffer
   */
  async generateBuffer(data, options = {}) {
    try {
      const mergedOptions = { ...this.config.defaultOptions, ...options };
      return await QRCode.toBuffer(data, mergedOptions);
    } catch (error) {
      throw new Error(`Failed to generate QR code buffer: ${error.message}`);
    }
  }

  /**
   * Generate QR code as SVG string
   */
  async generateSVG(data, options = {}) {
    try {
      const mergedOptions = { 
        ...this.config.defaultOptions, 
        ...options,
        type: 'svg'
      };
      return await QRCode.toString(data, mergedOptions);
    } catch (error) {
      throw new Error(`Failed to generate QR code SVG: ${error.message}`);
    }
  }

  /**
   * Generate QR code with custom styling and branding
   */
  async generateBrandedQR(data, customOptions = {}) {
    const options = {
      ...this.config.defaultOptions,
      ...customOptions,
      color: {
        dark: customOptions.primaryColor || this.config.branding.brandColors.primary,
        light: customOptions.backgroundColor || '#FFFFFF'
      },
      width: customOptions.size || 300
    };

    // Add logo if specified and available
    if (this.config.branding.logo && customOptions.includeLogo !== false) {
      // Note: Logo embedding would require additional image processing
      // This is a placeholder for logo integration
    }

    return await this.generateDataURL(data, options);
  }

  /**
   * PAYMENT QR CODE METHODS
   */

  /**
   * Generate payment request QR code
   */
  async generatePaymentQR(paymentData) {
    const {
      amount,
      currency = 'USD',
      merchantId,
      description,
      orderId,
      expiresIn = 30 * 60 * 1000, // 30 minutes
      metadata = {}
    } = paymentData;

    // Validate payment data
    this.validatePaymentData({ amount, currency, merchantId });

    // Create secure payment payload
    const paymentPayload = {
      type: 'payment_request',
      amount: parseFloat(amount).toFixed(2),
      currency,
      merchantId,
      description: description || 'Payment Request',
      orderId: orderId || this.generateOrderId(),
      timestamp: Date.now(),
      expiresAt: Date.now() + expiresIn,
      metadata,
      nonce: crypto.randomBytes(16).toString('hex')
    };

    // Encrypt and sign the payload for security
    const securePayload = await this.createSecurePayload(paymentPayload);

    // Generate payment URL or encoded data
    const paymentUrl = `${config.app.baseUrl}/payment/qr/${securePayload}`;

    return {
      qrCode: await this.generateBrandedQR(paymentUrl, {
        errorCorrectionLevel: 'H',
        width: 300
      }),
      paymentData: paymentPayload,
      paymentUrl,
      expiresAt: new Date(paymentPayload.expiresAt)
    };
  }

  /**
   * Generate merchant payment QR code
   */
  async generateMerchantPaymentQR(merchantId, customization = {}) {
    const merchant = await Merchant.findById(merchantId);
    if (!merchant) {
      throw new Error('Merchant not found');
    }

    const merchantPayload = {
      type: 'merchant_payment',
      merchantId: merchant._id,
      merchantName: merchant.businessName,
      category: merchant.category,
      location: merchant.location,
      acceptedPayments: ['wallet', 'card'],
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex')
    };

    const securePayload = await this.createSecurePayload(merchantPayload);
    const paymentUrl = `${config.app.baseUrl}/merchant/pay/${securePayload}`;

    return {
      qrCode: await this.generateBrandedQR(paymentUrl, {
        primaryColor: customization.brandColor || merchant.brandColor,
        width: customization.size || 250,
        ...customization
      }),
      merchantData: merchantPayload,
      paymentUrl
    };
  }

  /**
   * Generate invoice QR code
   */
  async generateInvoiceQR(invoiceData) {
    const {
      invoiceId,
      amount,
      currency,
      dueDate,
      merchantId,
      customerEmail,
      items = [],
      taxes = [],
      discounts = []
    } = invoiceData;

    const invoicePayload = {
      type: 'invoice_payment',
      invoiceId,
      amount: parseFloat(amount).toFixed(2),
      currency,
      dueDate,
      merchantId,
      customerEmail,
      items,
      taxes,
      discounts,
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex')
    };

    const securePayload = await this.createSecurePayload(invoicePayload);
    const invoiceUrl = `${config.app.baseUrl}/invoice/pay/${securePayload}`;

    return {
      qrCode: await this.generateBrandedQR(invoiceUrl, {
        errorCorrectionLevel: 'H',
        width: 300
      }),
      invoiceData: invoicePayload,
      invoiceUrl
    };
  }

  /**
   * WALLET TRANSFER QR CODE METHODS
   */

  /**
   * Generate wallet transfer QR code
   */
  async generateWalletTransferQR(walletId, transferData = {}) {
    const wallet = await Wallet.findById(walletId).populate('userId');
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const {
      amount,
      message,
      requestId,
      expiresIn = 10 * 60 * 1000 // 10 minutes for transfers
    } = transferData;

    const transferPayload = {
      type: 'wallet_transfer',
      walletId: wallet._id,
      userId: wallet.userId._id,
      userName: wallet.userId.name,
      amount: amount ? parseFloat(amount).toFixed(2) : null,
      message: message || 'Wallet Transfer',
      requestId: requestId || crypto.randomBytes(16).toString('hex'),
      timestamp: Date.now(),
      expiresAt: Date.now() + expiresIn,
      nonce: crypto.randomBytes(16).toString('hex')
    };

    const securePayload = await this.createSecurePayload(transferPayload);
    const transferUrl = `${config.app.baseUrl}/wallet/transfer/${securePayload}`;

    return {
      qrCode: await this.generateBrandedQR(transferUrl, {
        primaryColor: '#10B981',
        width: 250
      }),
      transferData: transferPayload,
      transferUrl,
      expiresAt: new Date(transferPayload.expiresAt)
    };
  }

  /**
   * Generate wallet receive QR code
   */
  async generateWalletReceiveQR(walletId) {
    const wallet = await Wallet.findById(walletId).populate('userId');
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const receivePayload = {
      type: 'wallet_receive',
      walletId: wallet._id,
      walletAddress: wallet.walletId,
      userId: wallet.userId._id,
      userName: wallet.userId.name,
      currency: wallet.currency,
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex')
    };

    const securePayload = await this.createSecurePayload(receivePayload);
    const receiveUrl = `${config.app.baseUrl}/wallet/send/${securePayload}`;

    return {
      qrCode: await this.generateBrandedQR(receiveUrl, {
        primaryColor: '#3B82F6',
        width: 250
      }),
      receiveData: receivePayload,
      receiveUrl
    };
  }

  /**
   * EVENT QR CODE METHODS
   */

  /**
   * Generate event registration QR code
   */
  async generateEventRegistrationQR(eventId, registrationData = {}) {
    const event = await Event.findById(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    const {
      userId,
      ticketType = 'standard',
      price,
      promoCode,
      expiresIn = 24 * 60 * 60 * 1000 // 24 hours
    } = registrationData;

    const registrationPayload = {
      type: 'event_registration',
      eventId: event._id,
      eventTitle: event.title,
      eventDate: event.schedule.startDate,
      userId,
      ticketType,
      price: price || event.pricing.amount,
      promoCode,
      timestamp: Date.now(),
      expiresAt: Date.now() + expiresIn,
      nonce: crypto.randomBytes(16).toString('hex')
    };

    const securePayload = await this.createSecurePayload(registrationPayload);
    const registrationUrl = `${config.app.baseUrl}/event/register/${securePayload}`;

    return {
      qrCode: await this.generateBrandedQR(registrationUrl, {
        primaryColor: '#8B5CF6',
        width: 300
      }),
      registrationData: registrationPayload,
      registrationUrl,
      expiresAt: new Date(registrationPayload.expiresAt)
    };
  }

  /**
   * Generate event check-in QR code
   */
  async generateEventCheckInQR(eventId, attendeeId) {
    const event = await Event.findById(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    const checkInPayload = {
      type: 'event_checkin',
      eventId: event._id,
      eventTitle: event.title,
      attendeeId,
      checkInCode: crypto.randomBytes(8).toString('hex').toUpperCase(),
      timestamp: Date.now(),
      validUntil: event.schedule.endDate,
      nonce: crypto.randomBytes(16).toString('hex')
    };

    const securePayload = await this.createSecurePayload(checkInPayload);
    const checkInUrl = `${config.app.baseUrl}/event/checkin/${securePayload}`;

    return {
      qrCode: await this.generateBrandedQR(checkInUrl, {
        primaryColor: '#F59E0B',
        width: 200
      }),
      checkInData: checkInPayload,
      checkInUrl,
      checkInCode: checkInPayload.checkInCode
    };
  }

  /**
   * AUTHENTICATION QR CODE METHODS
   */

  /**
   * Generate login QR code for mobile app
   */
  async generateLoginQR(sessionData = {}) {
    const {
      sessionId = crypto.randomUUID(),
      deviceInfo,
      ipAddress,
      expiresIn = 5 * 60 * 1000 // 5 minutes
    } = sessionData;

    const loginPayload = {
      type: 'mobile_login',
      sessionId,
      deviceInfo,
      ipAddress,
      timestamp: Date.now(),
      expiresAt: Date.now() + expiresIn,
      nonce: crypto.randomBytes(16).toString('hex')
    };

    const securePayload = await this.createSecurePayload(loginPayload);
    const loginUrl = `${config.app.baseUrl}/auth/qr-login/${securePayload}`;

    return {
      qrCode: await this.generateBrandedQR(loginUrl, {
        primaryColor: '#6366F1',
        width: 250
      }),
      loginData: loginPayload,
      loginUrl,
      sessionId,
      expiresAt: new Date(loginPayload.expiresAt)
    };
  }

  /**
   * Generate 2FA setup QR code
   */
  async generate2FAQR(userId, secret) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const totpUrl = `otpauth://totp/Hackspree%20Wallet:${encodeURIComponent(user.email)}?secret=${secret}&issuer=Hackspree%20Wallet`;

    return {
      qrCode: await this.generateBrandedQR(totpUrl, {
        errorCorrectionLevel: 'H',
        width: 250
      }),
      secret,
      totpUrl
    };
  }

  /**
   * UTILITY AND SECURITY METHODS
   */

  /**
   * Create secure encrypted payload
   */
  async createSecurePayload(data) {
    if (!this.config.security.encryptionKey) {
      // If encryption is not configured, use base64 encoding (not recommended for production)
      return Buffer.from(JSON.stringify(data)).toString('base64url');
    }

    // Add signature for integrity
    if (this.config.security.requireSignature) {
      data.signature = this.generateSignature(data);
    }

    // Encrypt the payload
    const encrypted = await encryptionService.encrypt(
      JSON.stringify(data), 
      this.config.security.encryptionKey
    );

    return encrypted;
  }

  /**
   * Decode and verify secure payload
   */
  async decodeSecurePayload(payload) {
    let data;

    if (!this.config.security.encryptionKey) {
      // Base64 decoding fallback
      const decoded = Buffer.from(payload, 'base64url').toString();
      data = JSON.parse(decoded);
    } else {
      // Decrypt the payload
      const decrypted = await encryptionService.decrypt(
        payload, 
        this.config.security.encryptionKey
      );
      data = JSON.parse(decrypted);
    }

    // Verify signature if required
    if (this.config.security.requireSignature) {
      const expectedSignature = this.generateSignature(data);
      if (data.signature !== expectedSignature) {
        throw new Error('Invalid payload signature');
      }
    }

    // Check expiration
    if (data.expiresAt && Date.now() > data.expiresAt) {
      throw new Error('QR code has expired');
    }

    return data;
  }

  /**
   * Generate signature for payload integrity
   */
  generateSignature(data) {
    const { signature, ...dataWithoutSignature } = data;
    const dataString = JSON.stringify(dataWithoutSignature);
    return crypto
      .createHmac('sha256', this.config.security.encryptionKey)
      .update(dataString)
      .digest('hex');
  }

  /**
   * Validate payment data
   */
  validatePaymentData({ amount, currency, merchantId }) {
    if (!amount || amount <= 0) {
      throw new Error('Invalid payment amount');
    }

    if (amount > this.config.payment.maxAmount) {
      throw new Error(`Amount exceeds maximum limit of ${this.config.payment.maxAmount}`);
    }

    if (!this.config.payment.supportedCurrencies.includes(currency)) {
      throw new Error(`Unsupported currency: ${currency}`);
    }

    if (!merchantId) {
      throw new Error('Merchant ID is required');
    }
  }

  /**
   * Generate unique order ID
   */
  generateOrderId() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `ORD_${timestamp}_${random}`.toUpperCase();
  }

  /**
   * BATCH GENERATION METHODS
   */

  /**
   * Generate multiple QR codes in batch
   */
  async generateBatch(qrRequests) {
    const results = [];

    for (const request of qrRequests) {
      try {
        let qrResult;

        switch (request.type) {
          case 'payment':
            qrResult = await this.generatePaymentQR(request.data);
            break;
          case 'wallet_transfer':
            qrResult = await this.generateWalletTransferQR(request.walletId, request.data);
            break;
          case 'event_registration':
            qrResult = await this.generateEventRegistrationQR(request.eventId, request.data);
            break;
          case 'merchant_payment':
            qrResult = await this.generateMerchantPaymentQR(request.merchantId, request.customization);
            break;
          default:
            throw new Error(`Unsupported QR type: ${request.type}`);
        }

        results.push({
          id: request.id || crypto.randomUUID(),
          type: request.type,
          success: true,
          data: qrResult
        });
      } catch (error) {
        results.push({
          id: request.id || crypto.randomUUID(),
          type: request.type,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * ANALYTICS AND TRACKING METHODS
   */

  /**
   * Track QR code usage
   */
  async trackQRUsage(qrId, action, metadata = {}) {
    // Implementation would depend on your analytics service
    console.log(`QR ${qrId}: ${action}`, metadata);
  }

  /**
   * Get QR code analytics
   */
  async getQRAnalytics(qrId, timeframe = '24h') {
    // This would integrate with your analytics service
    return {
      qrId,
      scans: 0,
      uniqueScans: 0,
      conversions: 0,
      timeframe
    };
  }
}

module.exports = new QRService();
