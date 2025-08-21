const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const router = express.Router();

/**
 * Import all route modules
 */
const authRoutes = require('./auth');
const userRoutes = require('./users');
const walletRoutes = require('./wallet');
const transactionRoutes = require('./transactions');
const merchantRoutes = require('./merchants');
const eventRoutes = require('./events');
const analyticsRoutes = require('./analytics');
const clubRoutes = require('./clubs');
const adminRoutes = require('./admin');
const webhookRoutes = require('./webhooks');
const publicRoutes = require('./public');

/**
 * Import middleware
 */
const authMiddleware = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const { corsWithSecurity } = require('../middleware/cors');
const { requestLogger } = require('../middleware/logger');

/**
 * API Configuration and Metadata
 */
const API_CONFIG = {
  name: 'Hackspree Wallet API',
  version: process.env.API_VERSION || '1.0.0',
  description: 'Comprehensive wallet and payment management system',
  author: 'Hackspree Team',
  documentation: process.env.API_DOCS_URL || 'https://docs.hackspree.com',
  support: 'support@hackspree.com',
  status: 'production',
  features: {
    authentication: true,
    walletManagement: true,
    payments: true,
    merchants: true,
    events: true,
    clubs: true,
    analytics: true,
    squareIntegration: true,
    realTimeNotifications: true
  },
  endpoints: {
    base: process.env.API_BASE_URL || 'https://api.hackspree.com',
    websocket: process.env.WS_URL || 'wss://ws.hackspree.com'
  }
};

/**
 * Security Headers and CORS
 */
router.use(corsWithSecurity);
router.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "https://js.squareup.com"],
      connectSrc: ["'self'", "https://pci-connect.squareup.com", "wss:"],
      imgSrc: ["'self'", "data:", "https:"],
      frameSrc: ["https://js.squareup.com"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

/**
 * Request Logging
 */
router.use(requestLogger);

/**
 * Rate Limiting for API routes
 */
router.use('/api', rateLimiter.general);

/**
 * API Root Information Endpoint
 */
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to Hackspree Wallet API',
    data: {
      api: {
        name: API_CONFIG.name,
        version: API_CONFIG.version,
        description: API_CONFIG.description,
        documentation: API_CONFIG.documentation,
        support: API_CONFIG.support,
        status: API_CONFIG.status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
      },
      endpoints: {
        authentication: '/api/auth',
        users: '/api/users',
        wallets: '/api/wallet',
        transactions: '/api/transactions',
        merchants: '/api/merchants',
        events: '/api/events',
        clubs: '/api/clubs',
        analytics: '/api/analytics',
        webhooks: '/api/webhooks',
        health: '/api/health',
        docs: '/api/docs'
      },
      features: API_CONFIG.features,
      links: {
        documentation: API_CONFIG.documentation,
        support: `mailto:${API_CONFIG.support}`,
        websocket: API_CONFIG.endpoints.websocket
      }
    }
  });
});

/**
 * API Health Check Endpoint
 */
router.get('/api/health', async (req, res) => {
  const healthCheck = {
    success: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    status: 'healthy',
    version: API_CONFIG.version,
    environment: process.env.NODE_ENV || 'development',
    services: {
      api: 'operational',
      database: 'unknown',
      redis: 'unknown',
      square: 'unknown',
      websocket: 'unknown'
    },
    system: {
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB'
      },
      cpu: {
        usage: process.cpuUsage(),
        loadAverage: process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0]
      },
      nodeVersion: process.version,
      platform: process.platform
    }
  };

  // Check database connection
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      healthCheck.services.database = 'operational';
    } else {
      healthCheck.services.database = 'disconnected';
      healthCheck.status = 'degraded';
    }
  } catch (error) {
    healthCheck.services.database = 'error';
    healthCheck.status = 'unhealthy';
  }

  // Check Redis connection
  try {
    const { redisService } = require('../config/redis');
    if (redisService && redisService.isConnected()) {
      healthCheck.services.redis = 'operational';
    } else {
      healthCheck.services.redis = 'disconnected';
    }
  } catch (error) {
    healthCheck.services.redis = 'error';
  }

  // Check Square API status
  try {
    const { squareClient } = require('../config/square');
    if (squareClient) {
      healthCheck.services.square = 'operational';
    }
  } catch (error) {
    healthCheck.services.square = 'error';
  }

  // Set overall status
  const unhealthyServices = Object.values(healthCheck.services).filter(status => 
    status === 'error' || status === 'disconnected'
  );

  if (unhealthyServices.length > 0) {
    healthCheck.status = unhealthyServices.length > 2 ? 'unhealthy' : 'degraded';
    healthCheck.success = healthCheck.status !== 'unhealthy';
  }

  const statusCode = healthCheck.status === 'healthy' ? 200 : 
                    healthCheck.status === 'degraded' ? 200 : 503;

  res.status(statusCode).json(healthCheck);
});

/**
 * API Status Endpoint (Detailed monitoring)
 */
router.get('/api/status', authMiddleware, async (req, res) => {
  // Only allow admin users to access detailed status
  if (req.user && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }

  const status = {
    success: true,
    timestamp: new Date().toISOString(),
    api: API_CONFIG,
    runtime: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      version: process.version,
      platform: process.platform,
      arch: process.arch
    },
    statistics: {
      totalRequests: 0, // This would come from your analytics
      activeUsers: 0,   // This would come from your user tracking
      totalTransactions: 0, // This would come from your transaction analytics
      systemLoad: process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0]
    },
    configuration: {
      nodeEnv: process.env.NODE_ENV,
      port: process.env.PORT,
      logLevel: process.env.LOG_LEVEL,
      rateLimiting: true,
      cors: true,
      helmet: true,
      compression: true
    }
  };

  res.json(status);
});

/**
 * API Documentation Endpoint
 */
router.get('/api/docs', (req, res) => {
  res.json({
    success: true,
    message: 'API Documentation',
    data: {
      openapi: '3.0.3',
      info: {
        title: API_CONFIG.name,
        version: API_CONFIG.version,
        description: API_CONFIG.description,
        contact: {
          email: API_CONFIG.support
        },
        license: {
          name: 'MIT',
          url: 'https://opensource.org/licenses/MIT'
        }
      },
      externalDocs: {
        description: 'Complete API Documentation',
        url: API_CONFIG.documentation
      },
      servers: [
        {
          url: API_CONFIG.endpoints.base,
          description: 'Production server'
        },
        {
          url: 'http://localhost:5000/api',
          description: 'Development server'
        }
      ],
      paths: {
        '/auth': {
          description: 'Authentication endpoints for login, registration, and token management'
        },
        '/users': {
          description: 'User management endpoints for profile and account operations'
        },
        '/wallet': {
          description: 'Wallet management endpoints for balance, top-up, and transfers'
        },
        '/transactions': {
          description: 'Transaction endpoints for history, details, and management'
        },
        '/merchants': {
          description: 'Merchant endpoints for business account management'
        },
        '/events': {
          description: 'Event management endpoints for creation and registration'
        },
        '/clubs': {
          description: 'Club management endpoints for community features'
        },
        '/analytics': {
          description: 'Analytics endpoints for reporting and insights'
        }
      }
    }
  });
});

/**
 * API Metrics Endpoint (for monitoring tools)
 * Fixed: Removed invalid Prometheus-style comments that caused TypeScript errors
 */
router.get('/api/metrics', (req, res) => {
  const metrics = {
    hackspree_api_requests_total: 0,
    hackspree_api_request_duration_seconds: 0,
    hackspree_active_connections: 0,
    hackspree_memory_usage_bytes: process.memoryUsage().heapUsed,
    hackspree_uptime_seconds: process.uptime()
  };

  // Return as plain text for Prometheus scraping
  const metricsText = [
    '# HELP hackspree_api_requests_total Total number of API requests',
    '# TYPE hackspree_api_requests_total counter',
    `hackspree_api_requests_total ${metrics.hackspree_api_requests_total}`,
    '',
    '# HELP hackspree_api_request_duration_seconds Duration of API requests in seconds',
    '# TYPE hackspree_api_request_duration_seconds histogram',
    `hackspree_api_request_duration_seconds ${metrics.hackspree_api_request_duration_seconds}`,
    '',
    '# HELP hackspree_active_connections Currently active connections',
    '# TYPE hackspree_active_connections gauge',
    `hackspree_active_connections ${metrics.hackspree_active_connections}`,
    '',
    '# HELP hackspree_memory_usage_bytes Memory usage in bytes',
    '# TYPE hackspree_memory_usage_bytes gauge',
    `hackspree_memory_usage_bytes ${metrics.hackspree_memory_usage_bytes}`,
    '',
    '# HELP hackspree_uptime_seconds Process uptime in seconds',
    '# TYPE hackspree_uptime_seconds counter',
    `hackspree_uptime_seconds ${metrics.hackspree_uptime_seconds}`
  ].join('\n');

  res.set('Content-Type', 'text/plain');
  res.send(metricsText);
});

/**
 * Mount all API routes with versioning
 */
const API_PREFIX = '/api';

// Public routes (no authentication required)
router.use(`${API_PREFIX}/public`, publicRoutes);

// Authentication routes
router.use(`${API_PREFIX}/auth`, authRoutes);

// Protected routes (authentication required)
router.use(`${API_PREFIX}/users`, authMiddleware, userRoutes);
router.use(`${API_PREFIX}/wallet`, authMiddleware, walletRoutes);
router.use(`${API_PREFIX}/transactions`, authMiddleware, transactionRoutes);
router.use(`${API_PREFIX}/merchants`, authMiddleware, merchantRoutes);
router.use(`${API_PREFIX}/events`, authMiddleware, eventRoutes);
router.use(`${API_PREFIX}/clubs`, authMiddleware, clubRoutes);
router.use(`${API_PREFIX}/analytics`, authMiddleware, analyticsRoutes);

// Admin routes (admin authentication required)
router.use(`${API_PREFIX}/admin`, authMiddleware, (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
}, adminRoutes);

// Webhook routes (special authentication)
router.use(`${API_PREFIX}/webhooks`, webhookRoutes);

/**
 * API Version Information
 */
router.get('/api/version', (req, res) => {
  res.json({
    success: true,
    data: {
      version: API_CONFIG.version,
      buildDate: process.env.BUILD_DATE || new Date().toISOString(),
      gitCommit: process.env.GIT_COMMIT || 'unknown',
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development'
    }
  });
});

/**
 * Rate Limit Information Endpoint
 */
router.get('/api/rate-limits', (req, res) => {
  res.json({
    success: true,
    data: {
      limits: {
        general: {
          windowMs: 15 * 60 * 1000,
          max: 100,
          description: 'General API requests'
        },
        auth: {
          windowMs: 15 * 60 * 1000,
          max: 10,
          description: 'Authentication requests'
        },
        topup: {
          windowMs: 15 * 60 * 1000,
          max: 5,
          description: 'Wallet top-up requests'
        },
        transfer: {
          windowMs: 5 * 60 * 1000,
          max: 10,
          description: 'Money transfer requests'
        }
      },
      note: 'Rate limits are per IP address. Authenticated users may have different limits.'
    }
  });
});

/**
 * Catch-all for undefined API routes
 */
router.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    error: {
      code: 'ENDPOINT_NOT_FOUND',
      path: req.path,
      method: req.method,
      suggestion: 'Please check the API documentation for available endpoints'
    },
    links: {
      documentation: API_CONFIG.documentation,
      availableEndpoints: '/api/docs'
    }
  });
});

/**
 * Root catch-all for non-API routes
 */
router.all('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    error: {
      code: 'ROUTE_NOT_FOUND',
      path: req.path,
      method: req.method
    },
    links: {
      api: '/api',
      documentation: API_CONFIG.documentation
    }
  });
});

/**
 * Global Error Handler
 */
router.use((error, req, res, next) => {
  console.error('Unhandled route error:', error);
  
  res.status(error.statusCode || 500).json({
    success: false,
    message: 'Internal server error',
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    },
    requestId: req.id || 'unknown',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
