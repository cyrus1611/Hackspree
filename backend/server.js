const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
require('dotenv').config();

// Import utilities
const { logger, requestLogger, errorLogger } = require('./utils/logger');
const { router: apiRoutes, API_VERSION, API_INFO } = require('./routes/index');

// Initialize Express app
const app = express();
const server = createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Trust proxy (for deployment behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3001', // For development
      'https://collex.edu', // Production domain
      /\.collex\.edu$/, // Subdomains
    ];
    
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return origin === allowed;
      }
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      logger.logSecurity('cors_blocked', { origin, ip: 'unknown' });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-ID'],
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Body parser middleware with size limits
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf, encoding) => {
    // Store raw body for webhook verification
    if (req.originalUrl?.includes('/webhooks/')) {
      req.rawBody = buf;
    }
  }
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb' 
}));

// Serve static files (for uploads, QR codes, etc.)
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '1d',
  etag: true
}));

// Request logging middleware
app.use(requestLogger);

// Add API version and server info to all responses
app.use((req, res, next) => {
  res.setHeader('API-Version', API_VERSION);
  res.setHeader('X-Powered-By', 'Collex-API/1.0.0');
  res.setHeader('X-Server-Time', new Date().toISOString());
  
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  
  next();
});

// Database connection with retry logic
const connectWithRetry = async () => {
  const maxRetries = 5;
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        bufferCommands: false,
        bufferMaxEntries: 0
      });

      logger.info('✅ MongoDB Connected', {
        host: mongoose.connection.host,
        database: mongoose.connection.name,
        state: mongoose.connection.readyState,
        retry: retries
      });
      break;

    } catch (error) {
      retries++;
      logger.error(`❌ MongoDB connection attempt ${retries} failed`, {
        error: error.message,
        retries,
        maxRetries
      });

      if (retries >= maxRetries) {
        logger.error('💥 Maximum MongoDB connection retries exceeded');
        process.exit(1);
      }

      // Wait before retrying (exponential backoff)
      const delay = Math.pow(2, retries) * 1000;
      logger.info(`⏳ Retrying MongoDB connection in ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Initialize database connection
connectWithRetry();

// Database connection event handlers
mongoose.connection.on('error', (err) => {
  logger.error('MongoDB connection error', { error: err.message });
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected. Attempting to reconnect...');
  connectWithRetry();
});

mongoose.connection.on('reconnected', () => {
  logger.info('✅ MongoDB reconnected');
});

// Socket.io connection handling
io.on('connection', (socket) => {
  logger.debug('Socket connection established', { 
    socketId: socket.id,
    ip: socket.handshake.address 
  });

  // User authentication for socket
  socket.on('authenticate', async (data) => {
    try {
      const jwt = require('jsonwebtoken');
      const User = require('./models/User');
      
      if (data.token) {
        const decoded = jwt.verify(data.token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');
        
        if (user && user.isActive) {
          socket.userId = user._id.toString();
          socket.userRole = user.role;
          socket.join(`user_${socket.userId}`);
          
          logger.debug('Socket authenticated', { 
            userId: socket.userId,
            role: socket.userRole,
            socketId: socket.id
          });
          
          socket.emit('authenticated', { 
            status: 'success',
            userId: socket.userId,
            role: socket.userRole
          });
        } else {
          socket.emit('authentication_error', { 
            error: 'User not found or inactive' 
          });
        }
      }
    } catch (error) {
      logger.warn('Socket authentication failed', { 
        error: error.message,
        socketId: socket.id 
      });
      socket.emit('authentication_error', { error: 'Invalid token' });
    }
  });

  // Join wallet room for real-time balance updates
  socket.on('join_wallet', (userId) => {
    if (socket.userId && socket.userId === userId) {
      socket.join(`wallet_${userId}`);
      logger.debug('User joined wallet room', { userId, socketId: socket.id });
    }
  });

  // Leave wallet room
  socket.on('leave_wallet', (userId) => {
    if (socket.userId && socket.userId === userId) {
      socket.leave(`wallet_${userId}`);
      logger.debug('User left wallet room', { userId, socketId: socket.id });
    }
  });

  // Join merchant room for payment notifications
  socket.on('join_merchant', (merchantId) => {
    if (socket.userId) {
      socket.join(`merchant_${merchantId}`);
      logger.debug('User joined merchant room', { 
        userId: socket.userId, 
        merchantId, 
        socketId: socket.id 
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', (reason) => {
    logger.debug('Socket disconnected', { 
      socketId: socket.id,
      userId: socket.userId,
      reason 
    });
  });

  // Handle connection errors
  socket.on('error', (error) => {
    logger.error('Socket error', { 
      error: error.message,
      socketId: socket.id,
      userId: socket.userId
    });
  });
});

// Make io accessible in routes
app.set('io', io);

// Root redirect to API docs
app.get('/', (req, res) => {
  res.redirect('/api');
});

// Health check endpoint (before API routes for faster response)
app.get('/health', (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: API_INFO.version,
    environment: process.env.NODE_ENV || 'development'
  };
  res.json(health);
});

// Mount API routes
app.use('/api', apiRoutes);

// Serve API documentation as HTML (optional)
app.get('/docs', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Collex API Documentation</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #1D4ED8; margin-bottom: 10px; }
            .subtitle { color: #6B7280; margin-bottom: 30px; }
            .button { display: inline-block; background: #1D4ED8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-right: 10px; margin-bottom: 10px; }
            .button:hover { background: #1E40AF; }
            .info { background: #EEF2FF; padding: 20px; border-radius: 6px; margin: 20px 0; }
            .status { padding: 10px 15px; background: #10B981; color: white; border-radius: 4px; display: inline-block; margin: 10px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Collex API Documentation</h1>
            <p class="subtitle">Digital Campus Wallet API v${API_INFO.version}</p>
            
            <div class="status">🚀 API Status: Active</div>
            
            <div class="info">
                <h3>Quick Links</h3>
                <a href="/api" class="button">API Overview</a>
                <a href="/api/docs" class="button">JSON Documentation</a>
                <a href="/api/health" class="button">Health Check</a>
                <a href="/api/status" class="button">System Status</a>
            </div>
            
            <h3>Getting Started</h3>
            <p>The Collex API provides endpoints for wallet management, payments, merchant operations, and event registration.</p>
            
            <h4>Authentication</h4>
            <p>Most endpoints require JWT authentication. Include the token in the Authorization header:</p>
            <pre style="background: #f8f9fa; padding: 15px; border-radius: 4px; overflow-x: auto;">Authorization: Bearer YOUR_JWT_TOKEN</pre>
            
            <h4>Base URL</h4>
            <pre style="background: #f8f9fa; padding: 15px; border-radius: 4px;">${req.protocol}://${req.get('host')}/api</pre>
            
            <h4>Support</h4>
            <p>For support, contact: <strong>${API_INFO.supportEmail}</strong></p>
        </div>
    </body>
    </html>
  `);
});

// Error logging middleware
app.use(errorLogger);

// Global error handling middleware
app.use((err, req, res, next) => {
  // Log error with context
  logger.error('Unhandled application error', {
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack
    },
    request: {
      method: req.method,
      url: req.originalUrl,
      headers: req.headers,
      body: req.method !== 'GET' ? req.body : undefined,
      params: req.params,
      query: req.query,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.userId,
      requestId: req.requestId
    }
  });

  // Handle specific error types
  if (err.name === 'ValidationError') {
    const validationErrors = Object.values(err.errors || {}).map(e => ({
      field: e.path,
      message: e.message,
      value: e.value
    }));
    
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Request validation failed',
      details: validationErrors,
      requestId: req.requestId
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      error: 'Invalid ID',
      message: 'The provided ID is not valid',
      requestId: req.requestId
    });
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    return res.status(409).json({
      error: 'Duplicate Entry',
      message: `A record with this ${field} already exists`,
      field,
      requestId: req.requestId
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid Token',
      message: 'The provided authentication token is invalid',
      requestId: req.requestId
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token Expired',
      message: 'The authentication token has expired',
      requestId: req.requestId
    });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Payload Too Large',
      message: 'Request body exceeds maximum allowed size',
      requestId: req.requestId
    });
  }

  // CORS errors
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({
      error: 'CORS Error',
      message: 'Cross-origin request blocked',
      requestId: req.requestId
    });
  }

  // Default error response
  const statusCode = err.statusCode || err.status || 500;
  const errorResponse = {
    error: err.name || 'Internal Server Error',
    message: statusCode === 500 ? 'An unexpected error occurred' : err.message,
    requestId: req.requestId,
    timestamp: new Date().toISOString()
  };

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
    errorResponse.details = err;
  }

  res.status(statusCode).json(errorResponse);
});

// 404 handler for non-API routes
app.use('*', (req, res) => {
  logger.warn('Route not found', {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json({
    error: 'Not Found',
    message: `The requested resource ${req.method} ${req.originalUrl} was not found`,
    suggestion: 'Check the API documentation at /api/docs',
    requestId: req.requestId,
    timestamp: new Date().toISOString()
  });
});

// Server configuration
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Start server
server.listen(PORT, HOST, () => {
  logger.info('🚀 Collex Backend Server Started', {
    port: PORT,
    host: HOST,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    apiVersion: API_VERSION,
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    features: [
      'JWT Authentication',
      'Wallet Management',
      'QR Payments',
      'Real-time Notifications',
      'Admin Dashboard',
      'Event Management'
    ]
  });

  console.log('\n🎉 Collex Server Ready!');
  console.log(`📊 API Base URL: http://localhost:${PORT}/api`);
  console.log(`📚 Documentation: http://localhost:${PORT}/docs`);
  console.log(`💚 Health Check: http://localhost:${PORT}/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
});

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  server.close((err) => {
    if (err) {
      logger.error('Error during server close', { error: err.message });
      process.exit(1);
    }

    logger.info('HTTP server closed');

    // Close database connection
    mongoose.connection.close(() => {
      logger.info('MongoDB connection closed');

      // Close socket.io
      io.close(() => {
        logger.info('Socket.io closed');
        logger.info('✅ Graceful shutdown completed');
        process.exit(0);
      });
    });
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Force shutdown - timeout exceeded');
    process.exit(1);
  }, 30000);
};

// Handle process termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { 
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack
    }
  });
  
  // Graceful shutdown on uncaught exception
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason?.toString() || reason,
    promise: promise?.toString() || 'Unknown promise'
  });
  
  // Graceful shutdown on unhandled rejection
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Export app and server for testing
module.exports = { app, server, io };
