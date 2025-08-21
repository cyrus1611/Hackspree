const express = require('express');
const { body, param, query } = require('express-validator');
const clubController = require('../controllers/clubController');
const authMiddleware = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const { handleValidationErrors } = require('../middleware/validation');
const upload = require('../middleware/upload'); // Multer middleware for file uploads

const router = express.Router();

/**
 * Club Routes for Hackspree Wallet Application
 * Comprehensive community management endpoints
 */

// Apply rate limiting to all club routes
router.use(rateLimiter.general);

/**
 * CLUB DISCOVERY AND LISTING ENDPOINTS
 */

// Get all public clubs with filtering and pagination
router.get('/',
  query('page')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Page must be a positive integer not exceeding 1000'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  query('search')
    .optional()
    .isLength({ min: 2, max: 100 })
    .trim()
    .escape()
    .withMessage('Search term must be 2-100 characters'),
  query('category')
    .optional()
    .isLength({ min: 2, max: 50 })
    .trim()
    .withMessage('Category must be 2-50 characters'),
  query('location')
    .optional()
    .isLength({ min: 2, max: 100 })
    .trim()
    .withMessage('Location must be 2-100 characters'),
  query('sortBy')
    .optional()
    .isIn(['name', 'memberCount', 'createdAt', 'lastActivity', 'featured'])
    .withMessage('Sort by must be one of: name, memberCount, createdAt, lastActivity, featured'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc'),
  query('featured')
    .optional()
    .isBoolean()
    .withMessage('Featured must be a boolean'),
  handleValidationErrors,
  clubController.listClubs
);

// Search clubs with advanced filters
router.get('/search',
  query('q')
    .isLength({ min: 2, max: 100 })
    .trim()
    .escape()
    .withMessage('Search query must be 2-100 characters'),
  query('filters')
    .optional()
    .isJSON()
    .withMessage('Filters must be valid JSON'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  handleValidationErrors,
  clubController.searchClubs
);

// Get featured clubs
router.get('/featured',
  query('limit')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Limit must be between 1 and 20'),
  handleValidationErrors,
  clubController.getFeaturedClubs
);

// Get popular clubs
router.get('/popular',
  query('timeframe')
    .optional()
    .isIn(['day', 'week', 'month', 'year'])
    .withMessage('Timeframe must be one of: day, week, month, year'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Limit must be between 1 and 20'),
  handleValidationErrors,
  clubController.getPopularClubs
);

// Get club categories
router.get('/categories',
  clubController.getClubCategories
);

/**
 * AUTHENTICATED USER CLUB ENDPOINTS
 */

// Get user's clubs (requires authentication)
router.get('/user/my-clubs',
  authMiddleware,
  query('status')
    .optional()
    .isIn(['all', 'active', 'pending', 'banned'])
    .withMessage('Status must be one of: all, active, pending, banned'),
  query('role')
    .optional()
    .isIn(['all', 'member', 'moderator', 'admin', 'owner'])
    .withMessage('Role must be one of: all, member, moderator, admin, owner'),
  handleValidationErrors,
  clubController.getUserClubs
);

// Get user's club invitations
router.get('/user/invitations',
  authMiddleware,
  query('status')
    .optional()
    .isIn(['pending', 'accepted', 'declined'])
    .withMessage('Status must be one of: pending, accepted, declined'),
  handleValidationErrors,
  clubController.getUserInvitations
);

/**
 * CLUB MANAGEMENT ENDPOINTS
 */

// Create a new club
router.post('/',
  authMiddleware,
  rateLimiter.createCustomLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 clubs per hour
    keyPrefix: 'create_club'
  }),
  body('name')
    .isLength({ min: 2, max: 100 })
    .trim()
    .escape()
    .withMessage('Club name must be 2-100 characters'),
  body('description')
    .isLength({ min: 10, max: 2000 })
    .trim()
    .escape()
    .withMessage('Description must be 10-2000 characters'),
  body('shortDescription')
    .optional()
    .isLength({ min: 10, max: 200 })
    .trim()
    .escape()
    .withMessage('Short description must be 10-200 characters'),
  body('category')
    .isLength({ min: 2, max: 50 })
    .trim()
    .withMessage('Category must be 2-50 characters'),
  body('subcategory')
    .optional()
    .isLength({ min: 2, max: 50 })
    .trim()
    .withMessage('Subcategory must be 2-50 characters'),
  body('tags')
    .optional()
    .isArray({ max: 10 })
    .withMessage('Tags must be an array with maximum 10 items'),
  body('tags.*')
    .optional()
    .isLength({ min: 2, max: 30 })
    .trim()
    .withMessage('Each tag must be 2-30 characters'),
  body('location.country')
    .optional()
    .isLength({ min: 2, max: 100 })
    .trim()
    .withMessage('Country must be 2-100 characters'),
  body('location.city')
    .optional()
    .isLength({ min: 2, max: 100 })
    .trim()
    .withMessage('City must be 2-100 characters'),
  body('location.isVirtual')
    .optional()
    .isBoolean()
    .withMessage('isVirtual must be a boolean'),
  body('settings.privacy.visibility')
    .isIn(['public', 'private', 'hidden'])
    .withMessage('Visibility must be public, private, or hidden'),
  body('settings.membership.requireApproval')
    .optional()
    .isBoolean()
    .withMessage('Require approval must be a boolean'),
  body('settings.membership.maxMembers')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('Max members must be between 1 and 10000'),
  body('clubWallet.membershipFee')
    .optional()
    .isFloat({ min: 0, max: 1000 })
    .withMessage('Membership fee must be between 0 and 1000'),
  handleValidationErrors,
  clubController.createClub
);

// Get club by ID or slug
router.get('/:identifier',
  param('identifier')
    .isLength({ min: 1, max: 100 })
    .trim()
    .withMessage('Club identifier is required'),
  handleValidationErrors,
  clubController.getClub
);

// Update club information (owners and admins only)
router.put('/:id',
  authMiddleware,
  param('id')
    .isMongoId()
    .withMessage('Invalid club ID'),
  body('name')
    .optional()
    .isLength({ min: 2, max: 100 })
    .trim()
    .escape()
    .withMessage('Club name must be 2-100 characters'),
  body('description')
    .optional()
    .isLength({ min: 10, max: 2000 })
    .trim()
    .escape()
    .withMessage('Description must be 10-2000 characters'),
  body('shortDescription')
    .optional()
    .isLength({ min: 10, max: 200 })
    .trim()
    .escape()
    .withMessage('Short description must be 10-200 characters'),
  body('category')
    .optional()
    .isLength({ min: 2, max: 50 })
    .trim()
    .withMessage('Category must be 2-50 characters'),
  body('tags')
    .optional()
    .isArray({ max: 10 })
    .withMessage('Tags must be an array with maximum 10 items'),
  body('contact.email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email format'),
  body('contact.phone')
    .optional()
    .isMobilePhone('any')
    .withMessage('Invalid phone number format'),
  body('contact.website')
    .optional()
    .isURL()
    .withMessage('Invalid website URL'),
  handleValidationErrors,
  clubController.updateClub
);

// Delete club (owners only)
router.delete('/:id',
  authMiddleware,
  param('id')
    .isMongoId()
    .withMessage('Invalid club ID'),
  handleValidationErrors,
  clubController.deleteClub
);

// Update club settings (owners and admins only)
router.patch('/:id/settings',
  authMiddleware,
  param('id')
    .isMongoId()
    .withMessage('Invalid club ID'),
  body('privacy.visibility')
    .optional()
    .isIn(['public', 'private', 'hidden'])
    .withMessage('Visibility must be public, private, or hidden'),
  body('membership.requireApproval')
    .optional()
    .isBoolean()
    .withMessage('Require approval must be a boolean'),
  body('membership.maxMembers')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('Max members must be between 1 and 10000'),
  body('content.allowEvents')
    .optional()
    .isBoolean()
    .withMessage('Allow events must be a boolean'),
  body('wallet.enabled')
    .optional()
    .isBoolean()
    .withMessage('Wallet enabled must be a boolean'),
  body('wallet.membershipFee')
    .optional()
    .isFloat({ min: 0, max: 1000 })
    .withMessage('Membership fee must be between 0 and 1000'),
  handleValidationErrors,
  clubController.updateClubSettings
);

/**
 * CLUB MEMBERSHIP ENDPOINTS
 */

// Join a club
router.post('/:id/join',
  authMiddleware,
  rateLimiter.createCustomLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 join requests per minute
    keyPrefix: 'join_club'
  }),
  param('id')
    .isMongoId()
    .withMessage('Invalid club ID'),
  body('message')
    .optional()
    .isLength({ min: 5, max: 500 })
    .trim()
    .escape()
    .withMessage('Join message must be 5-500 characters'),
  handleValidationErrors,
  clubController.joinClub
);

// Leave a club
router.post('/:id/leave',
  authMiddleware,
  param('id')
    .isMongoId()
    .withMessage('Invalid club ID'),
  body('reason')
    .optional()
    .isLength({ min: 5, max: 500 })
    .trim()
    .escape()
    .withMessage('Leave reason must be 5-500 characters'),
  handleValidationErrors,
  clubController.leaveClub
);

// Get club members
router.get('/:id/members',
  param('id')
    .isMongoId()
    .withMessage('Invalid club ID'),
  query('role')
    .optional()
    .isIn(['all', 'member', 'moderator', 'admin', 'owner'])
    .withMessage('Role must be one of: all, member, moderator, admin, owner'),
  query('status')
    .optional()
    .isIn(['all', 'active', 'inactive', 'banned', 'pending'])
    .withMessage('Status must be one of: all, active, inactive, banned, pending'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  handleValidationErrors,
  clubController.getClubMembers
);

// Update member role (admins and owners only)
router.patch('/:id/members/:memberId/role',
  authMiddleware,
  param('id')
    .isMongoId()
    .withMessage('Invalid club ID'),
  param('memberId')
    .isMongoId()
    .withMessage('Invalid member ID'),
  body('role')
    .isIn(['member', 'moderator', 'admin'])
    .withMessage('Role must be member, moderator, or admin'),
  handleValidationErrors,
  clubController.updateMemberRole
);

// Update member status (moderators, admins, and owners only)
router.patch('/:id/members/:memberId/status',
  authMiddleware,
  param('id')
    .isMongoId()
    .withMessage('Invalid club ID'),
  param('memberId')
    .isMongoId()
    .withMessage('Invalid member ID'),
  body('status')
    .isIn(['active', 'inactive', 'banned'])
    .withMessage('Status must be active, inactive, or banned'),
  body('reason')
    .optional()
    .isLength({ min: 5, max: 500 })
    .trim()
    .escape()
    .withMessage('Reason must be 5-500 characters'),
  handleValidationErrors,
  clubController.updateMemberStatus
);

// Remove member from club (moderators, admins, and owners only)
router.delete('/:id/members/:memberId',
  authMiddleware,
  param('id')
    .isMongoId()
    .withMessage('Invalid club ID'),
  param('memberId')
    .isMongoId()
    .withMessage('Invalid member ID'),
  body('reason')
    .optional()
    .isLength({ min: 5, max: 500 })
    .trim()
    .escape()
    .withMessage('Reason must be 5-500 characters'),
  handleValidationErrors,
  clubController.removeMember
);

/**
 * CLUB INVITATION ENDPOINTS
 */

// Send club invitations (members with permission, moderators, admins, owners)
router.post('/:id/invitations',
  authMiddleware,
  rateLimiter.createCustomLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 invitations per hour
    keyPrefix: 'club_invite'
  }),
  param('id')
    .isMongoId()
    .withMessage('Invalid club ID'),
  body('recipients')
    .isArray({ min: 1, max: 10 })
    .withMessage('Recipients must be an array with 1-10 items'),
  body('recipients.*')
    .isEmail()
    .normalizeEmail()
    .withMessage('Each recipient must be a valid email'),
  body('message')
    .optional()
    .isLength({ min: 10, max: 500 })
    .trim()
    .escape()
    .withMessage('Invitation message must be 10-500 characters'),
  handleValidationErrors,
  clubController.sendInvitations
);

// Get club invitations (admins and owners only)
router.get('/:id/invitations',
  authMiddleware,
  param('id')
    .isMongoId()
    .withMessage('Invalid club ID'),
  query('status')
    .optional()
    .isIn(['pending', 'accepted', 'declined', 'expired'])
    .withMessage('Status must be one of: pending, accepted, declined, expired'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  handleValidationErrors,
  clubController.getClubInvitations
);

// Accept club invitation
router.post('/invitations/:invitationId/accept',
  authMiddleware,
  param('invitationId')
    .isMongoId()
    .withMessage('Invalid invitation ID'),
  handleValidationErrors,
  clubController.acceptInvitation
);

// Decline club invitation
router.post('/invitations/:invitationId/decline',
  authMiddleware,
  param('invitationId')
    .isMongoId()
    .withMessage('Invalid invitation ID'),
  body('reason')
    .optional()
    .isLength({ min: 5, max: 200 })
    .trim()
    .escape()
    .withMessage('Decline reason must be 5-200 characters'),
  handleValidationErrors,
  clubController.declineInvitation
);

/**
 * CLUB MEDIA ENDPOINTS
 */

// Upload club cover image (admins and owners only)
router.post('/:id/media/cover',
  authMiddleware,
  param('id')
    .isMongoId()
    .withMessage('Invalid club ID'),
  upload.single('cover'),
  handleValidationErrors,
  clubController.uploadCoverImage
);

// Upload club logo (admins and owners only)
router.post('/:id/media/logo',
  authMiddleware,
  param('id')
    .isMongoId()
    .withMessage('Invalid club ID'),
  upload.single('logo'),
  handleValidationErrors,
  clubController.uploadLogo
);

// Upload gallery images (admins and owners only)
router.post('/:id/media/gallery',
  authMiddleware,
  param('id')
    .isMongoId()
    .withMessage('Invalid club ID'),
  upload.array('images', 5), // Max 5 images
  body('captions')
    .optional()
    .isArray()
    .withMessage('Captions must be an array'),
  handleValidationErrors,
  clubController.uploadGalleryImages
);

// Delete gallery image (admins and owners only)
router.delete('/:id/media/gallery/:imageId',
  authMiddleware,
  param('id')
    .isMongoId()
    .withMessage('Invalid club ID'),
  param('imageId')
    .isMongoId()
    .withMessage('Invalid image ID'),
  handleValidationErrors,
  clubController.deleteGalleryImage
);

/**
 * CLUB ANALYTICS ENDPOINTS
 */

// Get club analytics (admins and owners only)
router.get('/:id/analytics',
  authMiddleware,
  param('id')
    .isMongoId()
    .withMessage('Invalid club ID'),
  query('period')
    .optional()
    .isIn(['day', 'week', 'month', 'quarter', 'year'])
    .withMessage('Period must be one of: day, week, month, quarter, year'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  handleValidationErrors,
  clubController.getClubAnalytics
);

// Get member activity analytics (admins and owners only)
router.get('/:id/analytics/members',
  authMiddleware,
  param('id')
    .isMongoId()
    .withMessage('Invalid club ID'),
  query('period')
    .optional()
    .isIn(['day', 'week', 'month'])
    .withMessage('Period must be one of: day, week, month'),
  handleValidationErrors,
  clubController.getMemberActivityAnalytics
);

/**
 * CLUB MODERATION ENDPOINTS
 */

// Report club (authenticated users)
router.post('/:id/report',
  authMiddleware,
  rateLimiter.createCustomLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 reports per hour per user
    keyPrefix: 'report_club'
  }),
  param('id')
    .isMongoId()
    .withMessage('Invalid club ID'),
  body('reason')
    .isIn(['inappropriate_content', 'harassment', 'spam', 'fake_profile', 'other'])
    .withMessage('Invalid report reason'),
  body('description')
    .isLength({ min: 10, max: 1000 })
    .trim()
    .escape()
    .withMessage('Description must be 10-1000 characters'),
  handleValidationErrors,
  clubController.reportClub
);

// Get club reports (admin only - handled by admin routes)
// Block/unblock club (admin only - handled by admin routes)

/**
 * ERROR HANDLING MIDDLEWARE
 */
router.use((error, req, res, next) => {
  console.error('Club route error:', error);
  res.status(500).json({
    success: false,
    message: 'Club service error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
  });
});

module.exports = router;
