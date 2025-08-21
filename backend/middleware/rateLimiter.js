const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const { redisService } = require('../config/redis');

/**
 * Rate Limiter Configuration for Hackspree Wallet Application
 */

/**
 * Create Redis store for rate limiting (if Redis is available)
 */
const createStore = () => {
  try {
    if (redisService && redisService.isConnected()) {
      return new RedisStore({
        sendCommand: (...args) => redisService.getClient().sendCommand(args),
        prefix: 'rl:', // Rate limit prefix
      });
    }
  } catch (error) {
    console.warn('Redis not available for rate limiting, using memory store');
  }
  return undefined; // Falls back to memory store
};

/**
 * Custom key generator that considers user ID and IP
 */
const createKeyGenerator = (prefix) => {
  return (req) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userId = req.userId || 'anonymous';
    return `${prefix}:${ip}:${userId}`;
  };
};

/**
 * Custom skip function for trusted IPs and admin users
 */
const createSkipFunction = () => {
  const trustedIPs = (process.env.TRUSTED_IPS || '').split(',').filter(Boolean);
  
  return (req) => {
    // Skip for trusted IPs
    if (trustedIPs.includes(req.ip)) {
      return true;
    }
    
    // Skip for admin users (if authenticated)
    if (req.user && req.user.role === 'admin') {
      return true;
    }
    
    return false;
  };
};

/**
 * Custom handler for rate limit exceeded
 */
const createRateLimitHandler = (message, logEvent = true) => {
  return (req, res) => {
    if (logEvent) {
      const { securityLogger } = require('./logger');
      securityLogger.logRateLimitExceeded(req, res.getHeader('X-RateLimit-Limit'), res.getHeader('X-RateLimit-Window'));
    }

    // Add security headers
    res.set({
      'Retry-After': Math.round(req.rateLimit.msBeforeNext / 1000) || 1,
      'X-RateLimit-Limit': req.rateLimit.limit,
      'X-RateLimit-Remaining': req.rateLimit.remaining,
      'X-RateLimit-Reset': new Date(Date.now() + req.rateLimit.msBeforeNext).toISOString()
    });

    res.status(429).json({
      success: false,
      message: message || 'Too many requests, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.round(req.rateLimit.msBeforeNext / 1000) || 1,
      limit: req.rateLimit.limit,
      remaining: req.rateLimit.remaining,
      resetTime: new Date(Date.now() + req.rateLimit.msBeforeNext).toISOString()
    });
  };
};

/**
 * General API Rate Limiter
 */
const generalLimiter = rateLimit({
  store: createStore(),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.RATE_LIMIT_GENERAL || 100, // 100 requests per window per IP
  keyGenerator: createKeyGenerator('general'),
  skip: createSkipFunction(),
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many requests from this IP, please try again in 15 minutes.')
});

/**
 * Authentication Rate Limiter (Login, Register, Password Reset)
 */
const authLimiter = rateLimit({
  store: createStore(),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.RATE_LIMIT_AUTH || 10, // 10 attempts per window per IP
  keyGenerator: createKeyGenerator('auth'),
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many authentication attempts from this IP, please try again in 15 minutes.')
});

/**
 * Strict Authentication Rate Limiter (After failed attempts)
 */
const strictAuthLimiter = rateLimit({
  store: createStore(),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Only 3 attempts per hour after multiple failures
  keyGenerator: createKeyGenerator('strict_auth'),
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Account temporarily locked due to multiple failed login attempts. Please try again in 1 hour.')
});

/**
 * Wallet Top-up Rate Limiter
 */
const walletTopupLimiter = rateLimit({
  store: createStore(),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.RATE_LIMIT_TOPUP || 5, // 5 top-up attempts per window
  keyGenerator: createKeyGenerator('topup'),
  skip: createSkipFunction(),
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many wallet top-up attempts, please try again in 15 minutes.')
});

/**
 * Wallet Transfer Rate Limiter
 */
const walletTransferLimiter = rateLimit({
  store: createStore(),
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: process.env.RATE_LIMIT_TRANSFER || 10, // 10 transfers per window
  keyGenerator: createKeyGenerator('transfer'),
  skip: createSkipFunction(),
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many wallet transfer attempts, please try again in 5 minutes.')
});

/**
 * Payment Processing Rate Limiter
 */
const paymentLimiter = rateLimit({
  store: createStore(),
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: process.env.RATE_LIMIT_PAYMENT || 8, // 8 payment attempts per window
  keyGenerator: createKeyGenerator('payment'),
  skip: createSkipFunction(),
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many payment attempts, please try again in 10 minutes.')
});

/**
 * OTP/Verification Rate Limiter
 */
const otpLimiter = rateLimit({
  store: createStore(),
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // 5 OTP requests per window
  keyGenerator: createKeyGenerator('otp'),
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many OTP requests, please try again in 10 minutes.')
});

/**
 * Password Reset Rate Limiter
 */
const passwordResetLimiter = rateLimit({
  store: createStore(),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 password reset attempts per hour
  keyGenerator: createKeyGenerator('password_reset'),
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many password reset requests, please try again in 1 hour.')
});

/**
 * Admin Operations Rate Limiter
 */
const adminLimiter = rateLimit({
  store: createStore(),
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // 50 admin operations per window
  keyGenerator: createKeyGenerator('admin'),
  skip: (req) => {
    // Only apply to admin users
    return !req.user || req.user.role !== 'admin';
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many admin operations, please slow down.')
});

/**
 * File Upload Rate Limiter
 */
const uploadLimiter = rateLimit({
  store: createStore(),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 file uploads per window
  keyGenerator: createKeyGenerator('upload'),
  skip: createSkipFunction(),
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many file upload attempts, please try again in 15 minutes.')
});

/**
 * API Key Rate Limiter (for external integrations)
 */
const apiKeyLimiter = rateLimit({
  store: createStore(),
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute per API key
  keyGenerator: (req) => {
    const apiKey = req.get('X-API-Key') || req.query.apikey || 'no-key';
    return `api_key:${apiKey}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('API rate limit exceeded, please slow down your requests.')
});

/**
 * Webhook Rate Limiter (for incoming webhooks)
 */
const webhookLimiter = rateLimit({
  store: createStore(),
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 webhook calls per minute
  keyGenerator: (req) => {
    const source = req.get('User-Agent') || req.ip || 'unknown';
    return `webhook:${source}`;
  },
  standardHeaders: false, // Don't expose rate limit info for webhooks
  legacyHeaders: false,
  handler: createRateLimitHandler('Webhook rate limit exceeded.', false)
});

/**
 * Progressive Rate Limiter (increases restrictions based on violations)
 */
const createProgressiveLimiter = (baseMax, windowMs, keyPrefix) => {
  return async (req, res, next) => {
    const key = `${keyPrefix}:violations:${req.ip}`;
    
    try {
      // Get violation count
      const violations = await redisService.get(key) || 0;
      
      // Calculate adjusted limit (decrease by 20% for each violation)
      const adjustedMax = Math.max(1, baseMax - (violations * Math.floor(baseMax * 0.2)));
      
      // Create dynamic rate limiter
      const dynamicLimiter = rateLimit({
        store: createStore(),
        windowMs: windowMs,
        max: adjustedMax,
        keyGenerator: createKeyGenerator(keyPrefix),
        standardHeaders: true,
        legacyHeaders: false,
        handler: async (req, res) => {
          // Increment violation count
          await redisService.set(key, violations + 1, 24 * 60 * 60); // 24 hours expiry
          
          createRateLimitHandler(
            `Rate limit exceeded. Limit reduced to ${adjustedMax} due to previous violations.`
          )(req, res);
        }
      });
      
      dynamicLimiter(req, res, next);
    } catch (error) {
      console.error('Progressive rate limiter error:', error);
      next(); // Continue without rate limiting if Redis fails
    }
  };
};

/**
 * User-specific Rate Limiter
 */
const createUserSpecificLimiter = (maxRequests, windowMs, keyPrefix) => {
  return rateLimit({
    store: createStore(),
    windowMs: windowMs,
    max: maxRequests,
    keyGenerator: (req) => {
      const userId = req.userId || req.user?.id || 'anonymous';
      return `${keyPrefix}:user:${userId}`;
    },
    skip: createSkipFunction(),
    standardHeaders: true,
    legacyHeaders: false,
    handler: createRateLimitHandler(`Too many requests for this user account, please try again later.`)
  });
};

/**
 * Burst Rate Limiter (allows short bursts but limits sustained usage)
 */
const burstLimiter = rateLimit({
  store: createStore(),
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute (burst)
  keyGenerator: createKeyGenerator('burst'),
  skip: createSkipFunction(),
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Request burst limit exceeded, please slow down.')
});

/**
 * Rate Limiter Middleware Factory
 */
const createCustomLimiter = (options) => {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000,
    max: 100,
    keyPrefix: 'custom',
    message: 'Rate limit exceeded',
    skipTrustedIPs: true,
    skipAdmins: false
  };

  const config = { ...defaultOptions, ...options };

  return rateLimit({
    store: createStore(),
    windowMs: config.windowMs,
    max: config.max,
    keyGenerator: createKeyGenerator(config.keyPrefix),
    skip: (req) => {
      if (config.skipTrustedIPs && createSkipFunction()(req)) {
        return true;
      }
      if (config.skipAdmins && req.user?.role === 'admin') {
        return true;
      }
      return false;
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: createRateLimitHandler(config.message)
  });
};

/**
 * Rate Limit Status Endpoint
 */
const getRateLimitStatus = async (req, res) => {
  try {
    const ip = req.ip;
    const userId = req.userId || 'anonymous';
    
    // Get current rate limit status for different limiters
    const status = {
      ip: ip,
      userId: userId,
      limits: {
        general: await getRemainingRequests('general', ip, userId),
        auth: await getRemainingRequests('auth', ip, userId),
        topup: await getRemainingRequests('topup', ip, userId),
        transfer: await getRemainingRequests('transfer', ip, userId),
        payment: await getRemainingRequests('payment', ip, userId)
      },
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get rate limit status'
    });
  }
};

/**
 * Helper function to get remaining requests
 */
const getRemainingRequests = async (prefix, ip, userId) => {
  try {
    const key = `rl:${prefix}:${ip}:${userId}`;
    const current = await redisService.get(key) || 0;
    
    // This is a simplified version - actual implementation would depend on rate limiter configuration
    const limits = {
      general: 100,
      auth: 10,
      topup: 5,
      transfer: 10,
      payment: 8
    };
    
    return {
      limit: limits[prefix] || 100,
      used: current,
      remaining: Math.max(0, (limits[prefix] || 100) - current)
    };
  } catch (error) {
    return { limit: 0, used: 0, remaining: 0 };
  }
};

/**
 * Cleanup expired rate limit keys (maintenance function)
 */
const cleanupRateLimitKeys = async () => {
  try {
    const pattern = 'rl:*';
    const keys = await redisService.getClient().keys(pattern);
    
    let cleanedCount = 0;
    for (const key of keys) {
      const ttl = await redisService.getClient().ttl(key);
      if (ttl === -1) { // Key without expiration
        await redisService.del(key);
        cleanedCount++;
      }
    }
    
    console.log(`Cleaned up ${cleanedCount} expired rate limit keys`);
  } catch (error) {
    console.error('Rate limit cleanup error:', error);
  }
};

module.exports = {
  // Basic rate limiters
  general: generalLimiter,
  auth: authLimiter,
  strictAuth: strictAuthLimiter,
  topup: walletTopupLimiter,
  transfer: walletTransferLimiter,
  payment: paymentLimiter,
  otp: otpLimiter,
  passwordReset: passwordResetLimiter,
  admin: adminLimiter,
  upload: uploadLimiter,
  apiKey: apiKeyLimiter,
  webhook: webhookLimiter,
  burst: burstLimiter,

  // Advanced rate limiters
  createProgressiveLimiter,
  createUserSpecificLimiter,
  createCustomLimiter,

  // Utility functions
  getRateLimitStatus,
  cleanupRateLimitKeys,

  // Middleware helpers
  createKeyGenerator,
  createSkipFunction,
  createRateLimitHandler
};
