const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  currency: {
    type: String,
    default: 'USD',
    uppercase: true
  },
  type: {
    type: String,
    enum: ['CREDIT', 'DEBIT'],
    required: true
  },
  category: {
    type: String,
    enum: ['TRANSFER', 'TOP_UP', 'WITHDRAWAL', 'PAYMENT', 'REFUND', 'REVERSAL'],
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'],
    default: 'PENDING'
  },
  paymentMethod: {
    type: String,
    enum: ['SQUARE', 'BANK_TRANSFER', 'CREDIT_CARD', 'DEBIT_CARD', 'WALLET', 'CASH'],
    default: 'SQUARE'
  },
  balanceBefore: {
    type: Number,
    required: true
  },
  balanceAfter: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    maxlength: 500
  },
  // Square-specific fields
  squarePaymentId: {
    type: String,
    sparse: true
  },
  squareRefundId: {
    type: String,
    sparse: true
  },
  squareOrderId: {
    type: String,
    sparse: true
  },
  metadata: {
    squarePayment: {
      paymentId: String,
      status: String,
      receiptUrl: String,
      createdAt: String,
      updatedAt: String
    },
    squareLocationId: String,
    processingFee: {
      type: Number,
      default: 0
    },
    transferTo: {
      userId: mongoose.Schema.Types.ObjectId,
      walletId: mongoose.Schema.Types.ObjectId,
      name: String
    },
    transferFrom: {
      userId: mongoose.Schema.Types.ObjectId,
      walletId: mongoose.Schema.Types.ObjectId,
      name: String
    },
    squareErrors: [{
      category: String,
      code: String,
      detail: String,
      field: String
    }],
    ip: String,
    userAgent: String,
    deviceInfo: {
      platform: String,
      browser: String
    }
  },
  fees: {
    amount: {
      type: Number,
      default: 0
    },
    type: {
      type: String,
      enum: ['FLAT', 'PERCENTAGE'],
      default: 'FLAT'
    },
    description: String
  },
  processedAt: Date,
  completedAt: Date,
  failedAt: Date,
  errorCode: String,
  errorMessage: String,
  failureReason: String
}, {
  timestamps: true
});

// Indexes for performance
transactionSchema.index({ transactionId: 1 });
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ walletId: 1, createdAt: -1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ category: 1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ squarePaymentId: 1 }, { sparse: true });
transactionSchema.index({ createdAt: -1 });

// Virtual for net amount
walletSchema.virtual('netAmount').get(function() {
  return this.amount + (this.fees?.amount || 0);
});

// Pre-save middleware
transactionSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    if (this.status === 'COMPLETED' && !this.completedAt) {
      this.completedAt = new Date();
      this.processedAt = new Date();
    } else if (this.status === 'FAILED' && !this.failedAt) {
      this.failedAt = new Date();
    }
  }
  next();
});

// Static methods
transactionSchema.statics.getWalletTransactions = function(walletId, options = {}) {
  const query = { walletId };
  
  if (options.status) query.status = options.status;
  if (options.type) query.type = options.type;
  if (options.category) query.category = options.category;
  
  return this.find(query)
    .populate('userId', 'name email')
    .populate('walletId', 'walletId')
    .sort({ createdAt: -1 });
};

transactionSchema.statics.getUserTransactions = function(userId, options = {}) {
  const query = { userId };
  
  if (options.status) query.status = options.status;
  if (options.type) query.type = options.type;
  if (options.category) query.category = options.category;
  
  return this.find(query)
    .populate('walletId', 'walletId')
    .sort({ createdAt: -1 });
};

module.exports = mongoose.model('Transaction', transactionSchema);
