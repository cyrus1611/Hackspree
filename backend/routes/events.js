const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Event = require('../models/Event');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { auth, adminAuth } = require('../middleware/auth');
const { generateTransactionId, generateSlug } = require('../utils/helpers');

const router = express.Router();

// @route   GET /api/events
// @desc    Get list of events with filters
// @access  Public
router.get('/', [
  query('category')
    .optional()
    .isIn(['workshop', 'seminar', 'competition', 'cultural', 'sports', 'technical', 'career', 'social', 'other'])
    .withMessage('Invalid category'),
  
  query('status')
    .optional()
    .isIn(['draft', 'published', 'cancelled', 'postponed', 'completed', 'ongoing'])
    .withMessage('Invalid status'),
  
  query('upcoming')
    .optional()
    .isBoolean()
    .withMessage('Upcoming must be boolean'),
  
  query('featured')
    .optional()
    .isBoolean()
    .withMessage('Featured must be boolean'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be 1-50'),
  
  query('search')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be 1-100 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Build filter query
    const filter = { 
      isActive: true
    };

    // Only show published events for public access
    if (!req.user || req.user.role === 'student') {
      filter.status = 'published';
    }

    if (req.query.category) {
      filter.category = req.query.category;
    }

    if (req.query.status && (req.user?.role === 'admin' || req.user?.role === 'super_admin')) {
      filter.status = req.query.status;
    }

    if (req.query.upcoming === 'true') {
      filter.startDate = { $gte: new Date() };
    }

    if (req.query.featured === 'true') {
      filter.isFeatured = true;
    }

    if (req.query.search) {
      filter.$or = [
        { title: new RegExp(req.query.search, 'i') },
        { description: new RegExp(req.query.search, 'i') },
        { shortDescription: new RegExp(req.query.search, 'i') },
        { tags: { $in: [new RegExp(req.query.search, 'i')] } }
      ];
    }

    // Execute queries
    const [events, totalCount] = await Promise.all([
      Event.find(filter)
        .populate('organizer.userId', 'name email')
        .select('-registeredUsers -waitlist') // Exclude large arrays for list view
        .sort({ startDate: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Event.countDocuments(filter)
    ]);

    // Add computed fields
    const eventsWithStatus = events.map(event => {
      const eventObj = new Event(event);
      return {
        ...event,
        availableSpots: eventObj.availableSpots,
        registrationStatus: eventObj.registrationStatus,
        currentPrice: eventObj.currentPrice,
        durationInHours: eventObj.durationInHours,
        isRegistrationOpen: eventObj.registrationStatus === 'open',
        daysUntilEvent: Math.ceil((new Date(event.startDate) - new Date()) / (1000 * 60 * 60 * 24))
      };
    });

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      message: 'Events fetched successfully',
      events: eventsWithStatus,
      pagination: {
        currentPage: page,
        totalPages,
        totalEvents: totalCount,
        eventsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      filters: {
        category: req.query.category || null,
        status: req.query.status || null,
        upcoming: req.query.upcoming || null,
        featured: req.query.featured || null,
        search: req.query.search || null
      }
    });

  } catch (error) {
    console.error('Events fetch error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch events',
      code: 'EVENTS_FETCH_ERROR'
    });
  }
});

// @route   GET /api/events/:id
// @desc    Get specific event details
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if it's ObjectId or slug
    let query = {};
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      query._id = id;
    } else {
      query.slug = id.toLowerCase();
    }

    query.isActive = true;

    const event = await Event.findOne(query)
      .populate('organizer.userId', 'name email phone')
      .populate('coOrganizers.userId', 'name email')
      .populate('registeredUsers.user', 'name universityId email')
      .lean();

    if (!event) {
      return res.status(404).json({ 
        message: 'Event not found',
        code: 'EVENT_NOT_FOUND'
      });
    }

    // Check if user has permission to view unpublished events
    if (event.status !== 'published' && 
        (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin' && 
         event.organizer.userId._id.toString() !== req.user._id.toString()))) {
      return res.status(403).json({ 
        message: 'Event not available',
        code: 'EVENT_NOT_AVAILABLE'
      });
    }

    // Add computed fields
    const eventObj = new Event(event);
    const eventDetails = {
      ...event,
      availableSpots: eventObj.availableSpots,
      registrationStatus: eventObj.registrationStatus,
      currentPrice: eventObj.currentPrice,
      durationInHours: eventObj.durationInHours,
      isRegistrationOpen: eventObj.registrationStatus === 'open',
      daysUntilEvent: Math.ceil((new Date(event.startDate) - new Date()) / (1000 * 60 * 60 * 24)),
      // Check if current user is registered (if authenticated)
      isUserRegistered: req.user ? event.registeredUsers.some(
        reg => reg.user._id.toString() === req.user._id.toString()
      ) : false,
      isUserInWaitlist: req.user ? event.waitlist.some(
        item => item.user.toString() === req.user._id.toString()
      ) : false
    };

    res.json({
      message: 'Event details fetched successfully',
      event: eventDetails
    });

  } catch (error) {
    console.error('Event details error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch event details',
      code: 'EVENT_DETAILS_ERROR'
    });
  }
});

// @route   POST /api/events
// @desc    Create a new event
// @access  Private
router.post('/', auth, [
  body('title')
    .notEmpty()
    .withMessage('Event title is required')
    .isLength({ min: 3, max: 200 })
    .withMessage('Title must be 3-200 characters'),
  
  body('description')
    .notEmpty()
    .withMessage('Description is required')
    .isLength({ min: 10, max: 2000 })
    .withMessage('Description must be 10-2000 characters'),
  
  body('price')
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),
  
  body('startDate')
    .isISO8601()
    .withMessage('Invalid start date format')
    .custom(value => {
      if (new Date(value) <= new Date()) {
        throw new Error('Start date must be in the future');
      }
      return true;
    }),
  
  body('endDate')
    .isISO8601()
    .withMessage('Invalid end date format')
    .custom((value, { req }) => {
      if (new Date(value) <= new Date(req.body.startDate)) {
        throw new Error('End date must be after start date');
      }
      return true;
    }),
  
  body('venue.name')
    .notEmpty()
    .withMessage('Venue name is required'),
  
  body('maxParticipants')
    .isInt({ min: 1, max: 10000 })
    .withMessage('Max participants must be 1-10000'),
  
  body('category')
    .notEmpty()
    .withMessage('Category is required')
    .isIn(['workshop', 'seminar', 'competition', 'cultural', 'sports', 'technical', 'career', 'social', 'other'])
    .withMessage('Invalid category')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      title,
      description,
      shortDescription,
      price,
      earlyBirdPrice,
      earlyBirdDeadline,
      startDate,
      endDate,
      registrationDeadline,
      venue,
      maxParticipants,
      minParticipants,
      category,
      subcategory,
      tags,
      requirements,
      media,
      settings
    } = req.body;

    // Generate slug
    const slug = generateSlug(title);

    // Check if slug already exists
    const existingEvent = await Event.findOne({ slug });
    let finalSlug = slug;
    
    if (existingEvent) {
      finalSlug = `${slug}-${Date.now()}`;
    }

    // Create event
    const eventData = {
      title: title.trim(),
      slug: finalSlug,
      description: description.trim(),
      shortDescription: shortDescription?.trim(),
      price,
      earlyBirdPrice,
      earlyBirdDeadline: earlyBirdDeadline ? new Date(earlyBirdDeadline) : undefined,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      registrationDeadline: registrationDeadline ? new Date(registrationDeadline) : undefined,
      venue,
      maxParticipants,
      minParticipants: minParticipants || 1,
      category,
      subcategory,
      tags: tags || [],
      requirements: requirements || {},
      media: media || {},
      settings: {
        allowWaitlist: true,
        autoApprove: true,
        sendReminders: true,
        collectFeedback: true,
        ...settings
      },
      organizer: {
        userId: req.userId,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone
      },
      status: 'draft'
    };

    const event = new Event(eventData);
    await event.save();

    console.log(`📅 New event created: ${title} by ${req.user.email}`);

    res.status(201).json({
      message: 'Event created successfully',
      event: {
        id: event._id,
        title: event.title,
        slug: event.slug,
        category: event.category,
        status: event.status,
        startDate: event.startDate,
        price: event.price,
        maxParticipants: event.maxParticipants
      },
      nextSteps: [
        'Review event details',
        'Add media and resources',
        'Publish event to make it visible',
        'Share event link with participants'
      ]
    });

  } catch (error) {
    console.error('Event creation error:', error);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));
      
      return res.status(400).json({
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    res.status(500).json({ 
      message: 'Failed to create event',
      code: 'EVENT_CREATION_ERROR'
    });
  }
});

// @route   POST /api/events/:id/register
// @desc    Register for an event
// @access  Private
router.post('/:id/register', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const event = await Event.findOne({
      _id: id,
      isActive: true,
      status: 'published'
    });

    if (!event) {
      return res.status(404).json({ 
        message: 'Event not found or not available for registration',
        code: 'EVENT_NOT_FOUND'
      });
    }

    // Check registration status
    if (event.registrationStatus !== 'open') {
      if (event.registrationStatus === 'closed') {
        return res.status(400).json({ 
          message: 'Registration is closed for this event',
          code: 'REGISTRATION_CLOSED'
        });
      } else if (event.registrationStatus === 'full') {
        if (event.settings.allowWaitlist) {
          return res.status(400).json({ 
            message: 'Event is full. Would you like to join the waitlist?',
            code: 'EVENT_FULL_WAITLIST_AVAILABLE'
          });
        } else {
          return res.status(400).json({ 
            message: 'Event is full and waitlist is not available',
            code: 'EVENT_FULL'
          });
        }
      }
    }

    // Check if user already registered
    const existingRegistration = event.registeredUsers.find(
      reg => reg.user.toString() === req.userId.toString()
    );

    if (existingRegistration) {
      return res.status(409).json({ 
        message: 'You are already registered for this event',
        code: 'ALREADY_REGISTERED',
        registration: existingRegistration
      });
    }

    // Check user wallet balance
    const user = await User.findById(req.userId);
    const conversionRate = parseFloat(process.env.COLLEX_CONVERSION_RATE || 1);
    const eventCostInCollex = event.currentPrice * conversionRate;

    if (event.currentPrice > 0) {
      const spendingCheck = user.canSpend(eventCostInCollex);
      
      if (!spendingCheck.canSpend) {
        return res.status(400).json({ 
          message: spendingCheck.hasBalance ? 
            'Daily transaction limit exceeded' : 
            'Insufficient wallet balance',
          code: spendingCheck.hasBalance ? 'DAILY_LIMIT_EXCEEDED' : 'INSUFFICIENT_BALANCE',
          required: eventCostInCollex,
          available: user.walletBalance
        });
      }
    }

    // Process payment if event has a cost
    let transaction = null;
    
    if (event.currentPrice > 0) {
      // Create transaction
      transaction = new Transaction({
        transactionId: generateTransactionId(),
        fromUser: req.userId,
        amount: eventCostInCollex,
        type: 'payment',
        category: 'event',
        description: `Event registration: ${event.title}`,
        status: 'completed',
        balanceBeforeTransaction: user.walletBalance,
        balanceAfterTransaction: user.walletBalance - eventCostInCollex,
        metadata: {
          eventId: event._id,
          eventTitle: event.title,
          eventDate: event.startDate
        }
      });

      // Update user balance
      user.resetDailySpentIfNeeded();
      user.walletBalance -= eventCostInCollex;
      user.dailySpentAmount += eventCostInCollex;

      await Promise.all([
        transaction.save(),
        user.save()
      ]);
    }

    // Register user for event
    await event.registerUser(req.userId, transaction?._id);

    // Real-time notification
    const io = req.app.get('io');
    if (io) {
      // Notify user
      if (transaction) {
        io.to(`wallet_${req.userId}`).emit('transaction_completed', {
          transaction: {
            id: transaction._id,
            amount: eventCostInCollex,
            type: 'payment',
            description: transaction.description
          },
          newBalance: user.walletBalance
        });
      }

      // Notify event organizer
      io.to(`user_${event.organizer.userId}`).emit('event_registration', {
        event: {
          id: event._id,
          title: event.title
        },
        participant: {
          name: user.name,
          email: user.email
        },
        newParticipantCount: event.currentParticipants + 1
      });
    }

    console.log(`🎫 User registered for event: ${user.email} → ${event.title}`);

    res.json({
      message: 'Successfully registered for event',
      registration: {
        eventId: event._id,
        eventTitle: event.title,
        registrationDate: new Date(),
        amount: event.currentPrice,
        transactionId: transaction?.transactionId
      },
      event: {
        title: event.title,
        startDate: event.startDate,
        venue: event.venue.name,
        remainingSpots: event.availableSpots - 1
      }
    });

  } catch (error) {
    console.error('Event registration error:', error);
    res.status(500).json({ 
      message: 'Failed to register for event',
      code: 'EVENT_REGISTRATION_ERROR'
    });
  }
});

// @route   GET /api/events/my/registered
// @desc    Get user's registered events
// @access  Private
router.get('/my/registered', auth, async (req, res) => {
  try {
    const events = await Event.find({
      'registeredUsers.user': req.userId,
      isActive: true
    })
    .populate('organizer.userId', 'name email')
    .select('-registeredUsers -waitlist')
    .sort({ startDate: 1 })
    .lean();

    // Add registration details
    const eventsWithDetails = await Promise.all(
      events.map(async (event) => {
        const fullEvent = await Event.findById(event._id)
          .select('registeredUsers')
          .lean();
        
        const registration = fullEvent.registeredUsers.find(
          reg => reg.user.toString() === req.userId.toString()
        );

        const eventObj = new Event(event);
        
        return {
          ...event,
          registration: {
            registeredAt: registration.registeredAt,
            paymentStatus: registration.paymentStatus,
            attendanceStatus: registration.attendanceStatus,
            certificateIssued: registration.certificateIssued
          },
          availableSpots: eventObj.availableSpots,
          daysUntilEvent: Math.ceil((new Date(event.startDate) - new Date()) / (1000 * 60 * 60 * 24)),
          eventStatus: event.startDate > new Date() ? 'upcoming' : 
                      event.endDate > new Date() ? 'ongoing' : 'completed'
        };
      })
    );

    res.json({
      message: 'Registered events fetched successfully',
      events: eventsWithDetails,
      count: eventsWithDetails.length
    });

  } catch (error) {
    console.error('Registered events error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch registered events',
      code: 'REGISTERED_EVENTS_ERROR'
    });
  }
});

module.exports = router;
