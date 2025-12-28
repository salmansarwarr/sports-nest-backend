const express = require("express");
const rateLimit = require("express-rate-limit");
const AuthController = require("../controllers/authController.js");
const { authenticate } = require("../middleware/auth.js");
const Validation = require("../middleware/validation");
const passport = require("passport");
const JWTUtils = require("../utils/jwt.js");

const {
    register,
    login,
    refreshToken,
    logout,
    logoutAll,
    getProfile,
    updateProfile,
    changePassword,
    forgotPassword,
    resetPassword,
    verifyEmail,
    resendVerificationEmail,
} = AuthController;

const {
    registerValidation,
    loginValidation,
    forgotPasswordValidation,
    resetPasswordValidation,
    updateProfileValidation,
    changePasswordValidation,
} = Validation;

const router = express.Router();

// Rate limiting (disabled in development)
const isDevelopment = process.env.NODE_ENV === 'development' || process.env.DISABLE_RATE_LIMIT === 'true';

// Bypass middleware for development
const bypassLimiter = (req, res, next) => next();

const authLimiter = isDevelopment ? bypassLimiter : rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: {
        success: false,
        message: "Too many authentication attempts, please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const generalLimiter = isDevelopment ? bypassLimiter : rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: {
        success: false,
        message: "Too many requests, please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: User ID
 *         firstName:
 *           type: string
 *           description: User's first name
 *         lastName:
 *           type: string
 *           description: User's last name
 *         email:
 *           type: string
 *           format: email
 *           description: User's email address
 *         phone:
 *           type: string
 *           description: User's phone number
 *         dateOfBirth:
 *           type: string
 *           format: date
 *           description: User's date of birth
 *         isEmailVerified:
 *           type: boolean
 *           description: Email verification status
 *         role:
 *           type: string
 *           enum: [user, admin]
 *           description: User role
 *         isActive:
 *           type: boolean
 *           description: Account status
 *         profilePicture:
 *           type: object
 *           properties: 
 *             url:
 *               type: string
 *               example: https://res.cloudinary.com/your-cloud-name/image/upload/v1620000000/user123.jpg
 *             publicId: 
 *               type: string
 *               example: user123
 *         gender:
 *           type: string
 *           enum: [male, female, other]
 *           example: "male"
 *         provider:
 *           type: string
 *           enum: [manual, google]
 *           default: manual
 *         googleId:
 *           type: string
 *           description: Google ID if registered via Google
 *         lastLogin:
 *           type: string
 *           format: date-time
 *           description: Last login timestamp
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Account creation timestamp
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Last update timestamp
 *
 *     AuthTokens:
 *       type: object
 *       properties:
 *         accessToken:
 *           type: string
 *           description: JWT access token
 *         refreshToken:
 *           type: string
 *           description: JWT refresh token
 *
 *     ApiResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Operation success status
 *         message:
 *           type: string
 *           description: Response message
 *         data:
 *           type: object
 *           description: Response data
 *
 *     ValidationError:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *           example: "Validation failed"
 *         errors:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               field:
 *                 type: string
 *               message:
 *                 type: string
 *               value:
 *                 type: string
 *
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - password
 *               - confirmPassword
 *               - gender
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: John
 *               lastName:
 *                 type: string
 *                 example: Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@example.com
 *               password:
 *                 type: string
 *                 example: Password123!
 *               confirmPassword:
 *                 type: string
 *                 example: Password123!
 *               phone:
 *                 type: string
 *                 example: +1234567890
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 example: 1990-01-01
 *               profilePicture:
 *                 type: object
 *                 required:
 *                   - url
 *                   - publicId
 *                 properties: 
 *                    url:
 *                      type: string
 *                      example: https://res.cloudinary.com/your-cloud-name/image/upload/v1620000000/user123.jpg
 *                    publicId: 
 *                      type: string
 *                      example: user123
 *               gender:
 *                 type: string
 *                 enum: [male, female, other]
 *                 example: "male"
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         user:
 *                           $ref: '#/components/schemas/User'
 *                         tokens:
 *                           $ref: '#/components/schemas/AuthTokens'
 *       400:
 *         description: Validation error or user already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       429:
 *         description: Too many requests
 */
router.post("/register", registerValidation, register);

/**
 * @swagger
 * /api/auth/google:
 *   get:
 *     summary: Start Google OAuth authentication
 *     tags: [Authentication]
 *     description: Redirects the user to Google for authentication. The user will be asked to authorize access to their profile and email.
 *     responses:
 *       302:
 *         description: Redirects to Google OAuth login page
 */
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// Google callback
router.get('/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: '/login' }),
    async (req, res) => {
      const user = req.user;
  
      // Generate your JWT tokens here
      const tokens = JWTUtils.generateTokenPair(user._id);
      user.addRefreshToken(tokens.refreshToken);
      await user.save();
  
      // Return the token as a redirect or JSON (for frontend use)
      res.redirect(`http://127.0.0.1:5500/index.html?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`);
    }
);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "john.doe@example.com"
 *               password:
 *                 type: string
 *                 example: "Password123!"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         user:
 *                           $ref: '#/components/schemas/User'
 *                         tokens:
 *                           $ref: '#/components/schemas/AuthTokens'
 *       401:
 *         description: Invalid credentials
 *       429:
 *         description: Too many login attempts
 */
router.post("/login", loginValidation, login);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Valid refresh token
 *     responses:
 *       200:
 *         description: Tokens refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         tokens:
 *                           $ref: '#/components/schemas/AuthTokens'
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post("/refresh", generalLimiter, refreshToken);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Refresh token to invalidate
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       401:
 *         description: Authentication required
 */
router.post("/logout", authenticate, logout);

/**
 * @swagger
 * /api/auth/logout-all:
 *   post:
 *     summary: Logout from all devices
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out from all devices successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       401:
 *         description: Authentication required
 */
router.post("/logout-all", authenticate, logoutAll);

/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     summary: Get current user profile
 *     tags: [User Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         user:
 *                           $ref: '#/components/schemas/User'
 *       401:
 *         description: Authentication required
 */
router.get("/profile", authenticate, getProfile);

/**
 * @swagger
 * /api/auth/profile:
 *   put:
 *     summary: Update user profile
 *     tags: [User Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 50
 *                 example: "John"
 *               lastName:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 50
 *                 example: "Doe"
 *               phone:
 *                 type: string
 *                 pattern: '^\+?[\d\s-()]+'
 *                 example: "+1234567890"
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 example: "1990-01-01"
 *               profilePicture:
 *                 type: object
 *                 required:
 *                   - url
 *                   - publicId
 *                 properties: 
 *                    url:
 *                      type: string
 *                      example: https://res.cloudinary.com/your-cloud-name/image/upload/v1620000000/user123.jpg
 *                    publicId: 
 *                      type: string
 *                      example: user123
 *               gender:
 *                 type: string
 *                 enum: [male, female, other]
 *                 example: "male"
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         user:
 *                           $ref: '#/components/schemas/User'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 */
router.put("/profile", authenticate, updateProfileValidation, updateProfile);

/**
 * @swagger
 * /api/auth/change-password:
 *   put:
 *     summary: Change user password
 *     tags: [User Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *               - confirmNewPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 example: "CurrentPassword123!"
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]'
 *                 example: "NewPassword123!"
 *               confirmNewPassword:
 *                 type: string
 *                 example: "NewPassword123!"
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Validation error or incorrect current password
 *       401:
 *         description: Authentication required
 */
router.put(
    "/change-password",
    authenticate,
    changePasswordValidation,
    changePassword
);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     tags: [Password Reset]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "john.doe@example.com"
 *     responses:
 *       200:
 *         description: Password reset link sent (if email exists)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Validation error
 *       500:
 *         description: Email sending failed
 */
router.post(
    "/forgot-password",
    generalLimiter,
    forgotPasswordValidation,
    forgotPassword
);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password using token
 *     tags: [Password Reset]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - password
 *               - confirmPassword
 *             properties:
 *               token:
 *                 type: string
 *                 description: Password reset token from email
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]'
 *                 example: "NewPassword123!"
 *               confirmPassword:
 *                 type: string
 *                 example: "NewPassword123!"
 *     responses:
 *       200:
 *         description: Password reset successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Invalid or expired reset token
 */
router.post(
    "/reset-password",
    
    resetPasswordValidation,
    resetPassword
);

/**
 * @swagger
 * /api/auth/verify-email:
 *   get:
 *     summary: Verify email address
 *     tags: [Email Verification]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Email verification token
 *     responses:
 *       200:
 *         description: Email verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Invalid or expired verification token
 */
router.get("/verify-email", verifyEmail);

/**
 * @swagger
 * /api/auth/resend-verification:
 *   post:
 *     summary: Resend email verification
 *     tags: [Email Verification]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Verification email sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Email already verified
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Email sending failed
 */
router.post("/resend-verification", authenticate, resendVerificationEmail);

module.exports = router;
