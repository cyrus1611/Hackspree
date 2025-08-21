const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

/**
 * Comprehensive Database Migration Script for Hackspree Wallet Application
 * 
 * Features:
 * - Schema migrations for MongoDB collections
 * - Data transformations and migrations
 * - Version management and rollback capabilities
 * - Backup creation before migrations
 * - Index management and optimization
 * - Comprehensive logging and error handling
 * - Support for both up and down migrations
 * - Migration status tracking
 */

class MigrationManager {
  constructor() {
    this.config = {
      mongodb: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/hackspree',
        options: {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          maxPoolSize: 10,
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000
        }
      },
      migrations: {
        directory: path.join(__dirname, '../../migrations'),
        collectionName: 'migrations',
        lockCollection: 'migration_lock',
        backupBeforeMigration: true,
        backupDirectory: path.join(__dirname, '../../backups/migrations')
      }
    };

    this.logger = this.createLogger();
    this.connection = null;
    this.isLocked = false;
  }

  /**
   * Create logger instance
   */
  createLogger() {
    return {
      info: (message, ...args) => {
        console.log(`[INFO] ${new Date().toISOString()} - ${message}`, ...args);
      },
      warn: (message, ...args) => {
        console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args);
      },
      error: (message, ...args) => {
        console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...args);
      },
      success: (message, ...args) => {
        console.log(`[SUCCESS] ${new Date().toISOString()} - ${message}`, ...args);
      }
    };
  }

  /**
   * Connect to MongoDB
   */
  async connect() {
    try {
      this.logger.info('Connecting to MongoDB...');
      await mongoose.connect(this.config.mongodb.uri, this.config.mongodb.options);
      this.connection = mongoose.connection;
      this.logger.success('Connected to MongoDB successfully');
    } catch (error) {
      this.logger.error('Failed to connect to MongoDB:', error.message);
      throw error;
    }
  }

  /**
   * Disconnect from MongoDB
   */
  async disconnect() {
    try {
      if (this.connection) {
        await mongoose.disconnect();
        this.logger.info('Disconnected from MongoDB');
      }
    } catch (error) {
      this.logger.error('Error disconnecting from MongoDB:', error.message);
    }
  }

  /**
   * Initialize migration system
   */
  async initialize() {
    try {
      // Create migrations directory if it doesn't exist
      await this.ensureDirectoryExists(this.config.migrations.directory);
      await this.ensureDirectoryExists(this.config.migrations.backupDirectory);

      // Create migration tracking collection
      await this.createMigrationCollection();

      this.logger.info('Migration system initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize migration system:', error.message);
      throw error;
    }
  }

  /**
   * Ensure directory exists
   */
  async ensureDirectoryExists(dirPath) {
    try {
      await fs.access(dirPath);
    } catch (error) {
      await fs.mkdir(dirPath, { recursive: true });
      this.logger.info(`Created directory: ${dirPath}`);
    }
  }

  /**
   * Create migration tracking collection
   */
  async createMigrationCollection() {
    const db = this.connection.db;
    
    // Create migrations collection with proper indexes
    try {
      await db.createCollection(this.config.migrations.collectionName);
      await db.collection(this.config.migrations.collectionName).createIndex(
        { fileName: 1 }, 
        { unique: true }
      );
      this.logger.info('Migration tracking collection created');
    } catch (error) {
      if (error.code !== 48) { // Collection already exists
        throw error;
      }
    }

    // Create lock collection
    try {
      await db.createCollection(this.config.migrations.lockCollection);
      this.logger.info('Migration lock collection created');
    } catch (error) {
      if (error.code !== 48) { // Collection already exists
        throw error;
      }
    }
  }

  /**
   * Acquire migration lock
   */
  async acquireLock() {
    const db = this.connection.db;
    const lockCollection = db.collection(this.config.migrations.lockCollection);

    try {
      const result = await lockCollection.insertOne({
        _id: 'migration_lock',
        lockedAt: new Date(),
        lockedBy: process.pid
      });

      if (result.insertedId) {
        this.isLocked = true;
        this.logger.info('Migration lock acquired');
        return true;
      }
    } catch (error) {
      if (error.code === 11000) { // Duplicate key error
        this.logger.error('Migration is already running. Please wait for it to complete.');
        return false;
      }
      throw error;
    }
    return false;
  }

  /**
   * Release migration lock
   */
  async releaseLock() {
    if (!this.isLocked) return;

    const db = this.connection.db;
    const lockCollection = db.collection(this.config.migrations.lockCollection);

    try {
      await lockCollection.deleteOne({ _id: 'migration_lock' });
      this.isLocked = false;
      this.logger.info('Migration lock released');
    } catch (error) {
      this.logger.error('Failed to release migration lock:', error.message);
    }
  }

  /**
   * Get all migration files
   */
  async getMigrationFiles() {
    try {
      const files = await fs.readdir(this.config.migrations.directory);
      return files
        .filter(file => file.endsWith('.js'))
        .sort()
        .map(file => ({
          fileName: file,
          filePath: path.join(this.config.migrations.directory, file)
        }));
    } catch (error) {
      this.logger.error('Failed to read migration files:', error.message);
      return [];
    }
  }

  /**
   * Get applied migrations from database
   */
  async getAppliedMigrations() {
    const db = this.connection.db;
    const migrationCollection = db.collection(this.config.migrations.collectionName);

    try {
      const applied = await migrationCollection
        .find({})
        .sort({ appliedAt: 1 })
        .toArray();
      
      return applied.map(migration => migration.fileName);
    } catch (error) {
      this.logger.error('Failed to get applied migrations:', error.message);
      return [];
    }
  }

  /**
   * Get pending migrations
   */
  async getPendingMigrations() {
    const allMigrations = await this.getMigrationFiles();
    const appliedMigrations = await this.getAppliedMigrations();

    return allMigrations.filter(migration => 
      !appliedMigrations.includes(migration.fileName)
    );
  }

  /**
   * Create database backup before migration
   */
  async createBackup() {
    if (!this.config.migrations.backupBeforeMigration) {
      return null;
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `pre-migration-backup-${timestamp}`;
      const backupPath = path.join(this.config.migrations.backupDirectory, backupName);

      this.logger.info(`Creating backup: ${backupName}`);

      // Use mongodump to create backup
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      const dumpCommand = `mongodump --uri="${this.config.mongodb.uri}" --out="${backupPath}"`;
      await execAsync(dumpCommand);

      this.logger.success(`Backup created: ${backupPath}`);
      return backupPath;
    } catch (error) {
      this.logger.error('Failed to create backup:', error.message);
      throw error;
    }
  }

  /**
   * Load and validate migration file
   */
  async loadMigration(migrationFile) {
    try {
      // Clear require cache to ensure fresh load
      delete require.cache[require.resolve(migrationFile.filePath)];
      
      const migration = require(migrationFile.filePath);

      // Validate migration structure
      if (typeof migration.up !== 'function') {
        throw new Error('Migration must export an "up" function');
      }

      if (typeof migration.down !== 'function') {
        this.logger.warn(`Migration ${migrationFile.fileName} does not have a "down" function`);
      }

      return migration;
    } catch (error) {
      this.logger.error(`Failed to load migration ${migrationFile.fileName}:`, error.message);
      throw error;
    }
  }

  /**
   * Apply single migration
   */
  async applyMigration(migrationFile) {
    const startTime = Date.now();
    this.logger.info(`Applying migration: ${migrationFile.fileName}`);

    try {
      const migration = await this.loadMigration(migrationFile);
      
      // Execute migration within a session for transaction support
      const session = await this.connection.startSession();
      
      try {
        await session.withTransaction(async () => {
          await migration.up(this.connection.db, this.connection.client);
        });
      } finally {
        await session.endSession();
      }

      // Record migration as applied
      await this.recordMigration(migrationFile.fileName);

      const duration = Date.now() - startTime;
      this.logger.success(`Migration ${migrationFile.fileName} applied successfully (${duration}ms)`);

      return {
        fileName: migrationFile.fileName,
        success: true,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Migration ${migrationFile.fileName} failed (${duration}ms):`, error.message);
      
      return {
        fileName: migrationFile.fileName,
        success: false,
        error: error.message,
        duration
      };
    }
  }

  /**
   * Rollback single migration
   */
  async rollbackMigration(migrationFile) {
    const startTime = Date.now();
    this.logger.info(`Rolling back migration: ${migrationFile.fileName}`);

    try {
      const migration = await this.loadMigration(migrationFile);

      if (typeof migration.down !== 'function') {
        throw new Error('Migration does not support rollback (no "down" function)');
      }

      // Execute rollback within a session for transaction support
      const session = await this.connection.startSession();
      
      try {
        await session.withTransaction(async () => {
          await migration.down(this.connection.db, this.connection.client);
        });
      } finally {
        await session.endSession();
      }

      // Remove migration record
      await this.removeMigrationRecord(migrationFile.fileName);

      const duration = Date.now() - startTime;
      this.logger.success(`Migration ${migrationFile.fileName} rolled back successfully (${duration}ms)`);

      return {
        fileName: migrationFile.fileName,
        success: true,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Rollback of ${migrationFile.fileName} failed (${duration}ms):`, error.message);
      
      return {
        fileName: migrationFile.fileName,
        success: false,
        error: error.message,
        duration
      };
    }
  }

  /**
   * Record migration as applied
   */
  async recordMigration(fileName) {
    const db = this.connection.db;
    const migrationCollection = db.collection(this.config.migrations.collectionName);

    await migrationCollection.insertOne({
      fileName,
      appliedAt: new Date()
    });
  }

  /**
   * Remove migration record
   */
  async removeMigrationRecord(fileName) {
    const db = this.connection.db;
    const migrationCollection = db.collection(this.config.migrations.collectionName);

    await migrationCollection.deleteOne({ fileName });
  }

  /**
   * Run all pending migrations
   */
  async migrate() {
    try {
      await this.connect();
      await this.initialize();

      // Acquire lock
      const lockAcquired = await this.acquireLock();
      if (!lockAcquired) {
        process.exit(1);
      }

      // Create backup
      const backupPath = await this.createBackup();

      // Get pending migrations
      const pendingMigrations = await this.getPendingMigrations();

      if (pendingMigrations.length === 0) {
        this.logger.info('No pending migrations to apply');
        return { success: true, applied: 0 };
      }

      this.logger.info(`Found ${pendingMigrations.length} pending migrations`);

      const results = [];
      let successCount = 0;

      // Apply migrations one by one
      for (const migration of pendingMigrations) {
        const result = await this.applyMigration(migration);
        results.push(result);

        if (result.success) {
          successCount++;
        } else {
          this.logger.error('Migration failed, stopping migration process');
          break;
        }
      }

      // Generate summary
      const summary = {
        total: pendingMigrations.length,
        applied: successCount,
        failed: results.filter(r => !r.success).length,
        results,
        backupPath
      };

      if (successCount === pendingMigrations.length) {
        this.logger.success(`All ${successCount} migrations applied successfully`);
      } else {
        this.logger.error(`Migration process incomplete: ${successCount}/${pendingMigrations.length} applied`);
      }

      return summary;

    } catch (error) {
      this.logger.error('Migration process failed:', error.message);
      throw error;
    } finally {
      await this.releaseLock();
      await this.disconnect();
    }
  }

  /**
   * Rollback last migration
   */
  async rollback() {
    try {
      await this.connect();
      await this.initialize();

      // Acquire lock
      const lockAcquired = await this.acquireLock();
      if (!lockAcquired) {
        process.exit(1);
      }

      // Get last applied migration
      const appliedMigrations = await this.getAppliedMigrations();
      
      if (appliedMigrations.length === 0) {
        this.logger.info('No migrations to rollback');
        return { success: true, rolledBack: 0 };
      }

      const lastMigration = appliedMigrations[appliedMigrations.length - 1];
      const migrationFile = {
        fileName: lastMigration,
        filePath: path.join(this.config.migrations.directory, lastMigration)
      };

      this.logger.info(`Rolling back last migration: ${lastMigration}`);

      const result = await this.rollbackMigration(migrationFile);

      if (result.success) {
        this.logger.success('Rollback completed successfully');
      } else {
        this.logger.error('Rollback failed');
      }

      return result;

    } catch (error) {
      this.logger.error('Rollback process failed:', error.message);
      throw error;
    } finally {
      await this.releaseLock();
      await this.disconnect();
    }
  }

  /**
   * Show migration status
   */
  async status() {
    try {
      await this.connect();
      await this.initialize();

      const allMigrations = await this.getMigrationFiles();
      const appliedMigrations = await this.getAppliedMigrations();

      this.logger.info('Migration Status:');
      this.logger.info('================');

      if (allMigrations.length === 0) {
        this.logger.info('No migration files found');
        return;
      }

      allMigrations.forEach(migration => {
        const isApplied = appliedMigrations.includes(migration.fileName);
        const status = isApplied ? '✅ APPLIED' : '⏳ PENDING';
        this.logger.info(`${status} - ${migration.fileName}`);
      });

      this.logger.info('================');
      this.logger.info(`Total: ${allMigrations.length}, Applied: ${appliedMigrations.length}, Pending: ${allMigrations.length - appliedMigrations.length}`);

    } catch (error) {
      this.logger.error('Failed to get migration status:', error.message);
      throw error;
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Create new migration file
   */
  async createMigration(description) {
    try {
      const timestamp = new Date().toISOString()
        .replace(/[:.]/g, '')
        .replace('T', '')
        .substring(0, 14);

      const fileName = `${timestamp}-${description.toLowerCase().replace(/\s+/g, '-')}.js`;
      const filePath = path.join(this.config.migrations.directory, fileName);

      const template = `/**
 * Migration: ${description}
 * Created: ${new Date().toISOString()}
 */

module.exports = {
  /**
   * Apply migration
   * @param {Db} db - MongoDB database instance
   * @param {MongoClient} client - MongoDB client instance
   */
  async up(db, client) {
    // Add your migration logic here
    console.log('Applying migration: ${description}');
    
    // Example: Create a new collection
    // await db.createCollection('new_collection');
    
    // Example: Add an index
    // await db.collection('users').createIndex({ email: 1 }, { unique: true });
    
    // Example: Update documents
    // await db.collection('users').updateMany(
    //   { role: { $exists: false } },
    //   { $set: { role: 'user' } }
    // );
  },

  /**
   * Rollback migration
   * @param {Db} db - MongoDB database instance
   * @param {MongoClient} client - MongoDB client instance
   */
  async down(db, client) {
    // Add your rollback logic here
    console.log('Rolling back migration: ${description}');
    
    // Example: Drop collection
    // await db.dropCollection('new_collection');
    
    // Example: Drop index
    // await db.collection('users').dropIndex({ email: 1 });
    
    // Example: Revert document changes
    // await db.collection('users').updateMany(
    //   { role: 'user' },
    //   { $unset: { role: 1 } }
    // );
  }
};
`;

      await this.ensureDirectoryExists(this.config.migrations.directory);
      await fs.writeFile(filePath, template);

      this.logger.success(`Migration file created: ${fileName}`);
      this.logger.info(`Edit the file at: ${filePath}`);

      return fileName;

    } catch (error) {
      this.logger.error('Failed to create migration file:', error.message);
      throw error;
    }
  }
}

/**
 * CLI Command Handler
 */
async function handleCommand() {
  const args = process.argv.slice(2);
  const command = args[0];
  const migrationManager = new MigrationManager();

  try {
    switch (command) {
      case 'migrate':
      case 'up':
        await migrationManager.migrate();
        break;

      case 'rollback':
      case 'down':
        await migrationManager.rollback();
        break;

      case 'status':
        await migrationManager.status();
        break;

      case 'create':
        const description = args[1];
        if (!description) {
          console.error('Please provide a description for the migration');
          console.error('Usage: node migrate.js create "description"');
          process.exit(1);
        }
        await migrationManager.createMigration(description);
        break;

      default:
        console.log('Hackspree Migration Tool');
        console.log('Usage:');
        console.log('  node migrate.js migrate    - Apply all pending migrations');
        console.log('  node migrate.js rollback   - Rollback the last migration');
        console.log('  node migrate.js status     - Show migration status');
        console.log('  node migrate.js create "description" - Create a new migration file');
        break;
    }
  } catch (error) {
    console.error('Command failed:', error.message);
    process.exit(1);
  }
}

// Export for programmatic use
module.exports = MigrationManager;

// Run CLI if executed directly
if (require.main === module) {
  handleCommand();
}
