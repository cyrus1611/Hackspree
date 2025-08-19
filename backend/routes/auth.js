const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth, optionalAuth } = require('../middleware/auth');
const { generateTransactionId } = require('../utils/helpers');

const router = express.Router();

// Generate JWT token
const generateToken = (userId, role = 'student') => {
  return jwt.sign(
    { 
      userId, 
      role,
      timestamp: Date.now()
    }, 
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRE || '30d'
    }
  );
};

// Validation rules
const registerValidation = [
  body('universityId')
    .notEmpty()
    .withMessage('University ID is required')
    .isLength({ min: 6, max: 12 })
    .withMessage('University ID must be 6-12 characters')
    .matches(/^[A-Z0-9]+$/)
    .withMessage('University ID must contain only uppercase letters and numbers'),
  
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be 2-50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces'),
  
  body('email')
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  
  body('password')
    .isLength({ min: 6, max: 128 })
    .withMessage('Password must be 6-128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase, uppercase, and number'),
  
  body('phone')
    .optional()
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Phone must be a valid 10-digit Indian number'),
  
  body('course')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Course name cannot exceed 100 characters'),
  
  body('semester')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Semester must be between 1 and 10')
];

const loginValidation = [
  body('email')
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', registerValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { 
      universityId, 
      name, 
      email, 
      password, 
      phone, 
      course, 
      semester,
      dateOfBirth 
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [
        { email: email.toLowerCase() }, 
        { universityId: universityId.toUpperCase() }
      ] 
    });

    if (existingUser) {
      const field = existingUser.email === email.toLowerCase() ? 'email' : 'university ID';
      return res.status(409).json({ 
        message: `User already exists with this ${field}`,
        field,
        code: 'USER_EXISTS'
      });
    }

    // Create new user
    const userData = {
      universityId: universityId.toUpperCase(),
      name: name.trim(),
      email: email.toLowerCase(),
      password,
      role: 'student'
    };

    // Add optional fields
    if (phone) userData.phone = phone;
    if (course) userData.course = course.trim();
    if (semester) userData.semester = parseInt(semester);
    if (dateOfBirth) userData.dateOfBirth = new Date(dateOfBirth);

    const user = new User(userData);
    await user.save();

    // Generate token
    const token = generateToken(user._id, user.role);

    // Log successful registration
    console.log(`✅ New user registered: ${user.email} (${user.universityId})`);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        universityId: user.universityId,
        name: user.name,
        email: user.email,
        role: user.role,
        walletBalance: user.walletBalance,
        isVerified: user.isVerified,
        course: user.course,
        semester: user.semester
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle mongoose validation errors
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
      message: 'Server error during registration',
      code: 'REGISTRATION_ERROR'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', loginValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password, rememberMe } = req.body;

    // Find user and include password for comparison
    const user = await User.findOne({ 
      email: email.toLowerCase() 
    }).select('+password +loginAttempts +lockUntil');

    if (!user) {
      return res.status(401).json({ 
        message: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Check if account is locked
    if (user.isLocked) {
      const lockTimeRemaining = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({ 
        message: `Account locked due to multiple failed login attempts. Try again in ${lockTimeRemaining} minutes.`,
        code: 'ACCOUNT_LOCKED',
        lockTimeRemaining
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({ 
        message: 'Account is deactivated. Please contact support.',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Compare password
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      // Handle failed login attempt
      await user.handleFailedLogin();
      
      const remainingAttempts = (parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5) - user.loginAttempts;
      
      return res.status(401).json({ 
        message: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS',
        remainingAttempts: Math.max(0, remainingAttempts)
      });
    }

    // Handle successful login
    await user.handleSuccessfulLogin();

    // Generate token with appropriate expiry
    const tokenExpiry = rememberMe ? '30d' : '1d';
    const token = jwt.sign(
      { 
        userId: user._id, 
        role: user.role,
        timestamp: Date.now()
      },
      process.env.JWT_SECRET,
      { expiresIn: tokenExpiry }
    );

    // Log successful login
    console.log(`✅ User logged in: ${user.email} from IP: ${req.ip}`);

    res.json({
      message: 'Login successful',
      token,
      expiresIn: rememberMe ? '30 days' : '1 day',
      user: {
        id: user._id,
        universityId: user.universityId,
        name: user.name,
        email: user.email,
        role: user.role,
        walletBalance: user.walletBalance,
        isVerified: user.isVerified,
        course: user.course,
        semester: user.semester,
        profilePicture: user.profilePicture,
        lastLogin: user.lastLogin
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      message: 'Server error during login',
      code: 'LOGIN_ERROR'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('-password')
      .lean();
    
    if (!user) {
      return res.status(404).json({ 
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Add computed fields
    user.walletBalanceInRupees = (user.walletBalance / parseFloat(process.env.COLLEX_CONVERSION_RATE || 1)).toFixed(2);
    user.canSpend = user.walletBalance > 0;

    res.json({
      message: 'Profile fetched successfully',
      user
    });

  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ 
      message: 'Server error fetching profile',
      code: 'PROFILE_FETCH_ERROR'
    });
  }
});

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', auth, [
  body('name')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be 2-50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces'),
  
  body('phone')
    .optional()
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Phone must be a valid 10-digit Indian number'),
  
  body('course')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Course name cannot exceed 100 characters'),
  
  body('semester')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Semester must be between 1 and 10'),
  
  body('dateOfBirth')
    .optional()
    .isISO8601()
    .withMessage('Invalid date format')
    .custom(value => {
      if (new Date(value) >= new Date()) {
        throw new Error('Date of birth cannot be in the future');
      }
      return true;
    })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const allowedUpdates = ['name', 'phone', 'course', 'semester', 'dateOfBirth'];
    const updates = {};
    
    // Only include allowed fields that are present in request
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

    // Parse date if provided
    if (updates.dateOfBirth) {
      updates.dateOfBirth = new Date(updates.dateOfBirth);
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { ...updates, lastUpdated: new Date() },
      { 
        new: true, 
        runValidators: true,
        select: '-password'
      }
    );

    if (!user) {
      return res.status(404).json({ 
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    console.log(`✅ Profile updated: ${user.email}`);

    res.json({
      message: 'Profile updated successfully',
      user,
      updatedFields: Object.keys(updates)
    });

  } catch (error) {
    console.error('Profile update error:', error);
    
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
      message: 'Server error updating profile',
      code: 'PROFILE_UPDATE_ERROR'
    });
  }
});

// @route   POST /api/auth/change-password
// @desc    Change user password
// @access  Private
router.post('/change-password', auth, [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  
  body('newPassword')
    .isLength({ min: 6, max: 128 })
    .withMessage('New password must be 6-128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one lowercase, uppercase, and number'),
  
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Password confirmation does not match');
      }
      return true;
    })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findById(req.userId).select('+password');
    
    if (!user) {
      return res.status(404).json({ 
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Check current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ 
        message: 'Current password is incorrect',
        code: 'INVALID_CURRENT_PASSWORD'
      });
    }

    // Check if new password is different from current
    const isSamePassword = await user.comparePassword(newPassword);
    
    if (isSamePassword) {
      return res.status(400).json({ 
        message: 'New password must be different from current password',
        code: 'SAME_PASSWORD'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    console.log(`✅ Password changed: ${user.email}`);

    res.json({
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ 
      message: 'Server error changing password',
      code: 'PASSWORD_CHANGE_ERROR'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user (client-side token removal)
// @access  Private
router.post('/logout', auth, async (req, res) => {
  try {
    // Update last login time
    await User.findByIdAndUpdate(req.userId, {
      lastLogin: new Date()
    });

    console.log(`✅ User logged out: ${req.user.email}`);

    res.json({
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      message: 'Server error during logout',
      code: 'LOGOUT_ERROR'
    });
  }
});

// @route   GET /api/auth/verify-token
// @desc    Verify if token is valid
// @access  Private
router.get('/verify-token', auth, (req, res) => {
  res.json({
    message: 'Token is valid',
    user: {
      id: req.user._id,
      email: req.user.email,
      role: req.user.role,
      isActive: req.user.isActive
    }
  });
});

module.exports = router;
