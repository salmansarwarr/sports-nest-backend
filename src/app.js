const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const connectDB = require('./config/database.js');
const authRoutes = require('./routes/authRoutes.js');
const venueRoutes = require('./routes/venueRoutes');
const courtRoutes = require('./routes/courtRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const favoriteRoutes = require('./routes/favoriteRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const promoCodeRoutes = require('./routes/promoCodeRoutes');
const paymentController = require('./controllers/paymentController');
const errorHandler = require('./middleware/errorHandler.js');

const passport = require('passport');
require('./config/passport'); // load strategy

const app = express();

// Google auth
app.use(passport.initialize());

// Connect to database
if (process.env.NODE_ENV !== 'test') {
    connectDB();
}

// Security middleware
app.use(helmet());

const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
    : ['http://localhost:3000', 'http://127.0.0.1:5500'];

app.use(
    cors({
        origin: corsOrigins,
        credentials: true,
    })
);

// Global rate limiting (disabled in development)
if (process.env.NODE_ENV !== 'development' && process.env.DISABLE_RATE_LIMIT !== 'true') {
    const globalLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
        message: {
            success: false,
            message: "Too many requests from this IP, please try again later.",
        },
        standardHeaders: true,
        legacyHeaders: false,
    });

    app.use(globalLimiter);
}

// Stripe webhook - MUST be mounted before express.json() with a raw body
// parser, since Stripe signature verification needs the raw request bytes.
// Do not move this below express.json() or add a duplicate /webhook route
// inside paymentRoutes.js.
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), paymentController.handleWebhook);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Swagger configuration
const swaggerOptions = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Court Booking API",
            version: "1.0.0",
            description:
                "API for court booking system with authentication and user management",
            contact: {
                name: "API Support",
                email: "support@courtbooking.com",
            },
        },
        servers: [
            {
                url:
                    process.env.NODE_ENV === "production"
                        ? "https://sports-nest-backend.vercel.app/"
                        : `http://localhost:${process.env.PORT || 3000}`,
                description:
                    process.env.NODE_ENV === "production"
                        ? "Production server"
                        : "Development server",
            },
        ],
        components:
            process.env.NODE_ENV === "production"
                ? {
                    securitySchemes: {
                        bearerAuth: {
                            type: "http",
                            scheme: "bearer",
                            bearerFormat: "JWT",
                        },
                    },
                }
                : {},
        tags: [
            { name: 'Auth', description: 'Authentication endpoints' },
            { name: 'Venues', description: 'Venue management endpoints' },
            { name: 'Courts', description: 'Court management endpoints' },
            { name: 'Bookings', description: 'Booking management endpoints' },
            { name: 'Reviews', description: 'Court review and rating endpoints' },
            { name: 'Favorites', description: 'Favorites/wishlist endpoints' },
            { name: 'Payments', description: 'Payment processing, history, and receipts' },
            { name: 'PromoCodes', description: 'Promotional/coupon code management' }
        ]
    },
    apis: ["./src/routes/*.js"],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Swagger UI
app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
        customCss: ".swagger-ui .topbar { display: none }",
        customSiteTitle: "Court Booking API Documentation",
        customCssUrl: "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css",
    })
);

// Health check endpoint
app.get("/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Court Booking API is running",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
    });
});

app.get("/", (req, res) => {
    res.status(200).send("Server is running");
});

// API routes
app.use("/api/auth", authRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/courts', courtRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/promo-codes', promoCodeRoutes);

// 404 handler
app.use(/('*')/, (req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found",
    });
});

// Global error handler
app.use(errorHandler);

module.exports = app;