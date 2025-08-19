const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  universityId: {
    type: String,
    required: [true, 'University ID is required'],
    unique: true,
    trim: true,
    uppercase: true,
    match: [/^[A-Z0-9]{6,12}$/, 'Please enter a valid university ID']
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters long'],
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long'],
    select: false // Don't include password in queries by default
  },
  role: {
    type: String,
    enum: ['student', 'merchant', 'admin', 'super_admin'],
    default: 'student'
  },
  walletBalance: {
    type: Number,
    default: 0,
    min: [0, 'Wallet balance cannot be negative'],
    max: [100000, 'Wallet balance cannot exceed ₹1,00,000']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  profilePicture: {
    type: String,
    default: null
  },
  phone: {
    type: String,
    match: [/^[6-9]\d{9}$/, 'Please enter a valid 10-digit phone number'],
    default: null
  },
  dateOfBirth: {
    type: Date,
    validate: {
      validator: function(v) {
        return !v || v < new Date();
      },
      message: 'Date of birth cannot be in the future'
    }
  },
  course: {
    type: String,
    trim: true,
    maxlength: [100, 'Course name cannot exceed 100 characters']
  },
  semester: {
    type: Number,
    min: [1, 'Semester must be at least 1'],
    max: [10, 'Semester cannot exceed 10']
  },
  
  // Security fields
  lastLogin: {
    type: Date,
    default: null
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  
  // Spending tracking
  dailySpentAmount: {
    type: Number,
    default: 0,
    min: [0, 'Daily spent amount cannot be negative']
  },
  lastSpentReset: {
    type: Date,
    default: Date.now
  },
  totalSpent: {
    type: Number,
    default: 0,
    min: [0, 'Total spent cannot be negative']
  },
  
  // Preferences
  preferences: {
    notifications: {
      type: Boolean,
      default: true
    },
    emailUpdates: {
      type: Boolean,
      default: true
    },
    language: {
      type: String,
      enum: ['en', 'hi', 'te', 'ta'],
      default: 'en'
    }
  },
  
  // Metadata
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
userSchema.index({ email: 1 });
userSchema.index({ universityId: 1 });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ createdAt: -1 });

// Virtual for full name formatting
userSchema.virtual('displayName').get(function() {
  return this.name.split(' ').map(name => 
    name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
  ).join(' ');
});

// Virtual for wallet balance in rupees
userSchema.virtual('walletBalanceInRupees').get(function() {
  return (this.walletBalance / parseFloat(process.env.COLLEX_CONVERSION_RATE || 1)).toFixed(2);
});

// Virtual for account lock status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();
  
  try {
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
    this.password = await bcrypt.hash(this.password, saltRounds);
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-save middleware to update lastUpdated
userSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

// Instance method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Instance method to reset daily spending if needed
userSchema.methods.resetDailySpentIfNeeded = function() {
  const today = new Date();
  const lastReset = new Date(this.lastSpentReset);
  
  // If it's a new day, reset daily spent amount
  if (today.toDateString() !== lastReset.toDateString()) {
    this.dailySpentAmount = 0;
    this.lastSpentReset = today;
    return true;
  }
  return false;
};

// Instance method to check if user can spend amount
userSchema.methods.canSpend = function(amount) {
  this.resetDailySpentIfNeeded();
  
  const dailyLimit = parseFloat(process.env.DAILY_TRANSACTION_LIMIT) || 5000;
  const hasBalance = this.walletBalance >= amount;
  const withinDailyLimit = (this.dailySpentAmount + amount) <= dailyLimit;
  
  return {
    canSpend: hasBalance && withinDailyLimit,
    hasBalance,
    withinDailyLimit,
    availableBalance: this.walletBalance,
    dailySpent: this.dailySpentAmount,
    dailyLimit
  };
};

// Instance method to handle failed login attempts
userSchema.methods.handleFailedLogin = async function() {
  const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
  const lockoutTime = parseInt(process.env.LOCKOUT_TIME) || 30 * 60 * 1000; // 30 minutes
  
  this.loginAttempts += 1;
  
  if (this.loginAttempts >= maxAttempts) {
    this.lockUntil = Date.now() + lockoutTime;
  }
  
  return this.save();
};

// Instance method to handle successful login
userSchema.methods.handleSuccessfulLogin = async function() {
  // Reset login attempts and lock
  this.loginAttempts = 0;
  this.lockUntil = undefined;
  this.lastLogin = new Date();
  
  return this.save();
};

// Static method to find users with low balance
userSchema.statics.findUsersWithLowBalance = function(threshold = 100) {
  return this.find({
    walletBalance: { $lt: threshold },
    isActive: true,
    role: 'student'
  }).select('name email walletBalance');
};

// Static method to get user statistics
userSchema.statics.getStatistics = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 },
        totalBalance: { $sum: '$walletBalance' },
        averageBalance: { $avg: '$walletBalance' }
      }
    }
  ]);
  
  const totalUsers = await this.countDocuments({ isActive: true });
  const newUsersToday = await this.countDocuments({
    createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    isActive: true
  });
  
  return {
    roleDistribution: stats,
    totalUsers,
    newUsersToday
  };
};

module.exports = mongoose.model('User', userSchema);
