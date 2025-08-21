const Event = require('../models/Event');
const EventRegistration = require('../models/EventRegistration');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const paymentService = require('../services/paymentService');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

class EventController {
  /**
   * Create a new event
   */
  async createEvent(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
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
        category,
        subcategory,
        tags,
        media,
        isActive = true,
        isFeatured = false
      } = req.body;

      // Validate dates
      const now = new Date();
      if (new Date(startDate) <= now) {
        return res.status(400).json({
          success: false,
          message: 'Event start date must be in the future'
        });
      }

      if (new Date(endDate) <= new Date(startDate)) {
        return res.status(400).json({
          success: false,
          message: 'Event end date must be after start date'
        });
      }

      // Generate slug from title
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      const event = new Event({
        title,
        slug: `${slug}-${Date.now()}`,
        description,
        shortDescription,
        price: price || 0,
        earlyBirdPrice,
        earlyBirdDeadline,
        startDate,
        endDate,
        registrationDeadline: registrationDeadline || startDate,
        venue,
        maxParticipants: maxParticipants || 100,
        currentParticipants: 0,
        category,
        subcategory,
        tags: tags || [],
        organizer: {
          userId: req.userId,
          name: req.user.name,
          email: req.user.email
        },
        status: 'published',
        isActive,
        isFeatured,
        media: media || {}
      });

      await event.save();

      res.status(201).json({
        success: true,
        message: 'Event created successfully',
        data: {
          event: {
            id: event._id,
            title: event.title,
            slug: event.slug,
            price: event.price,
            startDate: event.startDate,
            endDate: event.endDate,
            maxParticipants: event.maxParticipants,
            category: event.category,
            status: event.status
          }
        }
      });

    } catch (error) {
      console.error('Create event error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create event',
        error: error.message
      });
    }
  }

  /**
   * Get event by ID or slug
   */
  async getEvent(req, res) {
    try {
      const { id } = req.params;
      
      let event;
      if (mongoose.Types.ObjectId.isValid(id)) {
        event = await Event.findById(id).populate('organizer.userId', 'name email');
      } else {
        event = await Event.findOne({ slug: id }).populate('organizer.userId', 'name email');
      }

      if (!event) {
        return res.status(404).json({
          success: false,
          message: 'Event not found'
        });
      }

      // Get registration count
      const registrationCount = await EventRegistration.countDocuments({
        eventId: event._id,
        status: { $in: ['registered', 'confirmed'] }
      });

      // Check if current user is registered (if authenticated)
      let userRegistration = null;
      if (req.userId) {
        userRegistration = await EventRegistration.findOne({
          eventId: event._id,
          userId: req.userId
        });
      }

      // Calculate current price (early bird vs regular)
      const now = new Date();
      const currentPrice = event.earlyBirdPrice && 
        event.earlyBirdDeadline && 
        now <= new Date(event.earlyBirdDeadline)
        ? event.earlyBirdPrice 
        : event.price;

      res.json({
        success: true,
        data: {
          event: {
            ...event.toObject(),
            currentParticipants: registrationCount,
            currentPrice,
            isEarlyBird: currentPrice === event.earlyBirdPrice,
            spotsRemaining: event.maxParticipants - registrationCount,
            userRegistration: userRegistration ? {
              id: userRegistration._id,
              status: userRegistration.status,
              registeredAt: userRegistration.createdAt
            } : null
          }
        }
      });

    } catch (error) {
      console.error('Get event error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve event',
        error: error.message
      });
    }
  }

  /**
   * Update event
   */
  async updateEvent(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { id } = req.params;
      const updateData = req.body;

      // Find event and check ownership
      const event = await Event.findById(id);
      if (!event) {
        return res.status(404).json({
          success: false,
          message: 'Event not found'
        });
      }

      // Check if user owns the event or is admin
      if (event.organizer.userId.toString() !== req.userId.toString() && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update this event'
        });
      }

      // Validate date changes
      if (updateData.startDate && new Date(updateData.startDate) <= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Cannot set start date to past'
        });
      }

      // Update slug if title is changed
      if (updateData.title && updateData.title !== event.title) {
        const slug = updateData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        updateData.slug = `${slug}-${event._id.toString().slice(-6)}`;
      }

      const updatedEvent = await Event.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      );

      res.json({
        success: true,
        message: 'Event updated successfully',
        data: {
          event: updatedEvent
        }
      });

    } catch (error) {
      console.error('Update event error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update event',
        error: error.message
      });
    }
  }

  /**
   * Delete event
   */
  async deleteEvent(req, res) {
    try {
      const { id } = req.params;

      const event = await Event.findById(id);
      if (!event) {
        return res.status(404).json({
          success: false,
          message: 'Event not found'
        });
      }

      // Check ownership
      if (event.organizer.userId.toString() !== req.userId.toString() && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete this event'
        });
      }

      // Check if event has registrations
      const registrationCount = await EventRegistration.countDocuments({
        eventId: id,
        status: { $in: ['registered', 'confirmed'] }
      });

      if (registrationCount > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete event with active registrations. Cancel the event instead.'
        });
      }

      await Event.findByIdAndDelete(id);

      res.json({
        success: true,
        message: 'Event deleted successfully'
      });

    } catch (error) {
      console.error('Delete event error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete event',
        error: error.message
      });
    }
  }

  /**
   * List events with filters and pagination
   */
  async listEvents(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        category,
        subcategory,
        status,
        startDate,
        endDate,
        priceMin,
        priceMax,
        featured,
        upcoming = true,
        sortBy = 'startDate',
        sortOrder = 'asc'
      } = req.query;

      // Build query
      const query = {};

      if (search) {
        query.$or = [
          { title: new RegExp(search, 'i') },
          { description: new RegExp(search, 'i') },
          { tags: new RegExp(search, 'i') }
        ];
      }

      if (category) query.category = category;
      if (subcategory) query.subcategory = subcategory;
      if (status) query.status = status;
      if (featured !== undefined) query.isFeatured = featured === 'true';

      // Date filters
      if (upcoming === 'true') {
        query.startDate = { $gte: new Date() };
      } else if (startDate || endDate) {
        query.startDate = {};
        if (startDate) query.startDate.$gte = new Date(startDate);
        if (endDate) query.startDate.$lte = new Date(endDate);
      }

      // Price filters
      if (priceMin || priceMax) {
        query.price = {};
        if (priceMin) query.price.$gte = parseFloat(priceMin);
        if (priceMax) query.price.$lte = parseFloat(priceMax);
      }

      // Active events only (unless admin)
      if (req.user?.role !== 'admin') {
        query.isActive = true;
        query.status = 'published';
      }

      // Sort options
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [events, totalEvents] = await Promise.all([
        Event.find(query)
          .populate('organizer.userId', 'name email')
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Event.countDocuments(query)
      ]);

      // Add registration counts and current prices
      const eventsWithDetails = await Promise.all(
        events.map(async (event) => {
          const registrationCount = await EventRegistration.countDocuments({
            eventId: event._id,
            status: { $in: ['registered', 'confirmed'] }
          });

          const now = new Date();
          const currentPrice = event.earlyBirdPrice && 
            event.earlyBirdDeadline && 
            now <= new Date(event.earlyBirdDeadline)
            ? event.earlyBirdPrice 
            : event.price;

          return {
            ...event,
            currentParticipants: registrationCount,
            currentPrice,
            isEarlyBird: currentPrice === event.earlyBirdPrice,
            spotsRemaining: event.maxParticipants - registrationCount,
            isFull: registrationCount >= event.maxParticipants
          };
        })
      );

      res.json({
        success: true,
        data: {
          events: eventsWithDetails,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalEvents / parseInt(limit)),
            totalEvents,
            eventsPerPage: parseInt(limit),
            hasNextPage: skip + parseInt(limit) < totalEvents,
            hasPrevPage: parseInt(page) > 1
          }
        }
      });

    } catch (error) {
      console.error('List events error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve events',
        error: error.message
      });
    }
  }

  /**
   * Register for event (with payment if required)
   */
  async registerForEvent(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { id: eventId } = req.params;
      const { nonce, paymentMethod = 'wallet' } = req.body;
      const userId = req.userId;

      // Get event details
      const event = await Event.findById(eventId).session(session);
      if (!event) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'Event not found'
        });
      }

      // Check if event is still accepting registrations
      if (event.status !== 'published' || !event.isActive) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Event is not accepting registrations'
        });
      }

      // Check registration deadline
      if (event.registrationDeadline && new Date() > new Date(event.registrationDeadline)) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Registration deadline has passed'
        });
      }

      // Check if already registered
      const existingRegistration = await EventRegistration.findOne({
        eventId,
        userId,
        status: { $in: ['registered', 'confirmed'] }
      }).session(session);

      if (existingRegistration) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Already registered for this event'
        });
      }

      // Check capacity
      const currentRegistrations = await EventRegistration.countDocuments({
        eventId,
        status: { $in: ['registered', 'confirmed'] }
      }).session(session);

      if (currentRegistrations >= event.maxParticipants) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Event is fully booked'
        });
      }

      // Calculate current price
      const now = new Date();
      const currentPrice = event.earlyBirdPrice && 
        event.earlyBirdDeadline && 
        now <= new Date(event.earlyBirdDeadline)
        ? event.earlyBirdPrice 
        : event.price;

      let paymentTransaction = null;

      // Handle payment if event has a price
      if (currentPrice > 0) {
        if (paymentMethod === 'wallet') {
          // Pay from wallet
          const wallet = await Wallet.findOne({ userId }).session(session);
          if (!wallet || wallet.balance < currentPrice) {
            await session.abortTransaction();
            return res.status(400).json({
              success: false,
              message: 'Insufficient wallet balance',
              requiredAmount: currentPrice,
              availableBalance: wallet?.balance || 0
            });
          }

          // Deduct from wallet
          wallet.balance -= currentPrice;
          await wallet.save({ session });

          // Create transaction record
          paymentTransaction = new Transaction({
            transactionId: `EVENT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            userId,
            walletId: wallet._id,
            amount: currentPrice,
            type: 'DEBIT',
            category: 'EVENT_PAYMENT',
            status: 'COMPLETED',
            balanceBefore: wallet.balance + currentPrice,
            balanceAfter: wallet.balance,
            description: `Payment for event: ${event.title}`,
            metadata: {
              eventId: event._id,
              eventTitle: event.title,
              paymentMethod: 'wallet'
            }
          });

          await paymentTransaction.save({ session });

        } else if (paymentMethod === 'square' && nonce) {
          // Pay with Square
          const paymentResult = await paymentService.createPayment({
            nonce,
            amount: currentPrice,
            note: `Event registration: ${event.title}`,
            buyerEmailAddress: req.user.email,
            userId: userId
          });

          if (!paymentResult.success) {
            await session.abortTransaction();
            return res.status(400).json({
              success: false,
              message: 'Payment failed',
              errors: paymentResult.errors
            });
          }

          // Create transaction record for Square payment
          paymentTransaction = new Transaction({
            transactionId: `EVENT_SQ_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            userId,
            amount: currentPrice,
            type: 'DEBIT',
            category: 'EVENT_PAYMENT',
            status: 'COMPLETED',
            balanceBefore: 0,
            balanceAfter: 0,
            description: `Event payment via Square: ${event.title}`,
            squarePaymentId: paymentResult.paymentId,
            metadata: {
              eventId: event._id,
              eventTitle: event.title,
              paymentMethod: 'square',
              squarePayment: paymentResult.payment
            }
          });

          await paymentTransaction.save({ session });

        } else {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: 'Invalid payment method or missing payment details'
          });
        }
      }

      // Create registration
      const registration = new EventRegistration({
        eventId,
        userId,
        registeredAt: new Date(),
        paymentStatus: currentPrice > 0 ? 'completed' : 'not_required',
        attendanceStatus: 'registered',
        transactionId: paymentTransaction?._id,
        amountPaid: currentPrice,
        paymentMethod
      });

      await registration.save({ session });

      // Update event participant count
      await Event.findByIdAndUpdate(
        eventId,
        { $inc: { currentParticipants: 1 } },
        { session }
      );

      await session.commitTransaction();

      res.json({
        success: true,
        message: 'Successfully registered for event',
        data: {
          registration: {
            id: registration._id,
            eventId: event._id,
            eventTitle: event.title,
            amountPaid: currentPrice,
            paymentMethod,
            status: registration.attendanceStatus,
            registeredAt: registration.registeredAt
          },
          transaction: paymentTransaction ? {
            id: paymentTransaction._id,
            transactionId: paymentTransaction.transactionId,
            amount: paymentTransaction.amount
          } : null
        }
      });

    } catch (error) {
      await session.abortTransaction();
      console.error('Register for event error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to register for event',
        error: error.message
      });
    } finally {
      session.endSession();
    }
  }

  /**
   * Cancel event registration
   */
  async cancelRegistration(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { registrationId } = req.params;
      const userId = req.userId;

      const registration = await EventRegistration.findOne({
        _id: registrationId,
        userId
      }).populate('eventId').session(session);

      if (!registration) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'Registration not found'
        });
      }

      if (registration.attendanceStatus === 'cancelled') {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Registration is already cancelled'
        });
      }

      const event = registration.eventId;
      const now = new Date();

      // Check if cancellation is allowed (e.g., 24 hours before event)
      const hoursBeforeEvent = (new Date(event.startDate) - now) / (1000 * 60 * 60);
      if (hoursBeforeEvent < 24) {
        return res.status(400).json({
          success: false,
          message: 'Cannot cancel registration less than 24 hours before event'
        });
      }

      // Process refund if payment was made
      if (registration.amountPaid > 0 && registration.paymentStatus === 'completed') {
        if (registration.paymentMethod === 'wallet') {
          // Refund to wallet
          const wallet = await Wallet.findOne({ userId }).session(session);
          if (wallet) {
            wallet.balance += registration.amountPaid;
            await wallet.save({ session });

            // Create refund transaction
            const refundTransaction = new Transaction({
              transactionId: `REFUND_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              userId,
              walletId: wallet._id,
              amount: registration.amountPaid,
              type: 'CREDIT',
              category: 'REFUND',
              status: 'COMPLETED',
              balanceBefore: wallet.balance - registration.amountPaid,
              balanceAfter: wallet.balance,
              description: `Refund for cancelled event: ${event.title}`,
              metadata: {
                originalTransactionId: registration.transactionId,
                eventId: event._id,
                registrationId: registration._id
              }
            });

            await refundTransaction.save({ session });
          }
        }
        // Note: Square refunds would be handled separately via Square API
      }

      // Update registration status
      registration.attendanceStatus = 'cancelled';
      registration.cancelledAt = new Date();
      await registration.save({ session });

      // Update event participant count
      await Event.findByIdAndUpdate(
        event._id,
        { $inc: { currentParticipants: -1 } },
        { session }
      );

      await session.commitTransaction();

      res.json({
        success: true,
        message: 'Registration cancelled successfully',
        data: {
          registrationId: registration._id,
          refundAmount: registration.amountPaid,
          cancelledAt: registration.cancelledAt
        }
      });

    } catch (error) {
      await session.abortTransaction();
      console.error('Cancel registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cancel registration',
        error: error.message
      });
    } finally {
      session.endSession();
    }
  }

  /**
   * Get user's event registrations
   */
  async getUserRegistrations(req, res) {
    try {
      const { page = 1, limit = 20, status } = req.query;
      const userId = req.userId;

      const query = { userId };
      if (status) query.attendanceStatus = status;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [registrations, totalRegistrations] = await Promise.all([
        EventRegistration.find(query)
          .populate('eventId', 'title startDate endDate venue price category')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        EventRegistration.countDocuments(query)
      ]);

      res.json({
        success: true,
        data: {
          registrations,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalRegistrations / parseInt(limit)),
            totalRegistrations,
            registrationsPerPage: parseInt(limit)
          }
        }
      });

    } catch (error) {
      console.error('Get user registrations error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve registrations',
        error: error.message
      });
    }
  }

  /**
   * Get event categories
   */
  async getCategories(req, res) {
    try {
      const categories = await Event.distinct('category');
      res.json({
        success: true,
        data: {
          categories: categories.filter(Boolean) // Remove null values
        }
      });
    } catch (error) {
      console.error('Get categories error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve categories',
        error: error.message
      });
    }
  }
}

module.exports = new EventController();
