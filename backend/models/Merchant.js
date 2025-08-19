const mongoose = require('mongoose');

const merchantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Merchant name is required'],
    trim: true,
    minlength: [2, 'Merchant name must be at least 2 characters'],
    maxlength: [100, 'Merchant name cannot exceed 100 characters']
  },
  businessName: {
    type: String,
    trim: true,
    maxlength: [150, 'Business name cannot exceed 150 characters']
  },
  category: {
    type: String,
    enum: {
      values: ['canteen', 'shop', 'stationery', 'event_organizer', 'club', 'transport', 'library', 'sports', 'medical'],
      message: 'Invalid merchant category'
    },
    required: true,
    index: true
  },
  subcategory: {
    type: String,
    trim: true,
    maxlength: [50, 'Subcategory cannot exceed 50 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  qrCode: {
    type: String,
    unique: true,
    required: true,
    uppercase: true
  },
  
  // Business details
  businessRegistration: {
    gstNumber: {
      type: String,
      match: [/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GST number format']
    },
    panNumber: {
      type: String,
      match: [/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN number format']
    },
    licenseNumber: String,
    registrationDate: Date
  },
  
  // Contact information
  contact: {
    phone: {
      type: String,
      match: [/^[6-9]\d{9}$/, 'Please enter a valid 10-digit phone number']
    },
    email: {
      type: String,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    website: {
      type: String,
      match: [/^https?:\/\/.+/, 'Please enter a valid website URL']
    }
  },
  
  // Location details
  location: {
    building: {
      type: String,
      required: true,
      trim: true
    },
    floor: String,
    room: String,
    coordinates: {
      latitude: {
        type: Number,
        min: [-90, 'Latitude must be between -90 and 90'],
        max: [90, 'Latitude must be between -90 and 90']
      },
      longitude: {
        type: Number,
        min: [-180, 'Longitude must be between -180 and 180'],
        max: [180, 'Longitude must be between -180 and 180']
      }
    },
    address: String
  },
  
  // Operating details
  operatingHours: {
    monday: { open: String, close: String, closed: { type: Boolean, default: false } },
    tuesday: { open: String, close: String, closed: { type: Boolean, default: false } },
    wednesday: { open: String, close: String, closed: { type: Boolean, default: false } },
    thursday: { open: String, close: String, closed: { type: Boolean, default: false } },
    friday: { open: String, close: String, closed: { type: Boolean, default: false } },
    saturday: { open: String, close: String, closed: { type: Boolean, default: false } },
    sunday: { open: String, close: String, closed: { type: Boolean, default: true } }
  },
  
  // Financial details
  commissionRate: {
    type: Number,
    default: 0.02, // 2%
    min: [0, 'Commission rate cannot be negative'],
    max: [0.1, 'Commission rate cannot exceed 10%']
  },
  settlementPeriod: {
    type: String,
    enum: ['daily', 'weekly', 'monthly'],
    default: 'weekly'
  },
  minimumSettlementAmount: {
    type: Number,
    default: 100,
    min: [0, 'Minimum settlement amount cannot be negative']
  },
  
  // Performance metrics
  metrics: {
    totalEarnings: {
      type: Number,
      default: 0,
      min: [0, 'Total earnings cannot be negative']
    },
    totalTransactions: {
      type: Number,
      default: 0,
      min: [0, 'Total transactions cannot be negative']
    },
    averageTransactionAmount: {
      type: Number,
      default: 0,
      min: [0, 'Average transaction amount cannot be negative']
    },
    totalCustomers: {
      type: Number,
      default: 0,
      min: [0, 'Total customers cannot be negative']
    },
    rating: {
      type: Number,
      min: [1, 'Rating must be between 1 and 5'],
      max: [5, 'Rating must be between 1 and 5'],
      default: 5
    },
    totalRatings: {
      type: Number,
      default: 0,
      min: [0, 'Total ratings cannot be negative']
    }
  },
  
  // Status and verification
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  isVerified: {
    type: Boolean,
    default: false,
    index: true
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'under_review', 'verified', 'rejected'],
    default: 'pending'
  },
  verificationDate: Date,
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Features and capabilities
  features: {
    acceptsPreOrders: {
      type: Boolean,
      default: false
    },
    hasDelivery: {
      type: Boolean,
      default: false
    },
    deliveryRadius: {
      type: Number,
      min: [0, 'Delivery radius cannot be negative'],
      max: [50, 'Delivery radius cannot exceed 50km']
    },
    supportsLoyalty: {
      type: Boolean,
      default: false
    },
    hasInventory: {
      type: Boolean,
      default: false
    }
  },
  
  // Media
  images: {
    logo: String,
    banner: String,
    gallery: [String]
  },
  
  // Settlement details
  bankDetails: {
    accountNumber: {
      type: String,
      match: [/^\d{9,18}$/, 'Invalid account number']
    },
    ifscCode: {
      type: String,
      match: [/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code']
    },
    accountHolderName: String,
    bankName: String,
    branchName: String
  },
  
  // Notifications and preferences
  notifications: {
    transactionAlerts: {
      type: Boolean,
      default: true
    },
    dailyReports: {
      type: Boolean,
      default: true
    },
    weeklyReports: {
      type: Boolean,
      default: true
    },
    promotionalOffers: {
      type: Boolean,
      default: false
    }
  },
  
  // Audit fields
  lastTransactionAt: Date,
  lastSettlementAt: Date,
  
  // Additional metadata
  tags: [String],
  notes: String
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
merchantSchema.index({ category: 1, isActive: 1 });
merchantSchema.index({ ownerId: 1 });
merchantSchema.index({ qrCode: 1 });
merchantSchema.index({ 'location.building': 1, 'location.floor': 1 });
merchantSchema.index({ isVerified: 1, isActive: 1 });
merchantSchema.index({ createdAt: -1 });

// Virtual for full address
merchantSchema.virtual('fullAddress').get(function() {
  let address = this.location.building;
  if (this.location.floor) address += `, Floor ${this.location.floor}`;
  if (this.location.room) address += `, Room ${this.location.room}`;
  return address;
});

// Virtual for commission amount from total earnings
merchantSchema.virtual('totalCommissionPaid').get(function() {
  return (this.metrics.totalEarnings * this.commissionRate).toFixed(2);
});

// Virtual for net earnings (after commission)
merchantSchema.virtual('netEarnings').get(function() {
  return (this.metrics.totalEarnings * (1 - this.commissionRate)).toFixed(2);
});

// Virtual for current status
merchantSchema.virtual('currentStatus').get(function() {
  if (!this.isActive) return 'inactive';
  if (!this.isVerified) return 'unverified';
  return 'active';
});

// Instance method to check if merchant is open
merchantSchema.methods.isOpenNow = function() {
  const now = new Date();
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
  
  const todayHours = this.operatingHours[dayOfWeek];
  
  if (!todayHours || todayHours.closed) {
    return false;
  }
  
  if (!todayHours.open || !todayHours.close) {
    return true; // 24/7 operation
  }
  
  return currentTime >= todayHours.open && currentTime <= todayHours.close;
};

// Instance method to update metrics
merchantSchema.methods.updateMetrics = async function(transactionAmount, isNewCustomer = false) {
  this.metrics.totalEarnings += transactionAmount;
  this.metrics.totalTransactions += 1;
  
  if (isNewCustomer) {
    this.metrics.totalCustomers += 1;
  }
  
  // Recalculate average transaction amount
  this.metrics.averageTransactionAmount = this.metrics.totalEarnings / this.metrics.totalTransactions;
  
  this.lastTransactionAt = new Date();
  
  return this.save();
};

// Instance method to add rating
merchantSchema.methods.addRating = function(rating) {
  if (rating < 1 || rating > 5) {
    throw new Error('Rating must be between 1 and 5');
  }
  
  const currentTotal = this.metrics.rating * this.metrics.totalRatings;
  this.metrics.totalRatings += 1;
  this.metrics.rating = (currentTotal + rating) / this.metrics.totalRatings;
  
  return this.save();
};

// Static method to find nearby merchants
merchantSchema.statics.findNearby = function(latitude, longitude, maxDistance = 1000) {
  return this.find({
    'location.coordinates': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistance
      }
    },
    isActive: true,
    isVerified: true
  });
};

// Static method to get merchant statistics
merchantSchema.statics.getStatistics = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        totalEarnings: { $sum: '$metrics.totalEarnings' },
        averageRating: { $avg: '$metrics.rating' },
        totalTransactions: { $sum: '$metrics.totalTransactions' }
      }
    },
    {
      $sort: { totalEarnings: -1 }
    }
  ]);
  
  const totalMerchants = await this.countDocuments({ isActive: true });
  const verifiedMerchants = await this.countDocuments({ isActive: true, isVerified: true });
  const newMerchantsToday = await this.countDocuments({
    createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
  });
  
  return {
    categoryStats: stats,
    totalMerchants,
    verifiedMerchants,
    newMerchantsToday,
    verificationRate: ((verifiedMerchants / totalMerchants) * 100).toFixed(2)
  };
};

// Static method to find top performers
merchantSchema.statics.getTopPerformers = function(limit = 10, period = 'all') {
  let matchCondition = { isActive: true, isVerified: true };
  
  if (period !== 'all') {
    const date = new Date();
    if (period === 'month') {
      date.setMonth(date.getMonth() - 1);
    } else if (period === 'week') {
      date.setDate(date.getDate() - 7);
    }
    matchCondition.lastTransactionAt = { $gte: date };
  }
  
  return this.find(matchCondition)
    .sort({ 'metrics.totalEarnings': -1, 'metrics.rating': -1 })
    .limit(limit)
    .populate('ownerId', 'name email');
};

module.exports = mongoose.model('Merchant', merchantSchema);
