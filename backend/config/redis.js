const { createClient } = require('redis');

/**
 * Redis Configuration Class
 */
class RedisConfig {
  constructor() {
    this.client = null;
    this.subscriber = null;
    this.publisher = null;
    this.connected = false;
  }

  /**
   * Initialize Redis connections
   */
  async initialize() {
    try {
      const redisOptions = this.getRedisOptions();

      // Main Redis client
      this.client = createClient(redisOptions);
      
      // Subscriber client for pub/sub
      this.subscriber = createClient(redisOptions);
      
      // Publisher client for pub/sub
      this.publisher = createClient(redisOptions);

      // Error handling
      this.setupErrorHandling();

      // Connect all clients
      await Promise.all([
        this.client.connect(),
        this.subscriber.connect(),
        this.publisher.connect()
      ]);

      this.connected = true;
      console.log('✅ Redis clients connected successfully');

      // Setup health monitoring
      this.setupHealthMonitoring();

      return {
        client: this.client,
        subscriber: this.subscriber,
        publisher: this.publisher
      };

    } catch (error) {
      console.error('❌ Redis connection failed:', error);
      throw error;
    }
  }

  /**
   * Get Redis configuration options
   */
  getRedisOptions() {
    const baseOptions = {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      password: process.env.REDIS_PASSWORD || undefined,
      database: parseInt(process.env.REDIS_DB) || 0,
      
      // Connection options
      connectTimeout: 10000,
      lazyConnect: false,
      
      // Retry strategy
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      
      // Connection pool
      family: 4, // IPv4
      keepAlive: true,
      
      // Performance options
      enableOfflineQueue: false,
      
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            return new Error('Too many retry attempts');
          }
          return Math.min(retries * 50, 1000);
        },
        connectTimeout: 10000,
        commandTimeout: 5000
      }
    };

    // SSL/TLS configuration for production
    if (process.env.REDIS_TLS === 'true') {
      baseOptions.tls = {
        rejectUnauthorized: false, // Set to true in production with valid certificates
        requestCert: true
      };
    }

    // Cluster configuration
    if (process.env.REDIS_CLUSTER === 'true') {
      const clusterNodes = process.env.REDIS_CLUSTER_NODES 
        ? process.env.REDIS_CLUSTER_NODES.split(',')
        : ['localhost:6379'];
      
      return {
        ...baseOptions,
        cluster: {
          nodes: clusterNodes,
          options: {
            redisOptions: baseOptions
          }
        }
      };
    }

    return baseOptions;
  }

  /**
   * Setup error handling for all clients
   */
  setupErrorHandling() {
    const clients = [
      { name: 'main', client: this.client },
      { name: 'subscriber', client: this.subscriber },
      { name: 'publisher', client: this.publisher }
    ];

    clients.forEach(({ name, client }) => {
      client.on('error', (error) => {
        console.error(`❌ Redis ${name} client error:`, error);
        this.connected = false;
      });

      client.on('connect', () => {
        console.log(`🔌 Redis ${name} client connected`);
      });

      client.on('ready', () => {
        console.log(`✅ Redis ${name} client ready`);
        this.connected = true;
      });

      client.on('end', () => {
        console.log(`⚠️ Redis ${name} client connection ended`);
        this.connected = false;
      });

      client.on('reconnecting', () => {
        console.log(`🔄 Redis ${name} client reconnecting...`);
      });
    });
  }

  /**
   * Setup health monitoring
   */
  setupHealthMonitoring() {
    // Ping Redis every 30 seconds
    setInterval(async () => {
      try {
        await this.client.ping();
        if (!this.connected) {
          console.log('✅ Redis connection restored');
          this.connected = true;
        }
      } catch (error) {
        if (this.connected) {
          console.error('❌ Redis health check failed:', error.message);
          this.connected = false;
        }
      }
    }, 30000);
  }

  /**
   * Get Redis client instance
   */
  getClient() {
    if (!this.client || !this.connected) {
      throw new Error('Redis client not connected');
    }
    return this.client;
  }

  /**
   * Get subscriber client
   */
  getSubscriber() {
    if (!this.subscriber || !this.connected) {
      throw new Error('Redis subscriber not connected');
    }
    return this.subscriber;
  }

  /**
   * Get publisher client
   */
  getPublisher() {
    if (!this.publisher || !this.connected) {
      throw new Error('Redis publisher not connected');
    }
    return this.publisher;
  }

  /**
   * Check if Redis is connected
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Gracefully disconnect Redis clients
   */
  async disconnect() {
    try {
      if (this.client) await this.client.quit();
      if (this.subscriber) await this.subscriber.quit();
      if (this.publisher) await this.publisher.quit();
      
      this.connected = false;
      console.log('✅ Redis clients disconnected gracefully');
    } catch (error) {
      console.error('❌ Error disconnecting Redis clients:', error);
    }
  }
}

/**
 * Redis Service Class with common operations
 */
class RedisService {
  constructor(redisConfig) {
    this.redis = redisConfig;
  }

  /**
   * Cache operations
   */
  async set(key, value, expireInSeconds = 3600) {
    try {
      const client = this.redis.getClient();
      const serializedValue = JSON.stringify(value);
      
      if (expireInSeconds) {
        await client.setEx(key, expireInSeconds, serializedValue);
      } else {
        await client.set(key, serializedValue);
      }
      
      return true;
    } catch (error) {
      console.error('Redis SET error:', error);
      return false;
    }
  }

  async get(key) {
    try {
      const client = this.redis.getClient();
      const value = await client.get(key);
      
      if (value === null) return null;
      
      try {
        return JSON.parse(value);
      } catch {
        return value; // Return as string if not JSON
      }
    } catch (error) {
      console.error('Redis GET error:', error);
      return null;
    }
  }

  async del(key) {
    try {
      const client = this.redis.getClient();
      return await client.del(key);
    } catch (error) {
      console.error('Redis DEL error:', error);
      return false;
    }
  }

  async exists(key) {
    try {
      const client = this.redis.getClient();
      return await client.exists(key);
    } catch (error) {
      console.error('Redis EXISTS error:', error);
      return false;
    }
  }

  async expire(key, seconds) {
    try {
      const client = this.redis.getClient();
      return await client.expire(key, seconds);
    } catch (error) {
      console.error('Redis EXPIRE error:', error);
      return false;
    }
  }

  /**
   * Hash operations
   */
  async hSet(key, field, value) {
    try {
      const client = this.redis.getClient();
      return await client.hSet(key, field, JSON.stringify(value));
    } catch (error) {
      console.error('Redis HSET error:', error);
      return false;
    }
  }

  async hGet(key, field) {
    try {
      const client = this.redis.getClient();
      const value = await client.hGet(key, field);
      
      if (value === null) return null;
      
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      console.error('Redis HGET error:', error);
      return null;
    }
  }

  async hGetAll(key) {
    try {
      const client = this.redis.getClient();
      const hash = await client.hGetAll(key);
      
      const result = {};
      for (const [field, value] of Object.entries(hash)) {
        try {
          result[field] = JSON.parse(value);
        } catch {
          result[field] = value;
        }
      }
      
      return result;
    } catch (error) {
      console.error('Redis HGETALL error:', error);
      return {};
    }
  }

  async hDel(key, field) {
    try {
      const client = this.redis.getClient();
      return await client.hDel(key, field);
    } catch (error) {
      console.error('Redis HDEL error:', error);
      return false;
    }
  }

  /**
   * List operations
   */
  async lPush(key, ...values) {
    try {
      const client = this.redis.getClient();
      const serializedValues = values.map(v => JSON.stringify(v));
      return await client.lPush(key, serializedValues);
    } catch (error) {
      console.error('Redis LPUSH error:', error);
      return false;
    }
  }

  async lPop(key) {
    try {
      const client = this.redis.getClient();
      const value = await client.lPop(key);
      
      if (value === null) return null;
      
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      console.error('Redis LPOP error:', error);
      return null;
    }
  }

  async lRange(key, start = 0, stop = -1) {
    try {
      const client = this.redis.getClient();
      const values = await client.lRange(key, start, stop);
      
      return values.map(value => {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      });
    } catch (error) {
      console.error('Redis LRANGE error:', error);
      return [];
    }
  }

  /**
   * Set operations
   */
  async sAdd(key, ...members) {
    try {
      const client = this.redis.getClient();
      const serializedMembers = members.map(m => JSON.stringify(m));
      return await client.sAdd(key, serializedMembers);
    } catch (error) {
      console.error('Redis SADD error:', error);
      return false;
    }
  }

  async sMembers(key) {
    try {
      const client = this.redis.getClient();
      const members = await client.sMembers(key);
      
      return members.map(member => {
        try {
          return JSON.parse(member);
        } catch {
          return member;
        }
      });
    } catch (error) {
      console.error('Redis SMEMBERS error:', error);
      return [];
    }
  }

  async sIsMember(key, member) {
    try {
      const client = this.redis.getClient();
      return await client.sIsMember(key, JSON.stringify(member));
    } catch (error) {
      console.error('Redis SISMEMBER error:', error);
      return false;
    }
  }

  /**
   * Pub/Sub operations
   */
  async publish(channel, message) {
    try {
      const publisher = this.redis.getPublisher();
      return await publisher.publish(channel, JSON.stringify(message));
    } catch (error) {
      console.error('Redis PUBLISH error:', error);
      return false;
    }
  }

  async subscribe(channel, callback) {
    try {
      const subscriber = this.redis.getSubscriber();
      
      await subscriber.subscribe(channel, (message) => {
        try {
          const parsedMessage = JSON.parse(message);
          callback(parsedMessage);
        } catch {
          callback(message);
        }
      });
      
      return true;
    } catch (error) {
      console.error('Redis SUBSCRIBE error:', error);
      return false;
    }
  }

  /**
   * Session management
   */
  async setSession(sessionId, sessionData, expireInSeconds = 86400) {
    return await this.set(`session:${sessionId}`, sessionData, expireInSeconds);
  }

  async getSession(sessionId) {
    return await this.get(`session:${sessionId}`);
  }

  async deleteSession(sessionId) {
    return await this.del(`session:${sessionId}`);
  }

  /**
   * Rate limiting
   */
  async isRateLimited(key, limit, windowInSeconds) {
    try {
      const client = this.redis.getClient();
      const current = await client.incr(key);
      
      if (current === 1) {
        await client.expire(key, windowInSeconds);
      }
      
      return current > limit;
    } catch (error) {
      console.error('Redis rate limiting error:', error);
      return false;
    }
  }

  /**
   * Lock mechanism
   */
  async acquireLock(lockKey, expireInSeconds = 30) {
    try {
      const client = this.redis.getClient();
      const lockId = `${Date.now()}-${Math.random()}`;
      
      const result = await client.set(
        `lock:${lockKey}`, 
        lockId, 
        { EX: expireInSeconds, NX: true }
      );
      
      return result === 'OK' ? lockId : null;
    } catch (error) {
      console.error('Redis acquire lock error:', error);
      return null;
    }
  }

  async releaseLock(lockKey, lockId) {
    try {
      const client = this.redis.getClient();
      
      const script = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[9])
        else
          return 0
        end
      `;
      
      return await client.eval(script, 1, `lock:${lockKey}`, lockId);
    } catch (error) {
      console.error('Redis release lock error:', error);
      return false;
    }
  }
}

// Initialize Redis configuration and service
const redisConfig = new RedisConfig();
const redisService = new RedisService(redisConfig);

// Initialize Redis connections
let initialized = false;
const initializeRedis = async () => {
  if (!initialized) {
    await redisConfig.initialize();
    initialized = true;
  }
  return { redisConfig, redisService };
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down Redis connections...');
  await redisConfig.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down Redis connections...');
  await redisConfig.disconnect();
  process.exit(0);
});

module.exports = {
  initializeRedis,
  redisConfig,
  redisService,
  RedisConfig,
  RedisService
};
