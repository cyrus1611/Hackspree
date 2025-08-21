const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const walletController = require('../controllers/walletController');
const authMiddleware = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');

const router = express.Router();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Validation rules
const createWalletValidation = [
  body('userId')
    .isMongoId()
    .withMessage('Valid user ID is required')
];

const topUpOrderValidation = [
  body('userId')
    .isMongoId()
    .withMessage('Valid user ID is required'),
  body('amount')
    .isFloat({ min: 0.01, max: 10000 })
    .withMessage('Amount must be between $0.01 and $10,000')
];

const processTopUpValidation = [
  body('nonce')
    .notEmpty()
    .withMessage('Square payment nonce is required'),
  body('transactionId')
    .notEmpty()
    .withMessage('Transaction ID is required'),
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Valid amount is required')
];

const transferValidation = [
  body('fromUserId')
    .isMongoId()
    .withMessage('Valid sender user ID is required'),
  body('toUserId')
    .isMongoId()
    .withMessage('Valid receiver user ID is required'),
  body('amount')
    .isFloat({ min: 0.01, max: 5000 })
    .withMessage('Transfer amount must be between $0.01 and $5,000'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters')
];

const userIdValidation = [
  param('userId')
    .isMongoId()
    .withMessage('Valid user ID is required')
];

const transactionIdValidation = [
  param('transactionId')
    .notEmpty()
    .withMessage('Transaction ID is required')
];

const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('type')
    .optional()
    .isIn(['CREDIT', 'DEBIT'])
    .withMessage('Invalid transaction type'),
  query('status')
    .optional()
    .isIn(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'])
    .withMessage('Invalid status'),
  query('category')
    .optional()
    .isIn(['TRANSFER', 'TOP_UP', 'WITHDRAWAL', 'PAYMENT', 'REFUND', 'REVERSAL'])
    .withMessage('Invalid category')
];

// Routes

// Create wallet
router.post('/create', 
  authMiddleware,
  createWalletValidation,
  handleValidationErrors,
  walletController.createWallet
);

// Get wallet balance
router.get('/balance/:userId',
  authMiddleware,
  userIdValidation,
  handleValidationErrors,
  walletController.getBalance
);

// Create top-up order
router.post('/topup/create-order',
  authMiddleware,
  rateLimiter.topup,
  topUpOrderValidation,
  handleValidationErrors,
  walletController.createTopUpOrder
);

// Process Square payment for top-up
router.post('/topup/process',
  authMiddleware,
  rateLimiter.topup,
  processTopUpValidation,
  handleValidationErrors,
  walletController.processTopUp
);

// Transfer money between wallets
router.post('/transfer',
  authMiddleware,
  rateLimiter.transfer,
  transferValidation,
  handleValidationErrors,
  walletController.transferMoney
);

// Get transaction history
router.get('/transactions/:userId',
  authMiddleware,
  userIdValidation,
  paginationValidation,
  handleValidationErrors,
  walletController.getTransactionHistory
);

// Get specific transaction details
router.get('/transaction/:transactionId',
  authMiddleware,
  transactionIdValidation,
  handleValidationErrors,
  walletController.getTransactionDetails
);

module.exports = router;
