const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const rateLimit = require('express-rate-limit');
const moment = require('moment');

// Import models and services
const User = require('../models/User');
const TokenBlacklist = require('../models/TokenBlacklist');
const AuditLog = require('../models/AuditLog');
const emailService = require('./emailService');
const smsService = require('./smsService');
const config = require('../config');

/**
 * Comprehensive Authentication Service for Hackspree Wallet Application
 * 
 * Features:
 * - Secure user registration and authentication
 * - JWT token management with refresh tokens
 * - Multi-factor authentication (TOTP, SMS)
 * - Password reset and email verification
 * - Role-based access control
 * - Session management and security
 * - Account lockout and brute force protection
 * - Device tracking and management
 * - Security auditing and logging
 * - Social authentication integration
 */

class AuthService {
  constructor() {
    this.config = {
      jwt: {
        secret: config.auth.jwt.secret,
        expiresIn: config.auth.jwt.expiresIn || '15m',
        refreshSecret: config.auth.jwt.refreshSecret,
        refreshExpiresIn: config.auth.jwt.refreshExpiresIn || '7d'
      },
      bcrypt: {
        saltRounds: config.auth.bcrypt.saltRounds || 12
      },
      security: {
        maxLoginAttempts: 5,
        lockoutDuration: 30 * 60 * 1000, // 30 minutes
        passwordResetExpiry: 60 * 60 * 1000, // 1 hour
        emailVerificationExpiry: 24 * 60 * 60 * 1000, // 24 hours
        totpWindow: 2, // Allow 2 time steps before/after current
        requireEmailVerification: true,
        enforcePasswordPolicy: true
      },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSymbols: true,
        preventReuse: 5 // Prevent reusing last 5 passwords
      }
    };

    this.initializeRateLimiters();
  }

  /**
   * Initialize rate limiters for security
   */
  initializeRateLimiters() {
    this.loginLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 attempts per window
      skipSuccessfulRequests: true,
      keyGenerator: (req) => `login_${req.ip}_${req.body.email}`,
      handler: (req, res) => {
        throw new Error('Too many login attempts, please try again later');
      }
    });

    this.passwordResetLimiter = rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 3, // 3 password reset attempts per hour
      keyGenerator: (req) => `reset_${req.ip}_${req.body.email}`
    });
  }

  /**
   * PASSWORD MANAGEMENT METHODS
   */

  /**
   * Validate password against policy
   */
  validatePasswordPolicy(password) {
    const policy = this.config.passwordPolicy;
    const errors = [];

    if (password.length < policy.minLength) {
      errors.push(`Password must be at least ${policy.minLength} characters long`);
    }

    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (policy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (policy.requireNumbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (policy.requireSymbols && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    // Check for common weak passwords
    const commonPasswords = [
      'password', '123456', 'password123', 'admin', 'qwerty',
      'letmein', 'welcome', 'monkey', '1234567890'
    ];

    if (commonPasswords.includes(password.toLowerCase())) {
      errors.push('Password is too common, please choose a stronger password');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Hash password with bcrypt
   */
  async hashPassword(password) {
    if (this.config.security.enforcePasswordPolicy) {
      const validation = this.validatePasswordPolicy(password);
      if (!validation.isValid) {
        throw new Error(`Password policy violation: ${validation.errors.join(', ')}`);
      }
    }

    const salt = await bcrypt.genSalt(this.config.bcrypt.saltRounds);
    return await bcrypt.hash(password, salt);
  }

  /**
   * Verify password
   */
  async verifyPassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }

  /**
   * Check if password was used recently
   */
  async isPasswordReused(userId, newPassword) {
    if (!this.config.security.enforcePasswordPolicy) return false;

    const user = await User.findById(userId);
    if (!user || !user.passwordHistory) return false;

    const recentPasswords = user.passwordHistory.slice(-this.config.passwordPolicy.preventReuse);
    
    for (const oldPasswordHash of recentPasswords) {
      if (await bcrypt.compare(newPassword, oldPasswordHash)) {
        return true;
      }
    }

    return false;
  }

  /**
   * JWT TOKEN MANAGEMENT METHODS
   */

  /**
   * Generate access token
   */
  generateAccessToken(payload) {
    return jwt.sign(
      {
        ...payload,
        type: 'access',
        iat: Math.floor(Date.now() / 1000)
      },
      this.config.jwt.secret,
      { expiresIn: this.config.jwt.expiresIn }
    );
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(payload) {
    return jwt.sign(
      {
        ...payload,
        type: 'refresh',
        iat: Math.floor(Date.now() / 1000)
      },
      this.config.jwt.refreshSecret,
      { expiresIn: this.config.jwt.refreshExpiresIn }
    );
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(token, this.config.jwt.secret);
      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }
      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired access token');
    }
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token) {
    try {
      const decoded = jwt.verify(token, this.config.jwt.refreshSecret);
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }
      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  /**
   * Revoke token by adding to blacklist
   */
  async revokeToken(token, reason = 'logout') {
    try {
      const decoded = jwt.decode(token);
      if (!decoded) return;

      const expiresAt = new Date(decoded.exp * 1000);
      
      await TokenBlacklist.create({
        token: crypto.createHash('sha256').update(token).digest('hex'),
        userId: decoded.userId,
        expiresAt,
        reason,
        revokedAt: new Date()
      });
    } catch (error) {
      console.error('Error revoking token:', error);
    }
  }

  /**
   * Check if token is blacklisted
   */
  async isTokenBlacklisted(token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const blacklistedToken = await TokenBlacklist.findOne({
      token: tokenHash,
      expiresAt: { $gt: new Date() }
    });
    
    return !!blacklistedToken;
  }

  /**
   * USER AUTHENTICATION METHODS
   */

  /**
   * Register new user
   */
  async registerUser(userData, req = null) {
    const { name, email, password, phone, dateOfBirth } = userData;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { phone }]
    });

    if (existingUser) {
      throw new Error('User with this email or phone already exists');
    }

    // Validate and hash password
    const hashedPassword = await this.hashPassword(password);

    // Create user
    const user = new User({
      name,
      email,
      phone,
      dateOfBirth,
      passwordHash: hashedPassword,
      passwordHistory: [hashedPassword],
      role: 'user',
      isActive: true,
      isEmailVerified: !this.config.security.requireEmailVerification,
      isPhoneVerified: false,
      security: {
        loginAttempts: 0,
        lastLogin: null,
        registrationIP: req?.ip || null,
        registrationUserAgent: req?.get('User-Agent') || null
      }
    });

    await user.save();

    // Send email verification if required
    if (this.config.security.requireEmailVerification) {
      await this.sendEmailVerification(user);
    }

    // Log registration
    await this.logSecurityEvent(user._id, 'USER_REGISTERED', 'SUCCESS', req, {
      email: user.email,
      requiresEmailVerification: this.config.security.requireEmailVerification
    });

    return {
      user: this.sanitizeUser(user),
      requiresEmailVerification: this.config.security.requireEmailVerification
    };
  }

  /**
   * Authenticate user login
   */
  async authenticateUser(email, password, req = null) {
    const user = await User.findOne({ email }).select('+passwordHash +security');
    
    if (!user) {
      await this.logSecurityEvent(null, 'LOGIN_FAILED', 'FAILURE', req, {
        email,
        reason: 'User not found'
      });
      throw new Error('Invalid credentials');
    }

    // Check if account is locked
    if (await this.isAccountLocked(user)) {
      await this.logSecurityEvent(user._id, 'LOGIN_BLOCKED', 'WARNING', req, {
        reason: 'Account locked'
      });
      throw new Error('Account temporarily locked due to multiple failed attempts');
    }

    // Verify password
    const isValidPassword = await this.verifyPassword(password, user.passwordHash);
    
    if (!isValidPassword) {
      await this.handleFailedLogin(user, req);
      throw new Error('Invalid credentials');
    }

    // Check if email verification is required
    if (this.config.security.requireEmailVerification && !user.isEmailVerified) {
      throw new Error('Email verification required');
    }

    // Reset failed login attempts on successful login
    user.security.loginAttempts = 0;
    user.security.lastLogin = new Date();
    user.security.lastLoginIP = req?.ip || null;
    user.security.lastLoginUserAgent = req?.get('User-Agent') || null;

    await user.save();

    // Generate tokens
    const tokenPayload = {
      userId: user._id,
      email: user.email,
      role: user.role,
      permissions: user.permissions || []
    };

    const accessToken = this.generateAccessToken(tokenPayload);
    const refreshToken = this.generateRefreshToken({ userId: user._id });

    // Store refresh token
    user.refreshTokens = user.refreshTokens || [];
    user.refreshTokens.push({
      token: crypto.createHash('sha256').update(refreshToken).digest('hex'),
      createdAt: new Date(),
      lastUsedAt: new Date(),
      userAgent: req?.get('User-Agent') || null,
      ipAddress: req?.ip || null
    });

    // Keep only last 5 refresh tokens
    if (user.refreshTokens.length > 5) {
      user.refreshTokens = user.refreshTokens.slice(-5);
    }

    await user.save();

    // Log successful login
    await this.logSecurityEvent(user._id, 'LOGIN_SUCCESS', 'SUCCESS', req);

    return {
      user: this.sanitizeUser(user),
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: this.config.jwt.expiresIn
      }
    };
  }

  /**
   * Handle failed login attempt
   */
  async handleFailedLogin(user, req = null) {
    user.security.loginAttempts = (user.security.loginAttempts || 0) + 1;
    user.security.lastFailedLogin = new Date();
    
    if (user.security.loginAttempts >= this.config.security.maxLoginAttempts) {
      user.security.lockedUntil = new Date(Date.now() + this.config.security.lockoutDuration);
      
      await this.logSecurityEvent(user._id, 'ACCOUNT_LOCKED', 'WARNING', req, {
        attempts: user.security.loginAttempts,
        lockedUntil: user.security.lockedUntil
      });
    }

    await user.save();

    await this.logSecurityEvent(user._id, 'LOGIN_FAILED', 'FAILURE', req, {
      attempts: user.security.loginAttempts,
      maxAttempts: this.config.security.maxLoginAttempts
    });
  }

  /**
   * Check if account is locked
   */
  async isAccountLocked(user) {
    if (!user.security?.lockedUntil) return false;
    
    if (user.security.lockedUntil > new Date()) {
      return true;
    }

    // Clear lock if expired
    user.security.lockedUntil = null;
    user.security.loginAttempts = 0;
    await user.save();
    
    return false;
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken, req = null) {
    // Verify refresh token
    const decoded = this.verifyRefreshToken(refreshToken);
    
    // Check if token is blacklisted
    if (await this.isTokenBlacklisted(refreshToken)) {
      throw new Error('Refresh token has been revoked');
    }

    // Get user and verify refresh token exists
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      throw new Error('Invalid user');
    }

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const storedToken = user.refreshTokens?.find(rt => rt.token === tokenHash);
    
    if (!storedToken) {
      throw new Error('Refresh token not found');
    }

    // Update last used timestamp
    storedToken.lastUsedAt = new Date();
    await user.save();

    // Generate new access token
    const tokenPayload = {
      userId: user._id,
      email: user.email,
      role: user.role,
      permissions: user.permissions || []
    };

    const newAccessToken = this.generateAccessToken(tokenPayload);

    await this.logSecurityEvent(user._id, 'TOKEN_REFRESHED', 'SUCCESS', req);

    return {
      accessToken: newAccessToken,
      expiresIn: this.config.jwt.expiresIn
    };
  }

  /**
   * Logout user and revoke tokens
   */
  async logoutUser(userId, refreshToken = null, req = null) {
    const user = await User.findById(userId);
    if (!user) return;

    // Revoke refresh token if provided
    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      user.refreshTokens = user.refreshTokens?.filter(rt => rt.token !== tokenHash) || [];
      await user.save();
      
      // Add to blacklist
      await this.revokeToken(refreshToken, 'logout');
    }

    await this.logSecurityEvent(userId, 'LOGOUT', 'SUCCESS', req);
  }

  /**
   * Logout from all devices
   */
  async logoutFromAllDevices(userId, req = null) {
    const user = await User.findById(userId);
    if (!user) return;

    // Revoke all refresh tokens
    if (user.refreshTokens) {
      for (const tokenData of user.refreshTokens) {
        // Note: We can't revoke the actual tokens since we only store hashes
        // In a production system, you might want to store token IDs instead
      }
      user.refreshTokens = [];
      await user.save();
    }

    await this.logSecurityEvent(userId, 'LOGOUT_ALL_DEVICES', 'SUCCESS', req);
  }

  /**
   * MULTI-FACTOR AUTHENTICATION METHODS
   */

  /**
   * Generate TOTP secret for user
   */
  async generateTOTPSecret(userId) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const secret = speakeasy.generateSecret({
      name: `Hackspree Wallet (${user.email})`,
      issuer: 'Hackspree'
    });

    user.mfa = user.mfa || {};
    user.mfa.totpSecret = secret.base32;
    user.mfa.totpEnabled = false;
    await user.save();

    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

    return {
      secret: secret.base32,
      qrCode: qrCodeUrl,
      backupCodes: this.generateBackupCodes()
    };
  }

  /**
   * Verify TOTP token
   */
  verifyTOTPToken(secret, token) {
    return speakeasy.totp.verify({
      secret,
      token,
      window: this.config.security.totpWindow,
      encoding: 'base32'
    });
  }

  /**
   * Enable TOTP for user
   */
  async enableTOTP(userId, token) {
    const user = await User.findById(userId);
    if (!user || !user.mfa?.totpSecret) {
      throw new Error('TOTP not initialized');
    }

    if (!this.verifyTOTPToken(user.mfa.totpSecret, token)) {
      throw new Error('Invalid TOTP token');
    }

    user.mfa.totpEnabled = true;
    user.mfa.backupCodes = this.generateBackupCodes();
    await user.save();

    await this.logSecurityEvent(userId, 'MFA_ENABLED', 'SUCCESS');

    return user.mfa.backupCodes;
  }

  /**
   * Generate backup codes
   */
  generateBackupCodes(count = 10) {
    const codes = [];
    for (let i = 0; i < count; i++) {
      codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }
    return codes;
  }

  /**
   * PASSWORD RESET AND EMAIL VERIFICATION METHODS
   */

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email, req = null) {
    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if email exists
      return { message: 'If the email exists, a reset link will be sent' };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.passwordReset = {
      token: resetTokenHash,
      expiresAt: new Date(Date.now() + this.config.security.passwordResetExpiry),
      requestedAt: new Date(),
      requestIP: req?.ip || null
    };

    await user.save();

    // Send email with reset token
    await emailService.sendPasswordResetEmail(user, resetToken);

    await this.logSecurityEvent(user._id, 'PASSWORD_RESET_REQUESTED', 'INFO', req);

    return { message: 'Password reset email sent' };
  }

  /**
   * Reset password using token
   */
  async resetPassword(token, newPassword, req = null) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    const user = await User.findOne({
      'passwordReset.token': tokenHash,
      'passwordReset.expiresAt': { $gt: new Date() }
    }).select('+passwordHash +passwordHistory');

    if (!user) {
      throw new Error('Invalid or expired reset token');
    }

    // Check password reuse
    if (await this.isPasswordReused(user._id, newPassword)) {
      throw new Error('Cannot reuse recent passwords');
    }

    // Hash new password
    const hashedPassword = await this.hashPassword(newPassword);

    // Update password and history
    user.passwordHash = hashedPassword;
    user.passwordHistory = user.passwordHistory || [];
    user.passwordHistory.push(hashedPassword);
    
    // Keep only recent passwords for reuse checking
    if (user.passwordHistory.length > this.config.passwordPolicy.preventReuse) {
      user.passwordHistory = user.passwordHistory.slice(-this.config.passwordPolicy.preventReuse);
    }

    // Clear reset token and unlock account
    user.passwordReset = undefined;
    user.security.loginAttempts = 0;
    user.security.lockedUntil = null;

    // Revoke all refresh tokens for security
    user.refreshTokens = [];

    await user.save();

    await this.logSecurityEvent(user._id, 'PASSWORD_RESET_COMPLETED', 'SUCCESS', req);

    return { message: 'Password successfully reset' };
  }

  /**
   * Send email verification
   */
  async sendEmailVerification(user) {
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');

    user.emailVerification = {
      token: tokenHash,
      expiresAt: new Date(Date.now() + this.config.security.emailVerificationExpiry),
      sentAt: new Date()
    };

    await user.save();

    await emailService.sendEmailVerification(user, verificationToken);
  }

  /**
   * Verify email address
   */
  async verifyEmail(token, req = null) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    const user = await User.findOne({
      'emailVerification.token': tokenHash,
      'emailVerification.expiresAt': { $gt: new Date() }
    });

    if (!user) {
      throw new Error('Invalid or expired verification token');
    }

    user.isEmailVerified = true;
    user.emailVerification = undefined;
    await user.save();

    await this.logSecurityEvent(user._id, 'EMAIL_VERIFIED', 'SUCCESS', req);

    return { message: 'Email successfully verified' };
  }

  /**
   * UTILITY METHODS
   */

  /**
   * Sanitize user object for client response
   */
  sanitizeUser(user) {
    const sanitized = user.toObject();
    delete sanitized.passwordHash;
    delete sanitized.passwordHistory;
    delete sanitized.passwordReset;
    delete sanitized.emailVerification;
    delete sanitized.refreshTokens;
    delete sanitized.mfa?.totpSecret;
    delete sanitized.security;
    
    return sanitized;
  }

  /**
   * Log security events
   */
  async logSecurityEvent(userId, action, status, req = null, details = {}) {
    try {
      await AuditLog.create({
        userId,
        action,
        status,
        category: 'AUTHENTICATION',
        ipAddress: req?.ip || null,
        userAgent: req?.get('User-Agent') || null,
        details,
        createdAt: new Date()
      });
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  /**
   * Check user permissions
   */
  hasPermission(user, permission) {
    if (!user.permissions) return false;
    return user.permissions.includes(permission) || user.role === 'admin';
  }

  /**
   * Check user role
   */
  hasRole(user, requiredRoles) {
    if (!Array.isArray(requiredRoles)) {
      requiredRoles = [requiredRoles];
    }
    return requiredRoles.includes(user.role);
  }

  /**
   * Generate secure session ID
   */
  generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Validate session
   */
  async validateSession(sessionId, userId) {
    // Implementation would depend on your session storage strategy
    // This is a placeholder for session validation logic
    return true;
  }
}

module.exports = new AuthService();
