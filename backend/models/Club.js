const mongoose = require('mongoose');

/**
 * Club Schema for Hackspree Wallet Application
 * Manages user communities, groups, and club-based activities
 */

// Member subdocument schema
const memberSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  role: {
    type: String,
    enum: ['member', 'moderator', 'admin', 'owner'],
    default: 'member',
    index: true
  },
  
  joinedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  status: {
    type: String,
    enum: ['active', 'inactive', 'banned', 'pending'],
    default: 'active',
    index: true
  },
  
  permissions: {
    canInvite: {
      type: Boolean,
      default: false
    },
    canModerate: {
      type: Boolean,
      default: false
    },
    canCreateEvents: {
      type: Boolean,
      default: false
    },
    canManageWallet: {
      type: Boolean,
      default: false
    }
  },
  
  contributionScore: {
    type: Number,
    default: 0,
    min: 0
  },
  
  lastActiveAt: {
    type: Date,
    default: Date.now
  },
  
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  
  notes: {
    type: String,
    trim: true,
    maxlength: 500
  }
}, {
  _id: true,
  timestamps: true
});

// Club settings subdocument schema
const clubSettingsSchema = new mongoose.Schema({
  // Membership settings
  membership: {
    requireApproval: {
      type: Boolean,
      default: false
    },
    allowInvites: {
      type: Boolean,
      default: true
    },
    maxMembers: {
      type: Number,
      default: 1000,
      min: 1,
      max: 10000
    },
    minAge: {
      type: Number,
      default: 13,
      min: 13,
      max: 100
    }
  },
  
  // Privacy settings
  privacy: {
    visibility: {
      type: String,
      enum: ['public', 'private', 'hidden'],
      default: 'public'
    },
    searchable: {
      type: Boolean,
      default: true
    },
    memberListVisible: {
      type: Boolean,
      default: true
    }
  },
  
  // Content settings
  content: {
    allowEvents: {
      type: Boolean,
      default: true
    },
    allowDiscussions: {
      type: Boolean,
      default: true
    },
    moderationEnabled: {
      type: Boolean,
      default: false
    },
    allowFileUploads: {
      type: Boolean,
      default: true
    }
  },
  
  // Wallet settings
  wallet: {
    enabled: {
      type: Boolean,
      default: false
    },
    collectFees: {
      type: Boolean,
      default: false
    },
    membershipFee: {
      type: Number,
      default: 0,
      min: 0
    },
    eventFeePercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 50
    }
  }
}, {
  _id: false
});

// Club statistics subdocument schema
const statisticsSchema = new mongoose.Schema({
  totalMembers: {
    type: Number,
    default: 0,
    min: 0
  },
  
  activeMembers: {
    type: Number,
    default: 0,
    min: 0
  },
  
  totalEvents: {
    type: Number,
    default: 0,
    min: 0
  },
  
  totalRevenue: {
    type: Number,
    default: 0,
    min: 0
  },
  
  averageRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  
  totalRatings: {
    type: Number,
    default: 0,
    min: 0
  },
  
  lastActivityAt: {
    type: Date,
    default: Date.now
  }
}, {
  _id: false
});

// Main club schema
const clubSchema = new mongoose.Schema({
  // Basic information
  name: {
    type: String,
    required: [true, 'Club name is required'],
    trim: true,
    unique: true,
    minlength: [2, 'Club name must be at least 2 characters'],
    maxlength: [100, 'Club name cannot exceed 100 characters'],
    index: true
  },
  
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true,
    match: [/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens']
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  
  shortDescription: {
    type: String,
    trim: true,
    maxlength: [200, 'Short description cannot exceed 200 characters']
  },
  
  // Ownership and creation
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Club categorization
  category: {
    type: String,
    required: false,
    trim: true,
    maxlength: 50,
    index: true
  },
  
  subcategory: {
    type: String,
    required: false,
    trim: true,
    maxlength: 50
  },
  
  tags: [{
    type: String,
    trim: true,
    maxlength: 30
  }],
  
  // Location information
  location: {
    country: {
      type: String,
      trim: true,
      maxlength: 100
    },
    
    region: {
      type: String,
      trim: true,
      maxlength: 100
    },
    
    city: {
      type: String,
      trim: true,
      maxlength: 100
    },
    
    address: {
      type: String,
      trim: true,
      maxlength: 200
    },
    
    coordinates: {
      latitude: {
        type: Number,
        min: -90,
        max: 90
      },
      longitude: {
        type: Number,
        min: -180,
        max: 180
      }
    },
    
    isVirtual: {
      type: Boolean,
      default: false
    }
  },
  
  // Visual assets
  images: {
    cover: {
      type: String,
      trim: true
    },
    
    logo: {
      type: String,
      trim: true
    },
    
    gallery: [{
      url: {
        type: String,
        trim: true
      },
      caption: {
        type: String,
        trim: true,
        maxlength: 200
      },
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  
  // Contact information
  contact: {
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    
    phone: {
      type: String,
      trim: true,
      match: [/^[+]?[\d\s-()]+$/, 'Please enter a valid phone number']
    },
    
    website: {
      type: String,
      trim: true,
      match: [/^https?:\/\//, 'Website must be a valid URL']
    },
    
    socialMedia: {
      facebook: String,
      twitter: String,
      instagram: String,
      linkedin: String,
      discord: String
    }
  },
  
  // Club status and settings
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'archived'],
    default: 'active',
    index: true
  },
  
  isVerified: {
    type: Boolean,
    default: false,
    index: true
  },
  
  isFeatured: {
    type: Boolean,
    default: false,
    index: true
  },
  
  // Club rules and guidelines
  rules: {
    type: String,
    trim: true,
    maxlength: 5000
  },
  
  guidelines: {
    type: String,
    trim: true,
    maxlength: 3000
  },
  
  // Members array
  members: [memberSchema],
  
  // Club settings
  settings: {
    type: clubSettingsSchema,
    default: () => ({})
  },
  
  // Statistics
  statistics: {
    type: statisticsSchema,
    default: () => ({})
  },
  
  // Club wallet information
  clubWallet: {
    enabled: {
      type: Boolean,
      default: false
    },
    
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: false
    },
    
    balance: {
      type: Number,
      default: 0,
      min: 0
    },
    
    membershipFee: {
      type: Number,
      default: 0,
      min: 0
    },
    
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    }
  },
  
  // Moderation and safety
  moderation: {
    autoModeration: {
      type: Boolean,
      default: false
    },
    
    reportCount: {
      type: Number,
      default: 0,
      min: 0
    },
    
    warningCount: {
      type: Number,
      default: 0,
      min: 0
    },
    
    lastModeratedAt: {
      type: Date
    },
    
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  
  // SEO and discovery
  seo: {
    metaTitle: {
      type: String,
      trim: true,
      maxlength: 60
    },
    
    metaDescription: {
      type: String,
      trim: true,
      maxlength: 160
    },
    
    keywords: [{
      type: String,
      trim: true,
      maxlength: 50
    }]
  },
  
  // Timestamps and activity
  lastActivityAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  archivedAt: {
    type: Date
  },
  
  suspendedAt: {
    type: Date
  },
  
  suspensionReason: {
    type: String,
    trim: true,
    maxlength: 500
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
clubSchema.index({ name: 'text', description: 'text', shortDescription: 'text' });
clubSchema.index({ category: 1, status: 1 });
clubSchema.index({ 'location.country': 1, 'location.city': 1 });
clubSchema.index({ tags: 1 });
clubSchema.index({ isFeatured: 1, createdAt: -1 });
clubSchema.index({ 'members.userId': 1 });
clubSchema.index({ 'members.role': 1 });
clubSchema.index({ createdAt: -1 });

// Compound indexes
clubSchema.index({ status: 1, category: 1, createdAt: -1 });
clubSchema.index({ 'settings.privacy.visibility': 1, status: 1 });

// Virtual properties
clubSchema.virtual('memberCount').get(function() {
  return this.members ? this.members.length : 0;
});

clubSchema.virtual('activeMemberCount').get(function() {
  return this.members ? this.members.filter(member => member.status === 'active').length : 0;
});

clubSchema.virtual('admins').get(function() {
  return this.members ? this.members.filter(member => 
    ['admin', 'owner'].includes(member.role) && member.status === 'active'
  ) : [];
});

clubSchema.virtual('owner').get(function() {
  return this.members ? this.members.find(member => member.role === 'owner') : null;
});

clubSchema.virtual('isPublic').get(function() {
  return this.settings?.privacy?.visibility === 'public';
});

// Pre-save middleware
clubSchema.pre('save', function(next) {
  // Update statistics
  if (this.members) {
    this.statistics.totalMembers = this.members.length;
    this.statistics.activeMembers = this.members.filter(m => m.status === 'active').length;
  }
  
  // Update last activity
  this.lastActivityAt = new Date();
  
  // Generate slug if not provided
  if (!this.slug && this.name) {
    this.slug = this.name.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim('-');
  }
  
  next();
});

// Instance methods
clubSchema.methods.addMember = async function(userId, role = 'member', invitedBy = null) {
  // Check if user is already a member
  const existingMember = this.members.find(member => 
    member.userId.toString() === userId.toString()
  );
  
  if (existingMember) {
    throw new Error('User is already a member of this club');
  }
  
  // Check member limit
  if (this.settings.membership.maxMembers && this.members.length >= this.settings.membership.maxMembers) {
    throw new Error('Club has reached maximum member limit');
  }
  
  // Add member
  const newMember = {
    userId,
    role,
    status: this.settings.membership.requireApproval ? 'pending' : 'active',
    invitedBy,
    joinedAt: new Date()
  };
  
  this.members.push(newMember);
  await this.save();
  
  return newMember;
};

clubSchema.methods.removeMember = async function(userId) {
  const memberIndex = this.members.findIndex(member => 
    member.userId.toString() === userId.toString()
  );
  
  if (memberIndex === -1) {
    throw new Error('User is not a member of this club');
  }
  
  // Don't allow removing the owner
  if (this.members[memberIndex].role === 'owner') {
    throw new Error('Cannot remove club owner');
  }
  
  this.members.splice(memberIndex, 1);
  await this.save();
  
  return true;
};

clubSchema.methods.updateMemberRole = async function(userId, newRole) {
  const member = this.members.find(member => 
    member.userId.toString() === userId.toString()
  );
  
  if (!member) {
    throw new Error('User is not a member of this club');
  }
  
  // Don't allow changing owner role
  if (member.role === 'owner' && newRole !== 'owner') {
    throw new Error('Cannot change owner role');
  }
  
  member.role = newRole;
  await this.save();
  
  return member;
};

clubSchema.methods.updateMemberStatus = async function(userId, newStatus) {
  const member = this.members.find(member => 
    member.userId.toString() === userId.toString()
  );
  
  if (!member) {
    throw new Error('User is not a member of this club');
  }
  
  member.status = newStatus;
  await this.save();
  
  return member;
};

clubSchema.methods.isMember = function(userId) {
  return this.members.some(member => 
    member.userId.toString() === userId.toString() && member.status === 'active'
  );
};

clubSchema.methods.getMemberRole = function(userId) {
  const member = this.members.find(member => 
    member.userId.toString() === userId.toString()
  );
  
  return member ? member.role : null;
};

clubSchema.methods.canUserManage = function(userId) {
  const member = this.members.find(member => 
    member.userId.toString() === userId.toString()
  );
  
  return member && ['owner', 'admin'].includes(member.role) && member.status === 'active';
};

clubSchema.methods.canUserModerate = function(userId) {
  const member = this.members.find(member => 
    member.userId.toString() === userId.toString()
  );
  
  return member && 
    (['owner', 'admin', 'moderator'].includes(member.role) || member.permissions.canModerate) &&
    member.status === 'active';
};

clubSchema.methods.updateActivity = async function() {
  this.lastActivityAt = new Date();
  this.statistics.lastActivityAt = new Date();
  await this.save();
};

// Static methods
clubSchema.statics.findBySlug = function(slug) {
  return this.findOne({ slug, status: 'active' });
};

clubSchema.statics.findPublic = function(options = {}) {
  const query = this.find({
    status: 'active',
    'settings.privacy.visibility': 'public'
  });
  
  if (options.category) {
    query.where('category', options.category);
  }
  
  if (options.search) {
    query.where({ $text: { $search: options.search } });
  }
  
  if (options.location) {
    query.where('location.country', options.location);
  }
  
  return query.sort({ isFeatured: -1, 'statistics.totalMembers': -1, createdAt: -1 });
};

clubSchema.statics.findUserClubs = function(userId) {
  return this.find({
    'members.userId': userId,
    'members.status': 'active',
    status: 'active'
  }).sort({ 'members.joinedAt': -1 });
};

clubSchema.statics.getPopularClubs = function(limit = 10) {
  return this.find({ status: 'active' })
    .sort({ 'statistics.totalMembers': -1, 'statistics.lastActivityAt': -1 })
    .limit(limit);
};

clubSchema.statics.searchClubs = function(searchTerm, options = {}) {
  const query = this.find({
    $text: { $search: searchTerm },
    status: 'active',
    'settings.privacy.visibility': { $in: ['public'] }
  });
  
  if (options.category) {
    query.where('category', options.category);
  }
  
  return query.sort({ score: { $meta: 'textScore' } });
};

module.exports = mongoose.model('Club', clubSchema);
