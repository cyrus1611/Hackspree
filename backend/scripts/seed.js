const mongoose = require('mongoose');
const { faker } = require('@faker-js/faker');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Import Models
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Merchant = require('../models/Merchant');
const Event = require('../models/Event');
const Club = require('../models/Club');
const AuditLog = require('../models/AuditLog');

/**
 * Comprehensive Database Seed Script for Hackspree Wallet Application
 * 
 * Features:
 * - Generates realistic user profiles with proper relationships
 * - Creates wallets with random balances and transaction history
 * - Seeds merchants with business information and verification status
 * - Generates events linked to merchants with attendee registrations
 * - Creates clubs with member hierarchies and activities
 * - Produces comprehensive transaction records with proper flow
 * - Maintains referential integrity across all collections
 * - Provides progress tracking and error handling
 * - Configurable data quantities for different environments
 */

class DatabaseSeeder {
  constructor() {
    this.config = {
      // Database Configuration
      mongodb: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/hackspree',
        options: {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          maxPoolSize: 10
        }
      },

      // Seeding Configuration
      seed: {
        users: parseInt(process.env.SEED_USERS) || 100,
        merchants: parseInt(process.env.SEED_MERCHANTS) || 25,
        events: parseInt(process.env.SEED_EVENTS) || 50,
        clubs: parseInt(process.env.SEED_CLUBS) || 10,
        transactionsPerUser: parseInt(process.env.SEED_TRANSACTIONS_PER_USER) || 5,
        maxWalletBalance: parseFloat(process.env.SEED_MAX_BALANCE) || 1000,
        clearDatabase: process.env.SEED_CLEAR_DB !== 'false'
      },

      // Sample Data Configuration
      categories: [
        'Food & Dining', 'Entertainment', 'Shopping', 'Transportation',
        'Healthcare', 'Education', 'Technology', 'Sports & Recreation',
        'Travel', 'Beauty & Personal Care', 'Home & Garden', 'Professional Services'
      ],

      eventTypes: [
        'Workshop', 'Seminar', 'Conference', 'Networking', 'Social',
        'Training', 'Competition', 'Exhibition', 'Concert', 'Festival'
      ],

      clubCategories: [
        'Technology', 'Business', 'Sports', 'Arts', 'Education',
        'Social', 'Professional', 'Hobby', 'Community Service', 'Travel'
      ]
    };

    this.logger = this.createLogger();
    this.seededData = {
      users: [],
      merchants: [],
      events: [],
      clubs: [],
      wallets: [],
      transactions: []
    };
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
      },
      progress: (current, total, item = 'items') => {
        const percentage = ((current / total) * 100).toFixed(1);
        console.log(`[PROGRESS] ${current}/${total} ${item} (${percentage}%)`);
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
      await mongoose.disconnect();
      this.logger.info('Disconnected from MongoDB');
    } catch (error) {
      this.logger.error('Error disconnecting from MongoDB:', error.message);
    }
  }

  /**
   * Clear existing data from database
   */
  async clearDatabase() {
    if (!this.config.seed.clearDatabase) {
      this.logger.info('Database clearing disabled - keeping existing data');
      return;
    }

    this.logger.info('Clearing existing database data...');

    const collections = [
      { model: AuditLog, name: 'Audit Logs' },
      { model: Transaction, name: 'Transactions' },
      { model: Event, name: 'Events' },
      { model: Club, name: 'Clubs' },
      { model: Merchant, name: 'Merchants' },
      { model: Wallet, name: 'Wallets' },
      { model: User, name: 'Users' }
    ];

    for (const { model, name } of collections) {
      try {
        const result = await model.deleteMany({});
        this.logger.info(`Cleared ${result.deletedCount} ${name}`);
      } catch (error) {
        this.logger.error(`Failed to clear ${name}:`, error.message);
      }
    }

    this.logger.success('Database cleared successfully');
  }

  /**
   * Generate random user data
   */
  generateUserData() {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const email = faker.internet.email({ firstName, lastName }).toLowerCase();

    return {
      name: `${firstName} ${lastName}`,
      email: email,
      phone: faker.phone.number('+1##########'),
      dateOfBirth: faker.date.birthdate({ min: 18, max: 80, mode: 'age' }),
      address: {
        street: faker.location.streetAddress(),
        city: faker.location.city(),
        state: faker.location.state({ abbreviated: true }),
        postalCode: faker.location.zipCode(),
        country: 'US'
      },
      profileImage: faker.image.avatar(),
      isActive: faker.datatype.boolean(0.95), // 95% active users
      isEmailVerified: faker.datatype.boolean(0.85), // 85% verified emails
      isPhoneVerified: faker.datatype.boolean(0.70), // 70% verified phones
      role: faker.helpers.weightedArrayElement([
        { weight: 85, value: 'user' },
        { weight: 10, value: 'merchant' },
        { weight: 4, value: 'moderator' },
        { weight: 1, value: 'admin' }
      ]),
      preferences: {
        notifications: {
          email: faker.datatype.boolean(0.8),
          sms: faker.datatype.boolean(0.6),
          push: faker.datatype.boolean(0.9)
        },
        privacy: {
          profileVisibility: faker.helpers.arrayElement(['public', 'friends', 'private']),
          showBalance: faker.datatype.boolean(0.3)
        },
        language: faker.helpers.arrayElement(['en', 'es', 'fr', 'de', 'pt']),
        currency: faker.helpers.arrayElement(['USD', 'EUR', 'GBP', 'CAD', 'AUD'])
      }
    };
  }

  /**
   * Generate random merchant data
   */
  generateMerchantData(userId) {
    const businessName = faker.company.name();
    const category = faker.helpers.arrayElement(this.config.categories);

    return {
      userId: userId,
      businessName: businessName,
      displayName: businessName,
      slug: faker.helpers.slugify(businessName).toLowerCase(),
      description: faker.company.catchPhrase() + '. ' + faker.lorem.sentences(2),
      shortDescription: faker.company.catchPhrase(),
      category: category,
      subcategory: faker.commerce.department(),
      tags: faker.helpers.arrayElements(
        ['local', 'eco-friendly', 'premium', 'budget-friendly', 'fast-service', 'custom-orders'],
        { min: 1, max: 3 }
      ),
      
      contact: {
        email: faker.internet.email(),
        phone: faker.phone.number('+1##########'),
        website: faker.internet.url(),
        socialMedia: {
          facebook: faker.datatype.boolean(0.7) ? faker.internet.url() : null,
          twitter: faker.datatype.boolean(0.5) ? faker.internet.userName() : null,
          instagram: faker.datatype.boolean(0.8) ? faker.internet.userName() : null
        }
      },

      location: {
        address: faker.location.streetAddress(),
        city: faker.location.city(),
        state: faker.location.state({ abbreviated: true }),
        postalCode: faker.location.zipCode(),
        country: 'US',
        coordinates: {
          latitude: parseFloat(faker.location.latitude()),
          longitude: parseFloat(faker.location.longitude())
        }
      },

      business: {
        registrationNumber: faker.finance.accountNumber(8),
        taxId: faker.finance.accountNumber(9),
        businessType: faker.helpers.arrayElement(['LLC', 'Corporation', 'Partnership', 'Sole Proprietorship']),
        foundedYear: faker.date.past({ years: 20 }).getFullYear()
      },

      verification: {
        status: faker.helpers.weightedArrayElement([
          { weight: 60, value: 'verified' },
          { weight: 25, value: 'pending' },
          { weight: 10, value: 'under_review' },
          { weight: 5, value: 'rejected' }
        ]),
        verifiedAt: faker.datatype.boolean(0.6) ? faker.date.past() : null,
        documents: {
          businessLicense: faker.datatype.boolean(0.8),
          taxCertificate: faker.datatype.boolean(0.7),
          identityVerification: faker.datatype.boolean(0.9)
        }
      },

      settings: {
        acceptsWalletPayments: true,
        paymentMethods: faker.helpers.arrayElements(['credit_card', 'debit_card', 'bank_transfer'], { min: 1, max: 3 }),
        operatingHours: {
          monday: { open: '09:00', close: '18:00', closed: false },
          tuesday: { open: '09:00', close: '18:00', closed: false },
          wednesday: { open: '09:00', close: '18:00', closed: false },
          thursday: { open: '09:00', close: '18:00', closed: false },
          friday: { open: '09:00', close: '18:00', closed: false },
          saturday: { open: '10:00', close: '16:00', closed: false },
          sunday: { open: '12:00', close: '16:00', closed: faker.datatype.boolean(0.3) }
        }
      },

      statistics: {
        totalTransactions: 0,
        totalRevenue: 0,
        averageRating: faker.number.float({ min: 3.0, max: 5.0, precision: 0.1 }),
        totalRatings: faker.number.int({ min: 0, max: 500 })
      },

      isActive: faker.datatype.boolean(0.9),
      isFeatured: faker.datatype.boolean(0.15)
    };
  }

  /**
   * Generate random event data
   */
  generateEventData(merchantId) {
    const title = faker.helpers.arrayElement(this.config.eventTypes) + ': ' + faker.company.catchPhrase();
    const startDate = faker.date.future({ years: 1 });
    const endDate = new Date(startDate);
    endDate.setHours(endDate.getHours() + faker.number.int({ min: 2, max: 8 }));

    return {
      title: title,
      slug: faker.helpers.slugify(title).toLowerCase(),
      description: faker.lorem.paragraphs(3),
      shortDescription: faker.lorem.sentences(2),
      merchantId: merchantId,

      category: faker.helpers.arrayElement(this.config.eventTypes),
      tags: faker.helpers.arrayElements(
        ['networking', 'educational', 'fun', 'professional', 'beginner-friendly', 'advanced'],
        { min: 1, max: 3 }
      ),

      schedule: {
        startDate: startDate,
        endDate: endDate,
        timezone: 'America/New_York',
        duration: Math.floor((endDate - startDate) / (1000 * 60)), // duration in minutes
        isAllDay: faker.datatype.boolean(0.1)
      },

      location: {
        type: faker.helpers.arrayElement(['physical', 'virtual', 'hybrid']),
        venue: {
          name: faker.company.name() + ' Center',
          address: faker.location.streetAddress(),
          city: faker.location.city(),
          state: faker.location.state({ abbreviated: true }),
          postalCode: faker.location.zipCode(),
          country: 'US'
        },
        coordinates: {
          latitude: parseFloat(faker.location.latitude()),
          longitude: parseFloat(faker.location.longitude())
        },
        virtualInfo: {
          platform: faker.helpers.arrayElement(['Zoom', 'Teams', 'WebEx', 'Google Meet']),
          link: faker.internet.url(),
          accessCode: faker.string.alphanumeric(8)
        }
      },

      pricing: {
        type: faker.helpers.arrayElement(['free', 'paid']),
        amount: faker.datatype.boolean(0.3) ? 0 : faker.number.float({ min: 10, max: 500, precision: 0.01 }),
        currency: 'USD',
        earlyBirdDiscount: {
          enabled: faker.datatype.boolean(0.4),
          percentage: faker.number.int({ min: 10, max: 30 }),
          validUntil: faker.date.soon({ days: 30 })
        }
      },

      capacity: {
        maxParticipants: faker.number.int({ min: 20, max: 500 }),
        currentParticipants: 0,
        waitingList: faker.datatype.boolean(0.3)
      },

      media: {
        coverImage: faker.image.url({ width: 1200, height: 630 }),
        gallery: Array.from({ length: faker.number.int({ min: 0, max: 5 }) }, () => ({
          url: faker.image.url({ width: 800, height: 600 }),
          caption: faker.lorem.sentence()
        })),
        video: faker.datatype.boolean(0.2) ? faker.internet.url() : null
      },

      requirements: {
        ageRestriction: faker.helpers.arrayElement([null, 18, 21]),
        prerequisites: faker.datatype.boolean(0.3) ? faker.lorem.sentences(2) : null,
        materialsNeeded: faker.datatype.boolean(0.4) ? faker.lorem.sentences(1) : null
      },

      status: faker.helpers.weightedArrayElement([
        { weight: 70, value: 'published' },
        { weight: 15, value: 'draft' },
        { weight: 10, value: 'cancelled' },
        { weight: 5, value: 'completed' }
      ]),

      isActive: faker.datatype.boolean(0.9),
      isFeatured: faker.datatype.boolean(0.2),
      allowsWalletPayment: true
    };
  }

  /**
   * Generate random club data
   */
  generateClubData(creatorId) {
    const name = faker.helpers.arrayElement(['The', 'Elite', 'Pro', 'Future', 'Dynamic', 'Creative']) + ' ' +
                 faker.helpers.arrayElement(this.config.clubCategories) + ' ' +
                 faker.helpers.arrayElement(['Club', 'Society', 'Group', 'Community', 'Network']);

    return {
      name: name,
      slug: faker.helpers.slugify(name).toLowerCase(),
      description: faker.lorem.paragraphs(2),
      shortDescription: faker.lorem.sentences(1),
      createdBy: creatorId,

      category: faker.helpers.arrayElement(this.config.clubCategories),
      tags: faker.helpers.arrayElements(
        ['networking', 'learning', 'social', 'professional', 'hobby', 'community'],
        { min: 1, max: 3 }
      ),

      location: {
        type: faker.helpers.arrayElement(['local', 'regional', 'national', 'international']),
        city: faker.location.city(),
        state: faker.location.state({ abbreviated: true }),
        country: 'US',
        isVirtual: faker.datatype.boolean(0.3)
      },

      settings: {
        privacy: {
          visibility: faker.helpers.weightedArrayElement([
            { weight: 60, value: 'public' },
            { weight: 30, value: 'private' },
            { weight: 10, value: 'hidden' }
          ]),
          memberListVisible: faker.datatype.boolean(0.7),
          requireApproval: faker.datatype.boolean(0.4)
        },
        membership: {
          maxMembers: faker.number.int({ min: 50, max: 1000 }),
          allowInvites: faker.datatype.boolean(0.8),
          membershipFee: faker.datatype.boolean(0.2) ? faker.number.float({ min: 5, max: 50 }) : 0
        },
        content: {
          allowEvents: faker.datatype.boolean(0.9),
          allowDiscussions: faker.datatype.boolean(0.8),
          moderationEnabled: faker.datatype.boolean(0.6)
        }
      },

      members: [
        {
          userId: creatorId,
          role: 'owner',
          joinedAt: faker.date.past({ years: 1 }),
          status: 'active',
          permissions: {
            canInvite: true,
            canModerate: true,
            canCreateEvents: true,
            canManageWallet: true
          }
        }
      ],

      statistics: {
        totalMembers: 1,
        activeMembers: 1,
        totalEvents: 0,
        totalRevenue: 0,
        lastActivityAt: new Date()
      },

      images: {
        cover: faker.image.url({ width: 1200, height: 400 }),
        logo: faker.image.url({ width: 200, height: 200 })
      },

      contact: {
        email: faker.internet.email(),
        website: faker.datatype.boolean(0.5) ? faker.internet.url() : null,
        socialMedia: {
          facebook: faker.datatype.boolean(0.6) ? faker.internet.url() : null,
          twitter: faker.datatype.boolean(0.4) ? faker.internet.userName() : null
        }
      },

      clubWallet: {
        enabled: faker.datatype.boolean(0.3),
        balance: faker.datatype.boolean(0.3) ? faker.number.float({ min: 0, max: 1000, precision: 0.01 }) : 0,
        currency: 'USD'
      },

      status: 'active',
      isVerified: faker.datatype.boolean(0.4),
      isFeatured: faker.datatype.boolean(0.1)
    };
  }

  /**
   * Seed Users
   */
  async seedUsers() {
    this.logger.info(`Seeding ${this.config.seed.users} users...`);

    const users = [];
    const saltRounds = 10;

    for (let i = 0; i < this.config.seed.users; i++) {
      try {
        const userData = this.generateUserData();
        
        // Hash password
        userData.passwordHash = await bcrypt.hash('password123', saltRounds);
        
        const user = new User(userData);
        await user.save();
        users.push(user);

        if ((i + 1) % 10 === 0) {
          this.logger.progress(i + 1, this.config.seed.users, 'users');
        }
      } catch (error) {
        this.logger.error(`Failed to create user ${i + 1}:`, error.message);
      }
    }

    this.seededData.users = users;
    this.logger.success(`Successfully seeded ${users.length} users`);
    return users;
  }

  /**
   * Seed Wallets for Users
   */
  async seedWallets() {
    this.logger.info(`Creating wallets for ${this.seededData.users.length} users...`);

    const wallets = [];

    for (let i = 0; i < this.seededData.users.length; i++) {
      try {
        const user = this.seededData.users[i];
        const wallet = new Wallet({
          userId: user._id,
          walletId: `WALLET_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
          balance: faker.number.float({ min: 0, max: this.config.seed.maxWalletBalance, precision: 0.01 }),
          currency: user.preferences?.currency || 'USD',
          isActive: true,
          pin: {
            isSet: faker.datatype.boolean(0.8),
            hash: faker.datatype.boolean(0.8) ? await bcrypt.hash('1234', 10) : null
          }
        });

        await wallet.save();
        wallets.push(wallet);

        if ((i + 1) % 25 === 0) {
          this.logger.progress(i + 1, this.seededData.users.length, 'wallets');
        }
      } catch (error) {
        this.logger.error(`Failed to create wallet for user ${i + 1}:`, error.message);
      }
    }

    this.seededData.wallets = wallets;
    this.logger.success(`Successfully created ${wallets.length} wallets`);
    return wallets;
  }

  /**
   * Seed Merchants
   */
  async seedMerchants() {
    this.logger.info(`Seeding ${this.config.seed.merchants} merchants...`);

    const merchants = [];
    const merchantUsers = this.seededData.users.filter(user => 
      ['merchant', 'admin'].includes(user.role)
    ).slice(0, this.config.seed.merchants);

    // If we don't have enough merchant users, use regular users
    while (merchantUsers.length < this.config.seed.merchants) {
      const randomUser = faker.helpers.arrayElement(this.seededData.users);
      if (!merchantUsers.includes(randomUser)) {
        merchantUsers.push(randomUser);
      }
    }

    for (let i = 0; i < merchantUsers.length; i++) {
      try {
        const user = merchantUsers[i];
        const merchantData = this.generateMerchantData(user._id);
        
        const merchant = new Merchant(merchantData);
        await merchant.save();
        merchants.push(merchant);

        if ((i + 1) % 5 === 0) {
          this.logger.progress(i + 1, merchantUsers.length, 'merchants');
        }
      } catch (error) {
        this.logger.error(`Failed to create merchant ${i + 1}:`, error.message);
      }
    }

    this.seededData.merchants = merchants;
    this.logger.success(`Successfully seeded ${merchants.length} merchants`);
    return merchants;
  }

  /**
   * Seed Events
   */
  async seedEvents() {
    this.logger.info(`Seeding ${this.config.seed.events} events...`);

    const events = [];

    for (let i = 0; i < this.config.seed.events; i++) {
      try {
        const merchant = faker.helpers.arrayElement(this.seededData.merchants);
        const eventData = this.generateEventData(merchant._id);
        
        const event = new Event(eventData);
        await event.save();
        events.push(event);

        if ((i + 1) % 10 === 0) {
          this.logger.progress(i + 1, this.config.seed.events, 'events');
        }
      } catch (error) {
        this.logger.error(`Failed to create event ${i + 1}:`, error.message);
      }
    }

    this.seededData.events = events;
    this.logger.success(`Successfully seeded ${events.length} events`);
    return events;
  }

  /**
   * Seed Clubs
   */
  async seedClubs() {
    this.logger.info(`Seeding ${this.config.seed.clubs} clubs...`);

    const clubs = [];

    for (let i = 0; i < this.config.seed.clubs; i++) {
      try {
        const creator = faker.helpers.arrayElement(this.seededData.users);
        const clubData = this.generateClubData(creator._id);
        
        const club = new Club(clubData);
        await club.save();
        clubs.push(club);

        // Add some random members to each club
        const memberCount = faker.number.int({ min: 5, max: 20 });
        const potentialMembers = this.seededData.users.filter(user => 
          !user._id.equals(creator._id)
        );

        for (let j = 0; j < Math.min(memberCount, potentialMembers.length); j++) {
          const member = faker.helpers.arrayElement(potentialMembers);
          const memberIndex = potentialMembers.indexOf(member);
          potentialMembers.splice(memberIndex, 1);

          club.members.push({
            userId: member._id,
            role: faker.helpers.weightedArrayElement([
              { weight: 80, value: 'member' },
              { weight: 15, value: 'moderator' },
              { weight: 5, value: 'admin' }
            ]),
            joinedAt: faker.date.past({ years: 1 }),
            status: faker.helpers.weightedArrayElement([
              { weight: 90, value: 'active' },
              { weight: 8, value: 'inactive' },
              { weight: 2, value: 'pending' }
            ])
          });
        }

        club.statistics.totalMembers = club.members.length;
        club.statistics.activeMembers = club.members.filter(m => m.status === 'active').length;
        await club.save();

        if ((i + 1) % 2 === 0) {
          this.logger.progress(i + 1, this.config.seed.clubs, 'clubs');
        }
      } catch (error) {
        this.logger.error(`Failed to create club ${i + 1}:`, error.message);
      }
    }

    this.seededData.clubs = clubs;
    this.logger.success(`Successfully seeded ${clubs.length} clubs`);
    return clubs;
  }

  /**
   * Seed Transactions
   */
  async seedTransactions() {
    const totalTransactions = this.seededData.wallets.length * this.config.seed.transactionsPerUser;
    this.logger.info(`Seeding ${totalTransactions} transactions...`);

    const transactions = [];
    let transactionCounter = 1;

    for (const wallet of this.seededData.wallets) {
      const transactionsForWallet = this.config.seed.transactionsPerUser;

      for (let i = 0; i < transactionsForWallet; i++) {
        try {
          const transactionType = faker.helpers.weightedArrayElement([
            { weight: 40, value: 'CREDIT' },
            { weight: 60, value: 'DEBIT' }
          ]);

          const category = faker.helpers.weightedArrayElement([
            { weight: 30, value: 'TOP_UP' },
            { weight: 25, value: 'PAYMENT' },
            { weight: 20, value: 'TRANSFER' },
            { weight: 10, value: 'WITHDRAWAL' },
            { weight: 10, value: 'REFUND' },
            { weight: 5, value: 'REVERSAL' }
          ]);

          const amount = faker.number.float({
            min: 1,
            max: Math.min(200, wallet.balance * 0.5),
            precision: 0.01
          });

          const transactionData = {
            transactionId: `TXN_${Date.now()}_${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
            userId: wallet.userId,
            walletId: wallet._id,
            amount: amount,
            type: transactionType,
            category: category,
            status: faker.helpers.weightedArrayElement([
              { weight: 85, value: 'COMPLETED' },
              { weight: 10, value: 'PENDING' },
              { weight: 4, value: 'FAILED' },
              { weight: 1, value: 'CANCELLED' }
            ]),
            description: this.generateTransactionDescription(category, amount),
            balanceBefore: wallet.balance,
            balanceAfter: transactionType === 'CREDIT' ? 
              wallet.balance + amount : 
              wallet.balance - amount,
            
            metadata: {
              merchantId: ['PAYMENT', 'REFUND'].includes(category) ? 
                faker.helpers.arrayElement(this.seededData.merchants)._id : null,
              eventId: category === 'EVENT_PAYMENT' ? 
                faker.helpers.arrayElement(this.seededData.events)._id : null,
              paymentMethod: faker.helpers.arrayElement(['wallet', 'credit_card', 'bank_transfer']),
              channel: faker.helpers.arrayElement(['web', 'mobile', 'api'])
            },
            
            createdAt: faker.date.past({ years: 1 }),
            processedAt: faker.date.recent(),
            completedAt: faker.date.recent()
          };

          const transaction = new Transaction(transactionData);
          await transaction.save();
          transactions.push(transaction);

          // Update wallet balance
          wallet.balance = transactionData.balanceAfter;
          await wallet.save();

          if (transactionCounter % 50 === 0) {
            this.logger.progress(transactionCounter, totalTransactions, 'transactions');
          }
          transactionCounter++;

        } catch (error) {
          this.logger.error(`Failed to create transaction ${transactionCounter}:`, error.message);
          transactionCounter++;
        }
      }
    }

    this.seededData.transactions = transactions;
    this.logger.success(`Successfully seeded ${transactions.length} transactions`);
    return transactions;
  }

  /**
   * Generate transaction description based on category
   */
  generateTransactionDescription(category, amount) {
    const descriptions = {
      'TOP_UP': [
        `Wallet top-up of $${amount}`,
        `Added $${amount} to wallet`,
        `Balance increase: $${amount}`
      ],
      'PAYMENT': [
        `Payment to ${faker.company.name()}`,
        `Purchase at ${faker.company.name()}`,
        `Transaction at ${faker.company.name()}`
      ],
      'TRANSFER': [
        `Transfer to ${faker.person.fullName()}`,
        `Money sent to user`,
        `Wallet transfer: $${amount}`
      ],
      'WITHDRAWAL': [
        `Withdrawal of $${amount}`,
        `Cash withdrawal`,
        `Bank transfer withdrawal`
      ],
      'REFUND': [
        `Refund from ${faker.company.name()}`,
        `Transaction refund`,
        `Return processing`
      ],
      'REVERSAL': [
        `Transaction reversal`,
        `Payment cancelled`,
        `Reversed transaction`
      ]
    };

    return faker.helpers.arrayElement(descriptions[category] || [`Transaction: $${amount}`]);
  }

  /**
   * Seed Audit Logs
   */
  async seedAuditLogs() {
    this.logger.info('Seeding audit logs...');

    const auditLogs = [];
    const logCount = Math.min(500, this.seededData.users.length * 5);

    for (let i = 0; i < logCount; i++) {
      try {
        const user = faker.helpers.arrayElement(this.seededData.users);
        const action = faker.helpers.arrayElement([
          'LOGIN', 'LOGOUT', 'PROFILE_UPDATE', 'PASSWORD_CHANGE',
          'WALLET_CREATE', 'TRANSACTION_CREATE', 'PAYMENT_PROCESS',
          'EVENT_REGISTER', 'CLUB_JOIN', 'MERCHANT_CREATE'
        ]);

        const auditLog = new AuditLog({
          userId: user._id,
          sessionId: faker.string.uuid(),
          requestId: faker.string.uuid(),
          action: action,
          resourceType: faker.helpers.arrayElement(['USER', 'WALLET', 'TRANSACTION', 'MERCHANT', 'EVENT', 'CLUB']),
          status: faker.helpers.weightedArrayElement([
            { weight: 90, value: 'SUCCESS' },
            { weight: 8, value: 'WARNING' },
            { weight: 2, value: 'FAILURE' }
          ]),
          ipAddress: faker.internet.ip(),
          userAgent: faker.internet.userAgent(),
          details: {
            description: `User performed ${action.toLowerCase()}`,
            additionalInfo: faker.lorem.sentence()
          },
          createdAt: faker.date.past({ years: 1 })
        });

        await auditLog.save();
        auditLogs.push(auditLog);

        if ((i + 1) % 50 === 0) {
          this.logger.progress(i + 1, logCount, 'audit logs');
        }
      } catch (error) {
        this.logger.error(`Failed to create audit log ${i + 1}:`, error.message);
      }
    }

    this.logger.success(`Successfully seeded ${auditLogs.length} audit logs`);
    return auditLogs;
  }

  /**
   * Generate summary report
   */
  generateSummary() {
    const summary = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: this.config.mongodb.uri,
      seededData: {
        users: this.seededData.users.length,
        wallets: this.seededData.wallets.length,
        merchants: this.seededData.merchants.length,
        events: this.seededData.events.length,
        clubs: this.seededData.clubs.length,
        transactions: this.seededData.transactions.length
      },
      statistics: {
        totalWalletBalance: this.seededData.wallets.reduce((sum, wallet) => sum + wallet.balance, 0).toFixed(2),
        activeUsers: this.seededData.users.filter(user => user.isActive).length,
        verifiedMerchants: this.seededData.merchants.filter(merchant => merchant.verification.status === 'verified').length,
        publishedEvents: this.seededData.events.filter(event => event.status === 'published').length,
        publicClubs: this.seededData.clubs.filter(club => club.settings.privacy.visibility === 'public').length
      }
    };

    this.logger.info('\n=== SEEDING SUMMARY ===');
    this.logger.info(`Environment: ${summary.environment}`);
    this.logger.info(`Database: ${summary.database}`);
    this.logger.info('\n--- Seeded Data ---');
    Object.entries(summary.seededData).forEach(([key, value]) => {
      this.logger.info(`${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`);
    });
    this.logger.info('\n--- Statistics ---');
    Object.entries(summary.statistics).forEach(([key, value]) => {
      this.logger.info(`${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}: ${value}`);
    });
    this.logger.info('======================\n');

    return summary;
  }

  /**
   * Main seeding execution
   */
  async performSeed() {
    const startTime = Date.now();
    this.logger.info('Starting Hackspree database seeding process...');

    try {
      await this.connect();
      await this.clearDatabase();

      // Seed data in dependency order
      await this.seedUsers();
      await this.seedWallets();
      await this.seedMerchants();
      await this.seedEvents();
      await this.seedClubs();
      await this.seedTransactions();
      await this.seedAuditLogs();

      // Generate summary
      const summary = this.generateSummary();
      const duration = Date.now() - startTime;

      this.logger.success(`Database seeding completed successfully in ${(duration / 1000).toFixed(2)}s`);
      return summary;

    } catch (error) {
      this.logger.error('Database seeding failed:', error.message);
      throw error;
    } finally {
      await this.disconnect();
    }
  }
}

/**
 * CLI execution
 */
async function main() {
  try {
    const seeder = new DatabaseSeeder();
    await seeder.performSeed();
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error.message);
    process.exit(1);
  }
}

// Export for programmatic use
module.exports = DatabaseSeeder;

// Run if executed directly
if (require.main === module) {
  main();
}
