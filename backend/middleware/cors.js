const cors = require('cors');

/**
 * CORS Middleware Configuration for Hackspree Wallet Application
 * Provides secure cross-origin resource sharing with environment-based origins
 */

/**
 * Get allowed origins from environment or defaults
 */
const getAllowedOrigins = () => {
  if (process.env.NODE_ENV === 'production') {
    // Production origins - should be explicitly defined
    return process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
      : [
          'https://hackspree.com',
          'https://www.hackspree.com',
          'https://app.hackspree.com'
        ];
  } else {
    // Development origins
    return process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
      : [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://127.0.0.1:3000',
          'http://127.0.0.1:3001',
          'http://localhost:5173', // Vite dev server
          'http://localhost:8080', // Webpack dev server
          'http://localhost:4200'  // Angular dev server
        ];
  }
};

/**
 * CORS configuration options
 */
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = getAllowedOrigins();
    
    // Allow requests with no origin (like mobile apps, Postman, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Check if the origin is in the allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // In development, allow localhost with any port
    if (process.env.NODE_ENV !== 'production') {
      const localhostRegex = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
      if (localhostRegex.test(origin)) {
        return callback(null, true);
      }
    }

    // Log blocked origins for debugging
    console.warn(`🚫 CORS blocked origin: ${origin}`);
    
    const error = new Error(`CORS policy violation: Origin ${origin} is not allowed`);
    error.statusCode = 403;
    return callback(error, false);
  },

  // Allow credentials (cookies, authorization headers, etc.)
  credentials: true,

  // Allowed HTTP methods
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],

  // Allowed headers
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-API-Key',
    'X-Client-Version',
    'X-Request-ID',
    'Cache-Control',
    'Pragma'
  ],

  // Headers that the client can access
  exposedHeaders: [
    'X-Total-Count',
    'X-Current-Page',
    'X-Total-Pages',
    'X-Rate-Limit-Remaining',
    'X-Rate-Limit-Reset',
    'Content-Range'
  ],

  // Preflight cache duration (in seconds)
  maxAge: process.env.NODE_ENV === 'production' ? 86400 : 3600, // 24 hours in prod, 1 hour in dev

  // Handle preflight requests
  optionsSuccessStatus: 204,

  // For legacy browser support
  preflightContinue: false
};

/**
 * Dynamic CORS middleware with request-specific handling
 */
const dynamicCorsMiddleware = (req, res, next) => {
  // Custom logic for specific routes or conditions
  const customCorsOptions = { ...corsOptions };

  // Special handling for webhook endpoints (may need different CORS settings)
  if (req.path.startsWith('/api/webhooks/')) {
    customCorsOptions.origin = '*'; // Webhooks may come from various sources
    customCorsOptions.credentials = false;
  }

  // Special handling for public API endpoints
  if (req.path.startsWith('/api/public/')) {
    customCorsOptions.origin = '*';
    customCorsOptions.credentials = false;
  }

  // Apply CORS with custom options
  cors(customCorsOptions)(req, res, next);
};

/**
 * CORS error handler
 */
const corsErrorHandler = (err, req, res, next) => {
  if (err.message && err.message.includes('CORS')) {
    console.error(`CORS Error: ${err.message} - Origin: ${req.get('Origin')} - IP: ${req.ip}`);
    
    return res.status(403).json({
      success: false,
      message: 'Cross-Origin Request Blocked',
      code: 'CORS_ERROR',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
  next(err);
};

/**
 * Middleware to log CORS requests (development only)
 */
const corsLogger = (req, res, next) => {
  if (process.env.NODE_ENV === 'development' && req.get('Origin')) {
    console.log(`🌍 CORS Request: ${req.method} ${req.path} from ${req.get('Origin')}`);
  }
  next();
};

/**
 * Security headers middleware to complement CORS
 */
const securityHeaders = (req, res, next) => {
  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://js.squareup.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://pci-connect.squareup.com https://connect.squareup.com wss:; frame-src https://js.squareup.com;"
  );

  // X-Frame-Options
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // X-Content-Type-Options
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // X-XSS-Protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  next();
};

/**
 * Pre-flight optimization middleware
 */
const optimizedPreflight = (req, res, next) => {
  if (req.method === 'OPTIONS') {
    // Cache preflight responses to reduce overhead
    res.setHeader('Access-Control-Max-Age', corsOptions.maxAge);
    
    // Log preflight requests in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`✈️ Preflight request: ${req.get('Origin')} -> ${req.get('Access-Control-Request-Method')} ${req.path}`);
    }
  }
  next();
};

/**
 * Export different middleware configurations
 */
module.exports = {
  // Standard CORS middleware
  cors: cors(corsOptions),
  
  // Dynamic CORS middleware
  dynamicCors: dynamicCorsMiddleware,
  
  // CORS with additional security headers
  corsWithSecurity: [
    corsLogger,
    optimizedPreflight,
    cors(corsOptions),
    securityHeaders
  ],
  
  // Error handler for CORS errors
  corsErrorHandler,
  
  // Configuration object for external use
  corsOptions,
  
  // Utility function to check if origin is allowed
  isOriginAllowed: (origin) => {
    const allowedOrigins = getAllowedOrigins();
    return allowedOrigins.includes(origin);
  },
  
  // Get current allowed origins
  getAllowedOrigins
};
