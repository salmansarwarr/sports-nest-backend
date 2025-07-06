const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const connectDB = require('./config/database.js');
const authRoutes = require('./routes/authRoutes.js');
const errorHandler = require('./middleware/errorHandler.js');

const passport = require('passport');
require('./config/passport'); // load strategy

const app = express();

// Google auth
app.use(passport.initialize());

// Connect to database
connectDB();

// Security middleware
app.use(helmet());
app.use(
    cors({
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        credentials: true,
    })
);

// Global rate limiting
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
                        ? "https://api.courtbooking.com"
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
    },
    apis: ["./src/routes/*.js"],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Swagger UI
app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
        // customCssUrl: "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.1.0/swagger-ui.min.css",
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