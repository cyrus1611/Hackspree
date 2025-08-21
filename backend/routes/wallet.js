const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const walletController = require('../controllers/walletController');

const router = express.Router();

// Validation middleware
const validateTopUpAmount = [
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0')
    .custom(value => {
      const minAmount = parseFloat(process.env.MIN_TOPUP_AMOUNT) || 1;
      const maxAmount = parseFloat(process.env.MAX_TOPUP_AMOUNT) || 10000;
      
      if (value < minAmount) {
        throw new Error(`Minimum top-up amount is $${minAmount}`);
      }
      if (value > maxAmount) {
        throw new Error(`Maximum top-up amount is $${maxAmount}`);
      }
      return true;
    })
];

const validatePaymentProcessing = [
  body('nonce').notEmpty().withMessage('Payment nonce is required'),
  body('transactionId').notEmpty().withMessage('Transaction ID is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Valid amount is required')
];

// Routes
router.get('/balance', auth, walletController.getBalance);
router.post('/topup/create-order', auth, validateTopUpAmount, walletController.createTopUpOrder);
router.post('/topup/process', auth, validatePaymentProcessing, walletController.processTopUp);

module.exports = router;
