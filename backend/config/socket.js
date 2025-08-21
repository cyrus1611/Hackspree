const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Initialize Socket.IO server with configuration
 */
function initializeSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || ["http://localhost:3000", "http://localhost:3001"],
      methods: ["GET", "POST", "PUT", "DELETE"],
      credentials: true,
      allowedHeaders: ["authorization", "content-type"]
    },
    transports: ['websocket', 'polling'],
    pingInterval: 25000,  // Ping every 25 seconds
    pingTimeout: 60000,   // Timeout after 60 seconds
    maxHttpBufferSize: 1e6, // 1 MB max buffer size
    allowEIO3: true,      // Allow Engine.IO v3 clients
    connectTimeout: 45000 // Connection timeout
  });

  /**
   * Authentication middleware for Socket.IO
   */
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from database
      const user = await User.findById(decoded.userId).select('-password');
      if (!user || !user.isActive) {
        return next(new Error('Invalid or inactive user'));
      }

      // Attach user to socket
      socket.userId = user._id.toString();
      socket.user = user;
      
      console.log(`✅ Socket authenticated for user: ${user.email} (${socket.id})`);
      next();
    } catch (error) {
      console.error('Socket authentication error:', error.message);
      next(new Error('Authentication failed'));
    }
  });

  /**
   * Connection event handler
   */
  io.on('connection', (socket) => {
    console.log(`🔌 User connected: ${socket.user.name} (${socket.id})`);

    // Join user-specific room
    const userRoom = `user_${socket.userId}`;
    socket.join(userRoom);
    console.log(`📡 Socket ${socket.id} joined room: ${userRoom}`);

    // Join wallet-specific room
    socket.on('join_wallet', (walletId) => {
      if (walletId) {
        const walletRoom = `wallet_${walletId}`;
        socket.join(walletRoom);
        console.log(`💳 Socket ${socket.id} joined wallet room: ${walletRoom}`);
        
        socket.emit('wallet_joined', {
          success: true,
          walletId,
          message: 'Successfully joined wallet updates'
        });
      }
    });

    // Leave wallet room
    socket.on('leave_wallet', (walletId) => {
      if (walletId) {
        const walletRoom = `wallet_${walletId}`;
        socket.leave(walletRoom);
        console.log(`💳 Socket ${socket.id} left wallet room: ${walletRoom}`);
        
        socket.emit('wallet_left', {
          success: true,
          walletId,
          message: 'Left wallet updates'
        });
      }
    });

    // Join merchant-specific room
    socket.on('join_merchant', (merchantId) => {
      if (merchantId) {
        const merchantRoom = `merchant_${merchantId}`;
        socket.join(merchantRoom);
        console.log(`🏪 Socket ${socket.id} joined merchant room: ${merchantRoom}`);
        
        socket.emit('merchant_joined', {
          success: true,
          merchantId,
          message: 'Successfully joined merchant updates'
        });
      }
    });

    // Handle real-time transaction updates
    socket.on('transaction_status', (data) => {
      console.log(`💸 Transaction status update from ${socket.id}:`, data);
      
      // Broadcast to relevant users
      if (data.transactionId) {
        io.to(`user_${socket.userId}`).emit('transaction_updated', {
          transactionId: data.transactionId,
          status: data.status,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Handle wallet balance requests
    socket.on('get_wallet_balance', async (walletId) => {
      try {
        // You would implement actual balance fetching here
        socket.emit('wallet_balance', {
          success: true,
          walletId,
          balance: 0, // Replace with actual balance
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        socket.emit('wallet_balance_error', {
          success: false,
          error: error.message
        });
      }
    });

    // Handle payment notifications
    socket.on('payment_notification', (data) => {
      console.log(`💰 Payment notification from ${socket.id}:`, data);
      
      // Notify relevant parties
      if (data.merchantId) {
        io.to(`merchant_${data.merchantId}`).emit('new_payment', {
          amount: data.amount,
          from: socket.user.name,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Handle typing indicators for chat features
    socket.on('typing', (data) => {
      socket.broadcast.to(data.room).emit('user_typing', {
        userId: socket.userId,
        userName: socket.user.name,
        typing: true
      });
    });

    socket.on('stop_typing', (data) => {
      socket.broadcast.to(data.room).emit('user_typing', {
        userId: socket.userId,
        userName: socket.user.name,
        typing: false
      });
    });

    // Handle user status updates
    socket.on('update_status', (status) => {
      socket.broadcast.emit('user_status_changed', {
        userId: socket.userId,
        userName: socket.user.name,
        status,
        timestamp: new Date().toISOString()
      });
    });

    // Handle admin broadcasts
    socket.on('admin_broadcast', (data) => {
      if (socket.user.role === 'admin') {
        io.emit('admin_notification', {
          message: data.message,
          type: data.type || 'info',
          timestamp: new Date().toISOString()
        });
        console.log(`📢 Admin broadcast from ${socket.user.name}: ${data.message}`);
      }
    });

    // Handle heartbeat for connection monitoring
    socket.on('heartbeat', () => {
      socket.emit('heartbeat_ack', {
        timestamp: new Date().toISOString()
      });
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`❌ Socket error for user ${socket.userId}:`, error);
      socket.emit('error_response', {
        message: 'An error occurred',
        timestamp: new Date().toISOString()
      });
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      console.log(`❌ User disconnected: ${socket.user.name} (${socket.id}) - Reason: ${reason}`);
      
      // Notify other users if needed
      socket.broadcast.emit('user_disconnected', {
        userId: socket.userId,
        userName: socket.user.name,
        timestamp: new Date().toISOString()
      });
      
      // Clean up any user-specific data
      // Remove from active users list, etc.
    });

    // Handle force disconnect (admin feature)
    socket.on('force_disconnect', (data) => {
      if (socket.user.role === 'admin' && data.targetUserId) {
        const targetSockets = io.sockets.sockets;
        targetSockets.forEach((targetSocket) => {
          if (targetSocket.userId === data.targetUserId) {
            targetSocket.disconnect(true);
            console.log(`🔨 Admin ${socket.user.name} force-disconnected user ${data.targetUserId}`);
          }
        });
      }
    });

    // Send welcome message
    socket.emit('welcome', {
      message: `Welcome to Hackspree, ${socket.user.name}!`,
      userId: socket.userId,
      timestamp: new Date().toISOString()
    });
  });

  /**
   * Handle connection errors
   */
  io.on('connect_error', (error) => {
    console.error('❌ Socket.IO connection error:', error);
  });

  /**
   * Helper functions for broadcasting events
   */
  io.broadcastToUser = (userId, event, data) => {
    io.to(`user_${userId}`).emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
  };

  io.broadcastToWallet = (walletId, event, data) => {
    io.to(`wallet_${walletId}`).emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
  };

  io.broadcastToMerchant = (merchantId, event, data) => {
    io.to(`merchant_${merchantId}`).emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
  };

  io.broadcastToAll = (event, data) => {
    io.emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
  };

  // Monitor connection stats
  setInterval(() => {
    const connectedUsers = io.sockets.sockets.size;
    console.log(`📊 Connected users: ${connectedUsers}`);
    
    // Broadcast connection stats to admins
    io.emit('connection_stats', {
      connectedUsers,
      timestamp: new Date().toISOString()
    });
  }, 60000); // Every minute

  console.log('🚀 Socket.IO server initialized successfully');
  return io;
}

/**
 * Socket event emitters for use throughout the application
 */
const socketEmitters = {
  // Wallet-related events
  emitWalletUpdate: (io, userId, walletData) => {
    io.to(`user_${userId}`).emit('wallet_updated', {
      ...walletData,
      timestamp: new Date().toISOString()
    });
  },

  emitBalanceUpdate: (io, userId, balanceData) => {
    io.to(`user_${userId}`).emit('balance_updated', {
      ...balanceData,
      timestamp: new Date().toISOString()
    });
  },

  // Transaction-related events
  emitTransactionComplete: (io, userId, transactionData) => {
    io.to(`user_${userId}`).emit('transaction_completed', {
      ...transactionData,
      timestamp: new Date().toISOString()
    });
  },

  emitTransactionFailed: (io, userId, errorData) => {
    io.to(`user_${userId}`).emit('transaction_failed', {
      ...errorData,
      timestamp: new Date().toISOString()
    });
  },

  // Payment-related events
  emitPaymentReceived: (io, merchantId, paymentData) => {
    io.to(`merchant_${merchantId}`).emit('payment_received', {
      ...paymentData,
      timestamp: new Date().toISOString()
    });
  },

  // Event-related notifications
  emitEventUpdate: (io, eventData) => {
    io.emit('event_updated', {
      ...eventData,
      timestamp: new Date().toISOString()
    });
  },

  // System notifications
  emitSystemNotification: (io, notification) => {
    io.emit('system_notification', {
      ...notification,
      timestamp: new Date().toISOString()
    });
  },

  // Admin notifications
  emitAdminAlert: (io, alertData) => {
    io.emit('admin_alert', {
      ...alertData,
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  initializeSocket,
  socketEmitters
};
