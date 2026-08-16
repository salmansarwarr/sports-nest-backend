const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;

    logger.error(err.message, { stack: err.stack, path: req.originalUrl, method: req.method });

    // Mongoose bad ObjectId
    if (err.name === "CastError") {
        const message = "Resource not found";
        error = { message, statusCode: 404 };
    }

    // Mongoose duplicate key
    if (err.code === 11000) {
        let message = "Duplicate field value entered";

        if (err.keyPattern && err.keyPattern.email) {
            message = "Email address is already registered";
        }

        error = { message, statusCode: 400 };
    }

    // Mongoose validation error
    if (err.name === "ValidationError") {
        const message = Object.values(err.errors)
            .map((val) => val.message)
            .join(", ");
        error = { message, statusCode: 400 };
    }

    // JWT errors
    if (err.name === "JsonWebTokenError") {
        const message = "Invalid token";
        error = { message, statusCode: 401 };
    }

    if (err.name === "TokenExpiredError") {
        const message = "Token expired";
        error = { message, statusCode: 401 };
    }

    // Multer upload errors (size/count limits, or our fileFilter rejections)
    if (err.name === "MulterError" || err.message?.includes('are allowed')) {
        error = { message: err.message, statusCode: 400 };
    }

    // Stripe SDK errors carry their own HTTP-like statusCode. A card decline
    // (StripeCardError, statusCode 402) is customer-actionable and safe to
    // pass through as-is. Anything else - especially StripeAuthenticationError
    // (401, e.g. a missing/invalid STRIPE_SECRET_KEY) and StripePermissionError
    // (403) - must NOT be forwarded verbatim: those status codes collide with
    // our own auth semantics, and the frontend's axios interceptor treats any
    // 401 response as "the user's session token is invalid" and logs them
    // out, even though the real problem is our Stripe configuration, not
    // their session.
    if (err.type && String(err.type).startsWith('Stripe') && err.type !== 'StripeCardError') {
        error = {
            message: 'Payment processing is temporarily unavailable. Please try again later.',
            statusCode: 502
        };
    }

    res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Server Error",
    });
};

module.exports = errorHandler;
