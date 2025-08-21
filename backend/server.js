const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Client, Environment } = require('squareup');
const EncryptionManager = require('./utils/encryption');
require('dotenv').config();

const app = express();
const encryption = new EncryptionManager();

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? 
    'https://yourdomain.com' : 
    ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Initialize Square client
const { PaymentsApi, CustomersApi, LocationsApi } = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT === 'production' 
    ? Environment.Production 
    : Environment.Sandbox,
});

// Generate keys endpoint (development only)
app.get('/generate-keys', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not available in production' });
  }

  res.json({
    masterKey: EncryptionManager.generateMasterKey(),
    cardKey: EncryptionManager.generateCardKey(),
    webhookSecret: crypto.randomBytes(32).toString('hex')
  });
});

// Secure payment processing endpoint
app.post('/process-payment', async (req, res) => {
  try {
    const { 
      sourceId, 
      amount, 
      currency = 'USD', 
      customerId, 
      note,
      billingAddress,
      customerData 
    } = req.body;

    // Input validation
    if (!sourceId || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment parameters'
      });
    }

    // Encrypt sensitive customer data if provided
    let encryptedCustomerData = null;
    if (customerData) {
      encryptedCustomerData = encryption.encryptData(customerData, true);
    }

    // Convert amount to cents
    const amountInCents = Math.round(parseFloat(amount) * 100);

    const paymentRequest = {
      sourceId,
      idempotencyKey: crypto.randomUUID(),
      amountMoney: {
        amount: BigInt(amountInCents),
        currency: currency
      },
      locationId: process.env.SQUARE_LOCATION_ID,
      acceptPartialAuthorization: false,
      autocomplete: true
    };

    // Add optional fields securely
    if (customerId) {
      paymentRequest.customerId = customerId;
    }
    
    if (note) {
      paymentRequest.note = note.substring(0, 500); // Limit note length
    }

    if (billingAddress) {
      paymentRequest.billingAddress = {
        addressLine1: billingAddress.addressLine1,
        addressLine2: billingAddress.addressLine2,
        locality: billingAddress.city,
        administrativeDistrictLevel1: billingAddress.state,
        postalCode: billingAddress.postalCode,
        country: billingAddress.country || 'US'
      };
    }

    // Process payment with Square
    const { result } = await PaymentsApi.createPayment(paymentRequest);

    // Encrypt payment result for logging
    const encryptedPaymentLog = encryption.encryptData({
      paymentId: result.payment.id,
      amount: amountInCents,
      timestamp: new Date().toISOString(),
      status: result.payment.status
    });

    // Log encrypted payment data (implement your logging system)
    console.log('Payment processed:', encryptedPaymentLog);

    // Return success response (never expose sensitive data)
    res.json({
      success: true,
      paymentId: result.payment.id,
      status: result.payment.status,
      receiptNumber: result.payment.receiptNumber,
      createdAt: result.payment.createdAt
    });

  } catch (error) {
    console.error('Payment processing error:', error);

    // Handle Square-specific errors
    if (error.result && error.result.errors) {
      const squareErrors = error.result.errors.map(err => ({
        category: err.category,
        code: err.code,
        detail: err.detail
      }));

      return res.status(400).json({
        success: false,
        errors: squareErrors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Payment processing failed'
    });
  }
});

// Secure customer creation endpoint
app.post('/create-customer', async (req, res) => {
  try {
    const { 
      givenName, 
      familyName, 
      emailAddress, 
      phoneNumber,
      address 
    } = req.body;

    // Input sanitization and validation
    const sanitizedData = {
      givenName: givenName?.trim().substring(0, 300),
      familyName: familyName?.trim().substring(0, 300),
      emailAddress: emailAddress?.trim().toLowerCase(),
      phoneNumber: phoneNumber?.replace(/[^\d+\-\s]/g, '')
    };

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (sanitizedData.emailAddress && !emailRegex.test(sanitizedData.emailAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email address'
      });
    }

    const customerRequest = sanitizedData;

    // Add address if provided
    if (address) {
      customerRequest.address = {
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2,
        locality: address.city,
        administrativeDistrictLevel1: address.state,
        postalCode: address.postalCode,
        country: address.country || 'US'
      };
    }

    const { result } = await CustomersApi.createCustomer(customerRequest);

    // Encrypt customer data for secure storage
    const encryptedCustomer = encryption.encryptData({
      customerId: result.customer.id,
      email: sanitizedData.emailAddress,
      createdAt: result.customer.createdAt
    });

    console.log('Customer created:', encryptedCustomer);

    res.json({
      success: true,
      customerId: result.customer.id,
      createdAt: result.customer.createdAt
    });

  } catch (error) {
    console.error('Customer creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create customer'
    });
  }
});

// Payment configuration endpoint
app.get('/payment-config', (req, res) => {
  res.json({
    applicationId: process.env.SQUARE_APPLICATION_ID,
    locationId: process.env.SQUARE_LOCATION_ID,
    environment: process.env.SQUARE_ENVIRONMENT
  });
});

// Secure webhook endpoint with signature verification
app.post('/webhooks/square', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const signature = req.headers['x-square-hmacsha256-signature'];
    const body = req.body.toString('utf8');
    
    // Verify webhook signature
    const webhookSecret = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    if (!signature || !webhookSecret) {
      console.error('Missing webhook signature or secret');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify HMAC signature
    const isValidSignature = encryption.verifyHMAC(
      body, 
      signature, 
      webhookSecret
    );

    if (!isValidSignature) {
      console.error('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(body);
    console.log('Webhook event received:', event.type);

    // Handle different event types securely
    switch (event.type) {
      case 'payment.created':
        handlePaymentCreated(event.data.object.payment);
        break;
      case 'payment.updated':
        handlePaymentUpdated(event.data.object.payment);
        break;
      case 'payment.failed':
        handlePaymentFailed(event.data.object.payment);
        break;
      default:
        console.log('Unhandled event type:', event.type);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ success: false });
  }
});

// Webhook event handlers
function handlePaymentCreated(payment) {
  const encryptedLog = encryption.encryptData({
    event: 'payment.created',
    paymentId: payment.id,
    amount: payment.totalMoney.amount,
    status: payment.status,
    timestamp: new Date().toISOString()
  });
  
  console.log('Payment created event:', encryptedLog);
  // Add your business logic here
}

function handlePaymentUpdated(payment) {
  const encryptedLog = encryption.encryptData({
    event: 'payment.updated',
    paymentId: payment.id,
    status: payment.status,
    timestamp: new Date().toISOString()
  });
  
  console.log('Payment updated event:', encryptedLog);
  // Add your business logic here
}

function handlePaymentFailed(payment) {
  const encryptedLog = encryption.encryptData({
    event: 'payment.failed',
    paymentId: payment.id,
    status: payment.status,
    timestamp: new Date().toISOString()
  });
  
  console.log('Payment failed event:', encryptedLog);
  // Add your business logic here
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.SQUARE_ENVIRONMENT
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Secure Square Payment server running on port ${PORT}`);
  console.log(`Environment: ${process.env.SQUARE_ENVIRONMENT}`);
});

module.exports = app;
