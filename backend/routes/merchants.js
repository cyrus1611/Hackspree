const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Merchant = require('../models/Merchant');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { auth, adminAuth, merchantAuth } = require('../middleware/auth');
const { generateQrCode } = require('../utils/helpers');

const router = express.Router();

// @route   GET /api/merchants
// @desc    Get list of merchants with filters
// @access  Public
router.get('/', [
  query('category')
    .optional()
    .isIn(['canteen', 'shop', 'stationery', 'event_organizer', 'club', 'transport', 'library', 'sports', 'medical'])
    .withMessage('Invalid category'),
  
  query('building')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Building name must be 1-100 characters'),
  
  query('isOpen')
    .optional()
    .isBoolean()
    .withMessage('isOpen must be boolean'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be 1-50'),
  
  query('search')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be 1-100 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Build filter query
    const filter = { 
      isActive: true,
      isVerified: true
    };

    if (req.query.category) {
      filter.category = req.query.category;
    }

    if (req.query.building) {
      filter['location.building'] = new RegExp(req.query.building, 'i');
    }

    if (req.query.search) {
      filter.$or = [
        { name: new RegExp(req.query.search, 'i') },
        { businessName: new RegExp(req.query.search, 'i') },
        { description: new RegExp(req.query.search, 'i') },
        { tags: { $in: [new RegExp(req.query.search, 'i')] } }
      ];
    }

    // Execute queries
    const [merchants, totalCount] = await Promise.all([
      Merchant.find(filter)
        .populate('ownerId', 'name email phone')
        .select('-bankDetails -notes') // Exclude sensitive information
        .sort({ 'metrics.rating': -1, 'metrics.totalTransactions': -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Merchant.countDocuments(filter)
    ]);

    // Process merchants - add current status and filter by open status if requested
    let processedMerchants = merchants.map(merchant => {
      const merchantObj = new Merchant(merchant);
      return {
        ...merchant,
        currentStatus: merchantObj.currentStatus,
        isCurrentlyOpen: merchantObj.isOpenNow(),
        fullAddress: merchantObj.fullAddress,
        netEarnings: merchantObj.netEarnings,
        totalCommissionPaid: merchantObj.totalCommissionPaid
      };
    });

    // Filter by open status if requested
    if (req.query.isOpen !== undefined) {
      const isOpenFilter = req.query.isOpen === 'true';
      processedMerchants = processedMerchants.filter(merchant => 
        merchant.isCurrentlyOpen === isOpenFilter
      );
    }

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      message: 'Merchants fetched successfully',
      merchants: processedMerchants,
      pagination: {
        currentPage: page,
        totalPages,
        totalMerchants: totalCount,
        merchantsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      filters: {
        category: req.query.category || null,
        building: req.query.building || null,
        isOpen: req.query.isOpen || null,
        search: req.query.search || null
      }
    });

  } catch (error) {
    console.error('Merchants fetch error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch merchants',
      code: 'MERCHANTS_FETCH_ERROR'
    });
  }
});

// @route   GET /api/merchants/:id
// @desc    Get specific merchant details
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        message: 'Invalid merchant ID format',
        code: 'INVALID_MERCHANT_ID'
      });
    }

    const merchant = await Merchant.findOne({
      _id: id,
      isActive: true,
      isVerified: true
    })
    .populate('ownerId', 'name email phone')
    .select('-bankDetails -notes -qrCode') // Exclude sensitive info
    .lean();

    if (!merchant) {
      return res.status(404).json({ 
        message: 'Merchant not found',
        code: 'MERCHANT_NOT_FOUND'
      });
    }

    // Add computed fields
    const merchantObj = new Merchant(merchant);
    const merchantDetails = {
      ...merchant,
      currentStatus: merchantObj.currentStatus,
      isCurrentlyOpen: merchantObj.isOpenNow(),
      fullAddress: merchantObj.fullAddress,
      netEarnings: merchantObj.netEarnings,
      totalCommissionPaid: merchantObj.totalCommissionPaid
    };

    // Get recent transactions for this merchant (last 10)
    const recentTransactions = await Transaction.find({
      toMerchant: id,
      status: 'completed'
    })
    .populate('fromUser', 'name universityId')
    .select('transactionId amount type createdAt fromUser')
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

    res.json({
      message: 'Merchant details fetched successfully',
      merchant: merchantDetails,
      recentTransactions
    });

  } catch (error) {
    console.error('Merchant details error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch merchant details',
      code: 'MERCHANT_DETAILS_ERROR'
    });
  }
});

// @route   POST /api/merchants/register
// @desc    Register a new merchant
// @access  Private (Auth required)
router.post('/register', auth, [
  body('name')
    .notEmpty()
    .withMessage('Merchant name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be 2-100 characters'),
  
  body('businessName')
    .optional()
    .isLength({ max: 150 })
    .withMessage('Business name cannot exceed 150 characters'),
  
  body('category')
    .notEmpty()
    .withMessage('Category is required')
    .isIn(['canteen', 'shop', 'stationery', 'event_organizer', 'club', 'transport', 'library', 'sports', 'medical'])
    .withMessage('Invalid category'),
  
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Description cannot exceed 1000 characters'),
  
  body('location')
    .isObject()
    .withMessage('Location is required'),
  
  body('location.building')
    .notEmpty()
    .withMessage('Building is required'),
  
  body('contact')
    .optional()
    .isObject()
    .withMessage('Contact must be an object'),
  
  body('contact.phone')
    .optional()
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Invalid phone number'),
  
  body('contact.email')
    .optional()
    .isEmail()
    .withMessage('Invalid email'),
  
  body('operatingHours')
    .optional()
    .isObject()
    .withMessage('Operating hours must be an object')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      name,
      businessName,
      category,
      subcategory,
      description,
      location,
      contact,
      operatingHours,
      features
    } = req.body;

    // Check if user already has a merchant account
    const existingMerchant = await Merchant.findOne({ 
      ownerId: req.userId,
      isActive: true 
    });

    if (existingMerchant) {
      return res.status(409).json({ 
        message: 'User already has a merchant account',
        code: 'MERCHANT_EXISTS'
      });
    }

    // Generate unique QR code
    let qrCode;
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 5) {
      qrCode = generateQrCode('merchant');
      const existingQr = await Merchant.findOne({ qrCode });
      if (!existingQr) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return res.status(500).json({ 
        message: 'Failed to generate unique QR code',
        code: 'QR_GENERATION_ERROR'
      });
    }

    // Create merchant
    const merchantData = {
      name: name.trim(),
      businessName: businessName?.trim(),
      category,
      subcategory: subcategory?.trim(),
      description: description?.trim(),
      ownerId: req.userId,
      qrCode,
      location,
      contact: contact || {},
      operatingHours: operatingHours || {},
      features: features || {},
      isActive: true,
      isVerified: false,
      verificationStatus: 'pending'
    };

    const merchant = new Merchant(merchantData);
    await merchant.save();

    // Update user role to merchant if they're still a student
    const user = await User.findById(req.userId);
    if (user.role === 'student') {
      user.role = 'merchant';
      await user.save();
    }

    console.log(`🏪 New merchant registered: ${name} by ${user.email}`);

    res.status(201).json({
      message: 'Merchant registered successfully. Verification pending.',
      merchant: {
        id: merchant._id,
        name: merchant.name,
        category: merchant.category,
        qrCode: merchant.qrCode,
        verificationStatus: merchant.verificationStatus,
        location: merchant.location
      },
      nextSteps: [
        'Complete your merchant profile',
        'Upload required documents',
        'Wait for admin verification',
        'Start accepting payments once verified'
      ]
    });

  } catch (error) {
    console.error('Merchant registration error:', error);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));
      
      return res.status(400).json({
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    res.status(500).json({ 
      message: 'Failed to register merchant',
      code: 'MERCHANT_REGISTRATION_ERROR'
    });
  }
});

// @route   GET /api/merchants/my/profile
// @desc    Get own merchant profile
// @access  Private (Merchant)
router.get('/my/profile', auth, async (req, res) => {
  try {
    const merchant = await Merchant.findOne({ 
      ownerId: req.userId,
      isActive: true 
    })
    .populate('ownerId', 'name email phone')
    .populate('verifiedBy', 'name email')
    .lean();

    if (!merchant) {
      return res.status(404).json({ 
        message: 'Merchant profile not found',
        code: 'MERCHANT_NOT_FOUND'
      });
    }

    // Add computed fields
    const merchantObj = new Merchant(merchant);
    const profile = {
      ...merchant,
      currentStatus: merchantObj.currentStatus,
      isCurrentlyOpen: merchantObj.isOpenNow(),
      fullAddress: merchantObj.fullAddress,
      netEarnings: merchantObj.netEarnings,
      totalCommissionPaid: merchantObj.totalCommissionPaid
    };

    res.json({
      message: 'Merchant profile fetched successfully',
      merchant: profile
    });

  } catch (error) {
    console.error('Merchant profile error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch merchant profile',
      code: 'MERCHANT_PROFILE_ERROR'
    });
  }
});

// @route   PUT /api/merchants/my/profile
// @desc    Update own merchant profile
// @access  Private (Merchant)
router.put('/my/profile', auth, [
  body('name')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be 2-100 characters'),
  
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Description cannot exceed 1000 characters'),
  
  body('contact.phone')
    .optional()
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Invalid phone number'),
  
  body('contact.email')
    .optional()
    .isEmail()
    .withMessage('Invalid email')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const allowedUpdates = [
      'name', 'businessName', 'description', 'contact', 
      'operatingHours', 'features', 'tags', 'images'
    ];

    const updates = {};
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        message: 'No valid fields to update',
        allowedFields: allowedUpdates
      });
    }

    const merchant = await Merchant.findOneAndUpdate(
      { ownerId: req.userId, isActive: true },
      updates,
      { new: true, runValidators: true }
    )
    .populate('ownerId', 'name email phone')
    .select('-bankDetails');

    if (!merchant) {
      return res.status(404).json({ 
        message: 'Merchant not found',
        code: 'MERCHANT_NOT_FOUND'
      });
    }

    console.log(`✅ Merchant profile updated: ${merchant.name}`);

    res.json({
      message: 'Merchant profile updated successfully',
      merchant,
      updatedFields: Object.keys(updates)
    });

  } catch (error) {
    console.error('Merchant update error:', error);
    res.status(500).json({ 
      message: 'Failed to update merchant profile',
      code: 'MERCHANT_UPDATE_ERROR'
    });
  }
});

// @route   GET /api/merchants/categories
// @desc    Get merchant categories with counts
// @access  Public
router.get('/stats/categories', async (req, res) => {
  try {
    const categories = await Merchant.aggregate([
      {
        $match: { isActive: true, isVerified: true }
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          avgRating: { $avg: '$metrics.rating' },
          totalTransactions: { $sum: '$metrics.totalTransactions' },
          totalEarnings: { $sum: '$metrics.totalEarnings' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    res.json({
      message: 'Merchant categories fetched successfully',
      categories
    });

  } catch (error) {
    console.error('Categories fetch error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch categories',
      code: 'CATEGORIES_FETCH_ERROR'
    });
  }
});

module.exports = router;
