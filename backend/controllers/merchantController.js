const Merchant = require('../models/Merchant');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const QRCode = require('qrcode');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

class MerchantController {
  /**
   * Create a new merchant
   */
  async createMerchant(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
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
        images
      } = req.body;

      // Check if merchant already exists for this user
      const existingMerchant = await Merchant.findOne({ ownerId: req.userId });
      if (existingMerchant) {
        return res.status(400).json({
          success: false,
          message: 'User already has a merchant account'
        });
      }

      // Generate unique QR code data
      const qrData = `MERCHANT_${Date.now()}_${req.userId.slice(-4)}`;
      
      // Generate QR code
      const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: 256
      });

      const merchant = new Merchant({
        name,
        businessName,
        category,
        subcategory,
        description,
        ownerId: req.userId,
        qrCode: qrData,
        qrCodeImage: qrCodeDataUrl,
        location,
        contact,
        operatingHours,
        images: images || {},
        verificationStatus: 'pending',
        isActive: false, // Inactive until verified
        isVerified: false,
        metrics: {
          totalEarnings: 0,
          totalTransactions: 0,
          averageTransactionAmount: 0,
          rating: 0,
          totalRatings: 0
        }
      });

      await merchant.save();

      res.status(201).json({
        success: true,
        message: 'Merchant application submitted successfully',
        data: {
          merchant: {
            id: merchant._id,
            name: merchant.name,
            businessName: merchant.businessName,
            category: merchant.category,
            qrCode: merchant.qrCode,
            verificationStatus: merchant.verificationStatus,
            createdAt: merchant.createdAt
          }
        }
      });

    } catch (error) {
      console.error('Create merchant error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create merchant',
        error: error.message
      });
    }
  }

  /**
   * Get merchant by ID
   */
  async getMerchant(req, res) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid merchant ID format'
        });
      }

      const merchant = await Merchant.findById(id)
        .populate('ownerId', 'name email phone')
        .lean();

      if (!merchant) {
        return res.status(404).json({
          success: false,
          message: 'Merchant not found'
        });
      }

      // Get recent transactions for this merchant
      const recentTransactions = await Transaction.find({
        'metadata.merchantId': id,
        status: 'COMPLETED'
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('userId', 'name email')
        .lean();

      // Calculate additional metrics
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      const todayTransactions = await Transaction.countDocuments({
        'metadata.merchantId': id,
        status: 'COMPLETED',
        createdAt: { $gte: startOfDay }
      });

      const todayEarnings = await Transaction.aggregate([
        {
          $match: {
            'metadata.merchantId': mongoose.Types.ObjectId(id),
            status: 'COMPLETED',
            createdAt: { $gte: startOfDay }
          }
        },
        {
          $group: {
            _id: null,
            totalEarnings: { $sum: '$amount' }
          }
        }
      ]);

      res.json({
        success: true,
        data: {
          merchant: {
            ...merchant,
            todayStats: {
              transactions: todayTransactions,
              earnings: todayEarnings[0]?.totalEarnings || 0
            },
            recentTransactions
          }
        }
      });

    } catch (error) {
      console.error('Get merchant error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve merchant',
        error: error.message
      });
    }
  }

  /**
   * List merchants with filters and pagination
   */
  async listMerchants(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        category,
        subcategory,
        verificationStatus,
        isActive,
        location,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build query
      const query = {};

      if (search) {
        query.$or = [
          { name: new RegExp(search, 'i') },
          { businessName: new RegExp(search, 'i') },
          { description: new RegExp(search, 'i') }
        ];
      }

      if (category) query.category = category;
      if (subcategory) query.subcategory = subcategory;
      if (verificationStatus) query.verificationStatus = verificationStatus;
      if (isActive !== undefined) query.isActive = isActive === 'true';
      if (location) {
        query.$or = [
          { 'location.building': new RegExp(location, 'i') },
          { 'location.address': new RegExp(location, 'i') }
        ];
      }

      // Only show verified and active merchants to regular users
      if (!req.user || req.user.role !== 'admin') {
        query.isVerified = true;
        query.isActive = true;
      }

      // Build sort
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [merchants, totalMerchants] = await Promise.all([
        Merchant.find(query)
          .populate('ownerId', 'name email')
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Merchant.countDocuments(query)
      ]);

      res.json({
        success: true,
        data: {
          merchants,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalMerchants / parseInt(limit)),
            totalMerchants,
            merchantsPerPage: parseInt(limit),
            hasNextPage: skip + parseInt(limit) < totalMerchants,
            hasPrevPage: parseInt(page) > 1
          }
        }
      });

    } catch (error) {
      console.error('List merchants error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve merchants',
        error: error.message
      });
    }
  }

  /**
   * Update merchant information
   */
  async updateMerchant(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { id } = req.params;
      const updateData = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid merchant ID format'
        });
      }

      const merchant = await Merchant.findById(id);
      if (!merchant) {
        return res.status(404).json({
          success: false,
          message: 'Merchant not found'
        });
      }

      // Check ownership or admin rights
      if (merchant.ownerId.toString() !== req.userId.toString() && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update this merchant'
        });
      }

      // Prevent updating certain fields after verification
      if (merchant.isVerified && !req.user.role === 'admin') {
        const restrictedFields = ['businessName', 'category', 'contact.email'];
        const hasRestrictedUpdates = restrictedFields.some(field => {
          const keys = field.split('.');
          let current = updateData;
          for (const key of keys) {
            if (current && current.hasOwnProperty(key)) {
              return true;
            }
            current = current[key];
          }
          return false;
        });

        if (hasRestrictedUpdates) {
          return res.status(400).json({
            success: false,
            message: 'Cannot update restricted fields after verification. Contact admin for changes.'
          });
        }
      }

      // Update merchant
      const updatedMerchant = await Merchant.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      ).populate('ownerId', 'name email');

      res.json({
        success: true,
        message: 'Merchant updated successfully',
        data: {
          merchant: updatedMerchant
        }
      });

    } catch (error) {
      console.error('Update merchant error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update merchant',
        error: error.message
      });
    }
  }

  /**
   * Delete merchant (admin only)
   */
  async deleteMerchant(req, res) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid merchant ID format'
        });
      }

      const merchant = await Merchant.findById(id);
      if (!merchant) {
        return res.status(404).json({
          success: false,
          message: 'Merchant not found'
        });
      }

      // Check ownership or admin rights
      if (merchant.ownerId.toString() !== req.userId.toString() && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete this merchant'
        });
      }

      // Check for active transactions
      const hasActiveTransactions = await Transaction.exists({
        'metadata.merchantId': id,
        status: { $in: ['PENDING', 'PROCESSING'] }
      });

      if (hasActiveTransactions) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete merchant with pending transactions'
        });
      }

      await Merchant.findByIdAndDelete(id);

      res.json({
        success: true,
        message: 'Merchant deleted successfully'
      });

    } catch (error) {
      console.error('Delete merchant error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete merchant',
        error: error.message
      });
    }
  }

  /**
   * Verify merchant (admin only)
   */
  async verifyMerchant(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { id } = req.params;
      const { verificationStatus, verificationNotes } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid merchant ID format'
        });
      }

      const validStatuses = ['pending', 'under_review', 'verified', 'rejected'];
      if (!validStatuses.includes(verificationStatus)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid verification status'
        });
      }

      const merchant = await Merchant.findById(id).populate('ownerId', 'name email');
      if (!merchant) {
        return res.status(404).json({
          success: false,
          message: 'Merchant not found'
        });
      }

      const previousStatus = merchant.verificationStatus;

      // Update verification status
      merchant.verificationStatus = verificationStatus;
      merchant.verificationNotes = verificationNotes || '';
      merchant.verifiedBy = req.userId;

      if (verificationStatus === 'verified') {
        merchant.isVerified = true;
        merchant.isActive = true;
        merchant.verifiedAt = new Date();
      } else if (verificationStatus === 'rejected') {
        merchant.isVerified = false;
        merchant.isActive = false;
      }

      await merchant.save();

      // Log verification action
      console.log(`Merchant ${merchant.name} verification status changed from ${previousStatus} to ${verificationStatus} by admin ${req.userId}`);

      // You could send notification emails here
      // await sendMerchantVerificationEmail(merchant, verificationStatus);

      res.json({
        success: true,
        message: `Merchant ${verificationStatus} successfully`,
        data: {
          merchantId: merchant._id,
          merchantName: merchant.name,
          previousStatus,
          newStatus: verificationStatus,
          verifiedAt: merchant.verifiedAt,
          notes: verificationNotes || ''
        }
      });

    } catch (error) {
      console.error('Verify merchant error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify merchant',
        error: error.message
      });
    }
  }

  /**
   * Get merchant's own profile
   */
  async getMyProfile(req, res) {
    try {
      const merchant = await Merchant.findOne({ ownerId: req.userId })
        .populate('ownerId', 'name email phone')
        .lean();

      if (!merchant) {
        return res.status(404).json({
          success: false,
          message: 'Merchant profile not found'
        });
      }

      // Get transaction statistics
      const transactionStats = await Transaction.aggregate([
        {
          $match: {
            'metadata.merchantId': mongoose.Types.ObjectId(merchant._id),
            status: 'COMPLETED'
          }
        },
        {
          $group: {
            _id: null,
            totalTransactions: { $sum: 1 },
            totalEarnings: { $sum: '$amount' },
            averageAmount: { $avg: '$amount' }
          }
        }
      ]);

      // Get monthly earnings (last 12 months)
      const monthlyEarnings = await Transaction.aggregate([
        {
          $match: {
            'metadata.merchantId': mongoose.Types.ObjectId(merchant._id),
            status: 'COMPLETED',
            createdAt: {
              $gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1))
            }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            earnings: { $sum: '$amount' },
            transactions: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]);

      const stats = transactionStats[0] || {
        totalTransactions: 0,
        totalEarnings: 0,
        averageAmount: 0
      };

      res.json({
        success: true,
        data: {
          merchant: {
            ...merchant,
            statistics: {
              ...stats,
              monthlyEarnings
            }
          }
        }
      });

    } catch (error) {
      console.error('Get merchant profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve merchant profile',
        error: error.message
      });
    }
  }

  /**
   * Update merchant's own profile
   */
  async updateMyProfile(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const merchant = await Merchant.findOne({ ownerId: req.userId });
      if (!merchant) {
        return res.status(404).json({
          success: false,
          message: 'Merchant profile not found'
        });
      }

      // Restrict certain updates if verified
      const allowedFields = [
        'description',
        'operatingHours',
        'contact.phone',
        'contact.website',
        'location.floor',
        'location.room',
        'images'
      ];

      const updateData = {};
      allowedFields.forEach(field => {
        const keys = field.split('.');
        let source = req.body;
        let target = updateData;

        for (let i = 0; i < keys.length - 1; i++) {
          if (!target[keys[i]]) target[keys[i]] = {};
          target = target[keys[i]];
          source = source[keys[i]];
        }

        if (source && source.hasOwnProperty(keys[keys.length - 1])) {
          target[keys[keys.length - 1]] = source[keys[keys.length - 1]];
        }
      });

      const updatedMerchant = await Merchant.findOneAndUpdate(
        { ownerId: req.userId },
        updateData,
        { new: true, runValidators: true }
      );

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          merchant: updatedMerchant
        }
      });

    } catch (error) {
      console.error('Update merchant profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update profile',
        error: error.message
      });
    }
  }

  /**
   * Get merchant categories
   */
  async getCategories(req, res) {
    try {
      const categories = await Merchant.distinct('category');
      const subcategories = await Merchant.aggregate([
        {
          $group: {
            _id: '$category',
            subcategories: { $addToSet: '$subcategory' }
          }
        }
      ]);

      const categoryData = subcategories.reduce((acc, item) => {
        if (item._id) {
          acc[item._id] = item.subcategories.filter(Boolean);
        }
        return acc;
      }, {});

      res.json({
        success: true,
        data: {
          categories: categories.filter(Boolean),
          categorySubcategories: categoryData
        }
      });

    } catch (error) {
      console.error('Get categories error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve categories',
        error: error.message
      });
    }
  }

  /**
   * Get merchant transactions
   */
  async getMerchantTransactions(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        startDate,
        endDate,
        minAmount,
        maxAmount
      } = req.query;

      const merchant = await Merchant.findOne({ ownerId: req.userId });
      if (!merchant) {
        return res.status(404).json({
          success: false,
          message: 'Merchant profile not found'
        });
      }

      // Build query
      const query = {
        'metadata.merchantId': merchant._id
      };

      if (status) query.status = status;

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      if (minAmount || maxAmount) {
        query.amount = {};
        if (minAmount) query.amount.$gte = parseFloat(minAmount);
        if (maxAmount) query.amount.$lte = parseFloat(maxAmount);
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [transactions, totalTransactions] = await Promise.all([
        Transaction.find(query)
          .populate('userId', 'name email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Transaction.countDocuments(query)
      ]);

      // Calculate totals
      const totalsResult = await Transaction.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            avgAmount: { $avg: '$amount' }
          }
        }
      ]);

      const totals = totalsResult[0] || { totalAmount: 0, avgAmount: 0 };

      res.json({
        success: true,
        data: {
          transactions,
          summary: {
            totalTransactions,
            totalAmount: totals.totalAmount,
            averageAmount: totals.avgAmount
          },
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalTransactions / parseInt(limit)),
            totalTransactions,
            transactionsPerPage: parseInt(limit)
          }
        }
      });

    } catch (error) {
      console.error('Get merchant transactions error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve transactions',
        error: error.message
      });
    }
  }

  /**
   * Generate new QR code for merchant
   */
  async regenerateQRCode(req, res) {
    try {
      const merchant = await Merchant.findOne({ ownerId: req.userId });
      if (!merchant) {
        return res.status(404).json({
          success: false,
          message: 'Merchant profile not found'
        });
      }

      // Generate new QR code data
      const qrData = `MERCHANT_${Date.now()}_${req.userId.slice(-4)}`;
      
      // Generate QR code image
      const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        width: 256
      });

      merchant.qrCode = qrData;
      merchant.qrCodeImage = qrCodeDataUrl;
      await merchant.save();

      res.json({
        success: true,
        message: 'QR code regenerated successfully',
        data: {
          qrCode: qrData,
          qrCodeImage: qrCodeDataUrl
        }
      });

    } catch (error) {
      console.error('Regenerate QR code error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to regenerate QR code',
        error: error.message
      });
    }
  }
}

module.exports = new MerchantController();
