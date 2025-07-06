const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const connectDB = require('./config/database.js');
const authRoutes = require('./routes/authRoutes.js');
const errorHandler = require('./middleware/errorHandler.js');

const pathToSwaggerUi = require('swagger-ui-dist').absolutePath()

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

app.use('/api-docs/swagger-assets', express.static(pathToSwaggerUi))

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
                        ? "https://sports-nest-backend-ifpj.vercel.app"
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
        // We'll use customCssUrl and customJs to point to our *own* served assets
        customCssUrl: '/api-docs/swagger-assets/swagger-ui.css',
        customJs: '/api-docs/swagger-assets/swagger-ui-bundle.js',
        customJsStr: '/api-docs/swagger-assets/swagger-ui-standalone-preset.js', // Also include the preset if you use it
        // Ensure you include any other JS files swagger-ui-express might load by default
        // based on its source code or common usage.
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