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
        note = 'Collex Wallet Top-up',
        buyerEmailAddress,
        userId,
        idempotencyKey = uuidv4()
      } = paymentData;

      // Convert amount to smallest currency unit (cents)
      const amountInCents = Math.round(amount * 100);

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

      const { result } = await paymentsApi.createPayment(requestBody);
      
      return {
        success: true,
        payment: result.payment,
        paymentId: result.payment.id,
        status: result.payment.status,
        receiptUrl: result.payment.receiptUrl || null
      };

    } catch (error) {
      console.error('Square payment error:', error);
      
      return {
        success: false,
        error: error.result?.errors || [{ detail: error.message }],
        message: error.result?.errors?.[0]?.detail || 'Payment failed'
      };
    }
  }

  /**
   * Get payment details
   */
  async getPayment(paymentId) {
    try {
      const { result } = await paymentsApi.getPayment(paymentId);
      return { success: true, payment: result.payment };
    } catch (error) {
      console.error('Get payment error:', error);
      return { success: false, message: 'Failed to retrieve payment' };
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
      
      return { success: true, refund: result.refund };
    } catch (error) {
      console.error('Refund error:', error);
      return { success: false, message: 'Refund failed' };
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(body, signature, url) {
    try {
      const stringBody = typeof body === 'string' ? body : JSON.stringify(body);
      const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
      
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
}

module.exports = new PaymentService();
