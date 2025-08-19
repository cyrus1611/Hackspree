const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  fromUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  toMerchant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Merchant',
    index: true
  },
  toUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  amount: {
    type: Number,
    required: [true, 'Transaction amount is required'],
    min: [0.01, 'Amount must be greater than 0'],
    validate: {
      validator: function(v) {
        return Number.isFinite(v) && v > 0;
      },
      message: 'Amount must be a positive number'
    }
  },
  type: {
    type: String,
    enum: {
      values: ['topup', 'payment', 'refund', 'cashback', 'transfer', 'withdrawal'],
      message: 'Invalid transaction type'
    },
    required: true,
    index: true
  },
  category: {
    type: String,
    enum: {
      values: ['canteen', 'event', 'club', 'shop', 'stationery', 'transport', 'library', 'other'],
      message: 'Invalid transaction category'
    },
    default: 'other',
    index: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'],
      message: 'Invalid transaction status'
    },
    default: 'pending',
    index: true
  },
  
  // Payment gateway details
  razorpayOrderId: {
    type: String,
    sparse: true
  },
  razorpayPaymentId: {
    type: String,
    sparse: true
  },
  razorpaySignature: {
    type: String,
    sparse: true
  },
  
  // Transaction metadata
  metadata: {
    qrCode: String,
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event'
    },
    clubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Club'
    },
    location: {
      latitude: Number,
      longitude: Number,
      address: String
    },
    deviceInfo: {
      userAgent: String,
      ip: String,
      platform: String
    },
    merchantInfo: {
      terminalId: String,
      cashierId: String
    }
  },
  
  // Financial details
  fees: {
    platformFee: {
      type: Number,
      default: 0,
      min: 0
    },
    merchantFee: {
      type: Number,
      default: 0,
      min: 0
    },
    totalFees: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  
  // Balance tracking
  balanceBeforeTransaction: {
    type: Number,
    required: true,
    min: 0
  },
  balanceAfterTransaction: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Timing information
  initiatedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date,
  failedAt: Date,
  
  // Error handling
  errorCode: String,
  errorMessage: String,
  
  // Settlement information
  settlementStatus: {
    type: String,
    enum: ['pending', 'settled', 'failed'],
    default: 'pending'
  },
  settlementDate: Date,
  settlementReference: String,
  
  // Reference fields
  parentTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  },
  relatedTransactions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  }],
  
  // Audit fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance optimization
transactionSchema.index({ fromUser: 1, createdAt: -1 });
transactionSchema.index({ toMerchant: 1, createdAt: -1 });
transactionSchema.index({ type: 1, status: 1 });
transactionSchema.index({ category: 1, createdAt: -1 });
transactionSchema.index({ transactionId: 1 });
transactionSchema.index({ razorpayOrderId: 1 }, { sparse: true });
transactionSchema.index({ createdAt: -1 });

// Compound indexes
transactionSchema.index({ fromUser: 1, type: 1, status: 1 });
transactionSchema.index({ toMerchant: 1, status: 1, createdAt: -1 });

// Virtual for amount in rupees
transactionSchema.virtual('amountInRupees').get(function() {
  const conversionRate = parseFloat(process.env.COLLEX_CONVERSION_RATE) || 1;
  return (this.amount / conversionRate).toFixed(2);
});

// Virtual for processing time
transactionSchema.virtual('processingTime').get(function() {
  if (this.completedAt && this.initiatedAt) {
    return this.completedAt.getTime() - this.initiatedAt.getTime(); // in milliseconds
  }
  return null;
});

// Virtual for formatted transaction ID
transactionSchema.virtual('formattedTransactionId').get(function() {
  return this.transactionId.replace(/(.{3})/g, '$1-').slice(0, -1);
});

// Pre-save middleware to calculate total fees
transactionSchema.pre('save', function(next) {
  if (this.fees) {
    this.fees.totalFees = (this.fees.platformFee || 0) + (this.fees.merchantFee || 0);
  }
  next();
});

// Pre-save middleware to set completion time
transactionSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    if (this.status === 'completed' && !this.completedAt) {
      this.completedAt = new Date();
    } else if (this.status === 'failed' && !this.failedAt) {
      this.failedAt = new Date();
    }
  }
  next();
});

// Instance method to mark as completed
transactionSchema.methods.markAsCompleted = function() {
  this.status = 'completed';
  this.completedAt = new Date();
  return this.save();
};

// Instance method to mark as failed
transactionSchema.methods.markAsFailed = function(errorCode, errorMessage) {
  this.status = 'failed';
  this.failedAt = new Date();
  this.errorCode = errorCode;
  this.errorMessage = errorMessage;
  return this.save();
};

// Instance method to add related transaction
transactionSchema.methods.addRelatedTransaction = function(transactionId) {
  if (!this.relatedTransactions.includes(transactionId)) {
    this.relatedTransactions.push(transactionId);
  }
  return this.save();
};

// Static method to get transaction statistics
transactionSchema.statics.getStatistics = async function(dateRange = {}) {
  const matchCondition = { status: 'completed' };
  
  if (dateRange.start && dateRange.end) {
    matchCondition.createdAt = {
      $gte: new Date(dateRange.start),
      $lte: new Date(dateRange.end)
    };
  }
  
  const stats = await this.aggregate([
    { $match: matchCondition },
    {
      $group: {
        _id: {
          type: '$type',
          category: '$category'
        },
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
        averageAmount: { $avg: '$amount' }
      }
    },
    {
      $group: {
        _id: '$_id.type',
        categories: {
          $push: {
            category: '$_id.category',
            totalAmount: '$totalAmount',
            count: '$count',
            averageAmount: '$averageAmount'
          }
        },
        typeTotalAmount: { $sum: '$totalAmount' },
        typeTotalCount: { $sum: '$count' }
      }
    }
  ]);
  
  return stats;
};

// Static method to get daily transaction volume
transactionSchema.statics.getDailyVolume = async function(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return await this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate },
        status: 'completed'
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        },
        totalAmount: { $sum: '$amount' },
        totalTransactions: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
    }
  ]);
};

// Static method to find suspicious transactions
transactionSchema.statics.findSuspiciousTransactions = async function() {
  const suspiciousAmount = 10000; // Amount above which transactions are flagged
  const rapidTransactionThreshold = 5; // Number of transactions in short time
  const timeWindow = 10 * 60 * 1000; // 10 minutes in milliseconds
  
  return await this.aggregate([
    {
      $match: {
        $or: [
          { amount: { $gte: suspiciousAmount } },
          {
            createdAt: {
              $gte: new Date(Date.now() - timeWindow)
            }
          }
        ],
        status: 'completed'
      }
    },
    {
      $group: {
        _id: '$fromUser',
        transactions: { $push: '$$ROOT' },
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    },
    {
      $match: {
        $or: [
          { count: { $gte: rapidTransactionThreshold } },
          { totalAmount: { $gte: suspiciousAmount * 2 } }
        ]
      }
    }
  ]);
};

module.exports = mongoose.model('Transaction', transactionSchema);
