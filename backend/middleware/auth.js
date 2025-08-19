const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Authentication middleware
 * Verifies JWT token and adds user to request object
 */
const auth = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({ 
        message: 'No authorization header provided',
        code: 'NO_AUTH_HEADER'
      });
    }

    // Check if token starts with 'Bearer '
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        message: 'Invalid token format. Use Bearer <token>',
        code: 'INVALID_TOKEN_FORMAT'
      });
    }

    const token = authHeader.replace('Bearer ', '');

    if (!token || token === 'null' || token === 'undefined') {
      return res.status(401).json({ 
        message: 'No token provided, access denied',
        code: 'NO_TOKEN'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user still exists and is active
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ 
        message: 'User not found. Token may be invalid.',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({ 
        message: 'User account is deactivated',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Add user to request object
    req.userId = decoded.userId;
    req.user = user;
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        message: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        message: 'Token expired. Please login again.',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    res.status(500).json({ 
      message: 'Server error in authentication',
      code: 'AUTH_SERVER_ERROR'
    });
  }
};

/**
 * Admin authorization middleware
 * Checks if user has admin or super_admin role
 */
const adminAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      message: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ 
      message: 'Access denied. Admin privileges required.',
      code: 'ADMIN_REQUIRED',
      userRole: req.user.role
    });
  }
  
  next();
};

/**
 * Merchant authorization middleware
 * Checks if user has merchant role or higher
 */
const merchantAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      message: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  const allowedRoles = ['merchant', 'admin', 'super_admin'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ 
      message: 'Access denied. Merchant privileges required.',
      code: 'MERCHANT_REQUIRED',
      userRole: req.user.role
    });
  }
  
  next();
};

/**
 * Optional auth middleware
 * Adds user to request if token is provided, but doesn't fail if not
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continue without authentication
    }

    const token = authHeader.replace('Bearer ', '');
    
    if (!token || token === 'null' || token === 'undefined') {
      return next(); // Continue without authentication
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (user && user.isActive) {
      req.userId = decoded.userId;
      req.user = user;
    }
    
    next();
  } catch (error) {
    // If token is invalid, continue without authentication
    next();
  }
};

module.exports = { 
  auth, 
  adminAuth, 
  merchantAuth, 
  optionalAuth 
};
