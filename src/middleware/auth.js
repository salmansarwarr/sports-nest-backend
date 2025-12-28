const User = require('../models/User.js');
const JWTUtils = require('../utils/jwt.js');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const token = authHeader.substring(7);
    const decoded = JWTUtils.verifyAccessToken(token);
    
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

const requireEmailVerification = (req, res, next) => {
  if (!req.user.isEmailVerified) {
    return res.status(403).json({
      success: false,
      message: 'Email verification required',
      code: 'EMAIL_NOT_VERIFIED'
    });
  }
  next();
};

// Optional authentication - sets req.user if token is valid, but doesn't fail if no token
const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without setting req.user
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = JWTUtils.verifyAccessToken(token);
    
    const user = await User.findById(decoded.userId);
    if (user && user.isActive) {
      req.user = user;
    }
    // If user not found or inactive, just continue without setting req.user
    next();
  } catch (error) {
    // If token is invalid, just continue without setting req.user
    next();
  }
};

module.exports = {
  authenticate,
  authorize,
  requireEmailVerification,
  optionalAuthenticate
};