const { paymentsApi, refundsApi, locationId } = require('../config/square');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class PaymentService {
  /**
   * Create payment with Square API
   */
  async createPayment(paymentData) {
    try {
      const { 
        nonce, 
        amount, 
        currency = 'USD', 
        note = 'Hackspree Wallet Top-up',
        buyerEmailAddress,
        userId,
        idempotencyKey = uuidv4()
      } = paymentData;

      // Validate required fields
      if (!nonce || !amount) {
        throw new Error('Payment nonce and amount are required');
      }

      // Convert amount to smallest currency unit (cents)
      const amountInCents = Math.round(amount * 100);

      if (amountInCents < 1) {
        throw new Error('Amount must be at least $0.01');
      }

      const requestBody = {
        sourceId: nonce,
        idempotencyKey,
        amountMoney: {
          amount: amountInCents,
          currency: currency
        },
        locationId,
        note,
        buyerEmailAddress,
        referenceId: `user_${userId}_${Date.now()}`,
        autocomplete: true
      };

      console.log('Creating Square payment with body:', JSON.stringify(requestBody, null, 2));

      const { result } = await paymentsApi.createPayment(requestBody);
      
      return {
        success: true,
        payment: result.payment,
        paymentId: result.payment.id,
        status: result.payment.status,
        receiptUrl: result.payment.receiptUrl || null,
        createdAt: result.payment.createdAt,
        updatedAt: result.payment.updatedAt
      };

    } catch (error) {
      console.error('Square payment error:', error);
      
      if (error.result && error.result.errors) {
        const errorDetails = error.result.errors.map(err => ({
          category: err.category,
          code: err.code,
          detail: err.detail,
          field: err.field
        }));
        
        return {
          success: false,
          errors: errorDetails,
          message: errorDetails[0]?.detail || 'Payment failed'
        };
      }
      
      return {
        success: false,
        message: error.message || 'Payment processing failed',
        error: error.message
      };
    }
  }

  /**
   * Get payment details
   */
  async getPayment(paymentId) {
    try {
      const { result } = await paymentsApi.getPayment(paymentId);
      return {
        success: true,
        payment: result.payment
      };
    } catch (error) {
      console.error('Get payment error:', error);
      return {
        success: false,
        message: 'Failed to retrieve payment details',
        error: error.message
      };
    }
  }

  /**
   * Refund payment
   */
  async refundPayment(paymentId, refundAmount, reason = 'Customer refund') {
    try {
      const idempotencyKey = uuidv4();
      const refundAmountInCents = Math.round(refundAmount * 100);

      const requestBody = {
        idempotencyKey,
        amountMoney: {
          amount: refundAmountInCents,
          currency: 'USD'
        },
        paymentId,
        reason
      };

      const { result } = await refundsApi.refundPayment(requestBody);
      
      return {
        success: true,
        refund: result.refund,
        refundId: result.refund.id,
        status: result.refund.status
      };
    } catch (error) {
      console.error('Refund error:', error);
      return {
        success: false,
        message: 'Refund processing failed',
        error: error.message
      };
    }
  }

  /**
   * List payments
   */
  async listPayments(locationId, beginTime = null, endTime = null) {
    try {
      const requestBody = {
        locationId,
        beginTime: beginTime || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
        endTime: endTime || new Date().toISOString()
      };

      const { result } = await paymentsApi.listPayments(requestBody);
      
      return {
        success: true,
        payments: result.payments || [],
        cursor: result.cursor
      };
    } catch (error) {
      console.error('List payments error:', error);
      return {
        success: false,
        message: 'Failed to retrieve payments',
        error: error.message
      };
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(body, signature, url) {
    try {
      const stringBody = typeof body === 'string' ? body : JSON.stringify(body);
      const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
      
      if (!signatureKey) {
        throw new Error('Square webhook signature key not configured');
      }
      
      const stringToSign = url + stringBody;
      const hmac = crypto.createHmac('sha256', signatureKey);
      hmac.update(stringToSign);
      const expectedSignature = hmac.digest('base64');
      
      return expectedSignature === signature;
    } catch (error) {
      console.error('Webhook verification error:', error);
      return false;
    }
  }

  /**
   * Calculate processing fee
   */
  calculateProcessingFee(amount) {
    // Square's typical fee structure: 2.9% + 30¢
    const percentageFee = amount * 0.029;
    const fixedFee = 0.30;
    return Math.round((percentageFee + fixedFee) * 100) / 100;
  }
}

module.exports = new PaymentService();
