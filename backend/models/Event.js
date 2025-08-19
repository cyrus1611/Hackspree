const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Event title is required'],
    trim: true,
    minlength: [3, 'Title must be at least 3 characters'],
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Event description is required'],
    trim: true,
    minlength: [10, 'Description must be at least 10 characters'],
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  shortDescription: {
    type: String,
    trim: true,
    maxlength: [300, 'Short description cannot exceed 300 characters']
  },
  
  // Pricing and registration
  price: {
    type: Number,
    required: [true, 'Event price is required'],
    min: [0, 'Price cannot be negative']
  },
  earlyBirdPrice: {
    type: Number,
    min: [0, 'Early bird price cannot be negative']
  },
  earlyBirdDeadline: Date,
  currency: {
    type: String,
    default: 'INR',
    enum: ['INR', 'USD']
  },
  
  // Date and time
  startDate: {
    type: Date,
    required: [true, 'Event start date is required'],
    validate: {
      validator: function(v) {
        return v > new Date();
      },
      message: 'Start date must be in the future'
    }
  },
  endDate: {
    type: Date,
    required: [true, 'Event end date is required'],
    validate: {
      validator: function(v) {
        return !this.startDate || v >= this.startDate;
      },
      message: 'End date must be after start date'
    }
  },
  registrationDeadline: {
    type: Date,
    validate: {
      validator: function(v) {
        return !v || v <= this.startDate;
      },
      message: 'Registration deadline must be before event start date'
    }
  },
  duration: Number, // in minutes
  
  // Location
  venue: {
    name: {
      type: String,
      required: [true, 'Venue name is required'],
      trim: true
    },
    building: String,
    room: String,
    floor: String,
    address: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    },
    capacity: {
      type: Number,
      min: [1, 'Venue capacity must be at least 1']
    }
  },
  
  // Registration and capacity
  maxParticipants: {
    type: Number,
    required: [true, 'Maximum participants is required'],
    min: [1, 'Maximum participants must be at least 1'],
    max: [10000, 'Maximum participants cannot exceed 10,000']
  },
  minParticipants: {
    type: Number,
    default: 1,
    min: [1, 'Minimum participants must be at least 1']
  },
  currentParticipants: {
    type: Number,
    default: 0,
    min: [0, 'Current participants cannot be negative']
  },
  waitlistLimit: {
    type: Number,
    default: 0,
    min: [0, 'Waitlist limit cannot be negative']
  },
  
  // Registration details
  registeredUsers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    registeredAt: {
      type: Date,
      default: Date.now
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending'
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction'
    },
    attendanceStatus: {
      type: String,
      enum: ['registered', 'attended', 'absent', 'cancelled'],
      default: 'registered'
    },
    certificateIssued: {
      type: Boolean,
      default: false
    },
    feedback: {
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      comment: String,
      submittedAt: Date
    }
  }],
  
  // Waitlist
  waitlist: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    },
    position: Number
  }],
  
  // Organization details
  organizer: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    name: String,
    email: String,
    phone: String,
    organization: String
  },
  coOrganizers: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: String
  }],
  
  // Event classification
  category: {
    type: String,
    enum: {
      values: ['workshop', 'seminar', 'competition', 'cultural', 'sports', 'technical', 'career', 'social', 'other'],
      message: 'Invalid event category'
    },
    required: true,
    index: true
  },
  subcategory: String,
  tags: [String],
  
  // Event status
  status: {
    type: String,
    enum: {
      values: ['draft', 'published', 'cancelled', 'postponed', 'completed', 'ongoing'],
      message: 'Invalid event status'
    },
    default: 'draft',
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  
  // Requirements and prerequisites
  requirements: {
    ageLimit: {
      min: Number,
      max: Number
    },
    prerequisites: [String],
    equipmentNeeded: [String],
    skillLevel: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced', 'all']
    }
  },
  
  // Media and resources
  media: {
    poster: String,
    banner: String,
    gallery: [String],
    videos: [String]
  },
  resources: {
    documents: [{
      name: String,
      url: String,
      type: String
    }],
    externalLinks: [{
      title: String,
      url: String,
      description: String
    }]
  },
  
  // Financial tracking
  financials: {
    totalRevenue: {
      type: Number,
      default: 0,
      min: [0, 'Total revenue cannot be negative']
    },
    expenses: {
      type: Number,
      default: 0,
      min: [0, 'Expenses cannot be negative']
    },
    profit: {
      type: Number,
      default: 0
    },
    refundedAmount: {
      type: Number,
      default: 0,
      min: [0, 'Refunded amount cannot be negative']
    }
  },
  
  // Event configuration
  settings: {
    allowWaitlist: {
      type: Boolean,
      default: true
    },
    autoApprove: {
      type: Boolean,
      default: true
    },
    sendReminders: {
      type: Boolean,
      default: true
    },
    collectFeedback: {
      type: Boolean,
      default: true
    },
    issueCertificates: {
      type: Boolean,
      default: false
    },
    allowCancellation: {
      type: Boolean,
      default: true
    },
    cancellationDeadline: Date,
    refundPolicy: {
      type: String,
      enum: ['full', 'partial', 'none'],
      default: 'partial'
    }
  },
  
  // Analytics
  analytics: {
    views: {
      type: Number,
      default: 0
    },
    registrationAttempts: {
      type: Number,
      default: 0
    },
    averageRating: {
      type: Number,
      min: 1,
      max: 5
    },
    totalRatings: {
      type: Number,
      default: 0
    }
  },
  
  // Timestamps for specific actions
  publishedAt: Date,
  cancelledAt: Date,
  completedAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
eventSchema.index({ status: 1, isActive: 1 });
eventSchema.index({ category: 1, startDate: 1 });
eventSchema.index({ 'organizer.userId': 1 });
eventSchema.index({ startDate: 1, endDate: 1 });
eventSchema.index({ slug: 1 });
eventSchema.index({ tags: 1 });
eventSchema.index({ isFeatured: 1, startDate: 1 });

// Virtual for available spots
eventSchema.virtual('availableSpots').get(function() {
  return Math.max(0, this.maxParticipants - this.currentParticipants);
});

// Virtual for registration status
eventSchema.virtual('registrationStatus').get(function() {
  const now = new Date();
  
  if (this.registrationDeadline && now > this.registrationDeadline) {
    return 'closed';
  }
  
  if (this.currentParticipants >= this.maxParticipants) {
    return this.settings.allowWaitlist ? 'waitlist' : 'full';
  }
  
  return 'open';
});

// Virtual for event duration in hours
eventSchema.virtual('durationInHours').get(function() {
  if (this.duration) {
    return (this.duration / 60).toFixed(1);
  }
  
  if (this.startDate && this.endDate) {
    const diffInMs = this.endDate.getTime() - this.startDate.getTime();
    return (diffInMs / (1000 * 60 * 60)).toFixed(1);
  }
  
  return null;
});

// Virtual for current price (considering early bird)
eventSchema.virtual('currentPrice').get(function() {
  const now = new Date();
  
  if (this.earlyBirdPrice && this.earlyBirdDeadline && now <= this.earlyBirdDeadline) {
    return this.earlyBirdPrice;
  }
  
  return this.price;
});

// Pre-save middleware to generate slug
eventSchema.pre('save', function(next) {
  if (this.isModified('title') && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim('-');
  }
  next();
});

// Pre-save middleware to calculate profit
eventSchema.pre('save', function(next) {
  this.financials.profit = this.financials.totalRevenue - this.financials.expenses - this.financials.refundedAmount;
  next();
});

// Instance method to register user
eventSchema.methods.registerUser = async function(userId, transactionId) {
  if (this.currentParticipants >= this.maxParticipants) {
    throw new Error('Event is full');
  }
  
  const existingRegistration = this.registeredUsers.find(
    reg => reg.user.toString() === userId.toString()
  );
  
  if (existingRegistration) {
    throw new Error('User already registered');
  }
  
  this.registeredUsers.push({
    user: userId,
    transactionId,
    paymentStatus: 'completed'
  });
  
  this.currentParticipants += 1;
  this.financials.totalRevenue += this.currentPrice;
  
  return this.save();
};

// Instance method to add to waitlist
eventSchema.methods.addToWaitlist = function(userId) {
  const existingWaitlist = this.waitlist.find(
    item => item.user.toString() === userId.toString()
  );
  
  if (existingWaitlist) {
    throw new Error('User already in waitlist');
  }
  
  if (this.waitlist.length >= this.waitlistLimit) {
    throw new Error('Waitlist is full');
  }
  
  this.waitlist.push({
    user: userId,
    position: this.waitlist.length + 1
  });
  
  return this.save();
};

// Instance method to cancel registration
eventSchema.methods.cancelRegistration = async function(userId) {
  const registrationIndex = this.registeredUsers.findIndex(
    reg => reg.user.toString() === userId.toString()
  );
  
  if (registrationIndex === -1) {
    throw new Error('Registration not found');
  }
  
  const registration = this.registeredUsers[registrationIndex];
  
  // Check if cancellation is allowed
  if (!this.settings.allowCancellation) {
    throw new Error('Cancellation not allowed for this event');
  }
  
  if (this.settings.cancellationDeadline && new Date() > this.settings.cancellationDeadline) {
    throw new Error('Cancellation deadline has passed');
  }
  
  this.registeredUsers.splice(registrationIndex, 1);
  this.currentParticipants -= 1;
  
  // Handle refund based on policy
  let refundAmount = 0;
  if (this.settings.refundPolicy === 'full') {
    refundAmount = this.currentPrice;
  } else if (this.settings.refundPolicy === 'partial') {
    refundAmount = this.currentPrice * 0.5; // 50% refund
  }
  
  if (refundAmount > 0) {
    this.financials.refundedAmount += refundAmount;
  }
  
  // Move first person from waitlist to registered
  if (this.waitlist.length > 0) {
    const firstInWaitlist = this.waitlist.shift();
    // Update positions for remaining waitlist
    this.waitlist.forEach((item, index) => {
      item.position = index + 1;
    });
  }
  
  return { refundAmount, registration };
};

// Static method to get upcoming events
eventSchema.statics.getUpcomingEvents = function(limit = 10, category = null) {
  const filter = {
    startDate: { $gte: new Date() },
    status: 'published',
    isActive: true
  };
  
  if (category) {
    filter.category = category;
  }
  
  return this.find(filter)
    .sort({ startDate: 1 })
    .limit(limit)
    .populate('organizer.userId', 'name email');
};

// Static method to get event statistics
eventSchema.statics.getStatistics = async function() {
  const now = new Date();
  
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$category',
        totalEvents: { $sum: 1 },
        totalRevenue: { $sum: '$financials.totalRevenue' },
        totalParticipants: { $sum: '$currentParticipants' },
        averagePrice: { $avg: '$price' }
      }
    }
  ]);
  
  const upcomingEvents = await this.countDocuments({
    startDate: { $gte: now },
    status: 'published'
  });
  
  const ongoingEvents = await this.countDocuments({
    startDate: { $lte: now },
    endDate: { $gte: now },
    status: 'published'
  });
  
  return {
    categoryStats: stats,
    upcomingEvents,
    ongoingEvents,
    totalEvents: await this.countDocuments(),
    publishedEvents: await this.countDocuments({ status: 'published' })
  };
};

module.exports = mongoose.model('Event', eventSchema);
