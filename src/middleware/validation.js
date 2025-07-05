const { body, validationResult } = require("express-validator");

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: "Validation failed",
            errors: errors.array().map((error) => ({
                field: error.path,
                message: error.msg,
                value: error.value,
            })),
        });
    }
    next();
};

const registerValidation = [
    body("firstName")
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage("First name must be between 2 and 50 characters")
        .matches(/^[a-zA-Z\s]+$/)
        .withMessage("First name can only contain letters and spaces"),

    body("lastName")
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage("Last name must be between 2 and 50 characters")
        .matches(/^[a-zA-Z\s]+$/)
        .withMessage("Last name can only contain letters and spaces"),

    body("email")
        .isEmail()
        .normalizeEmail()
        .withMessage("Please provide a valid email address"),

    body("password")
        .optional()
        .isLength({ min: 8 })
        .withMessage("Password must be at least 8 characters long")
        .matches(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/
        )
        .withMessage(
            "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character"
        ),

    body("confirmPassword").optional().custom((value, { req }) => {
        if (value !== req.body.password) {
            throw new Error("Password confirmation does not match password");
        }
        return true;
    }),

    body("phone")
        .optional()
        .matches(/^\+?[\d\s-()]+$/)
        .withMessage("Please provide a valid phone number"),

    body("dateOfBirth")
        .optional()
        .isISO8601()
        .withMessage("Please provide a valid date of birth")
        .custom((value) => {
            if (new Date(value) >= new Date()) {
                throw new Error("Date of birth must be in the past");
            }
            return true;
        }),

    body("gender")
        .isIn(["male", "female", "other"])
        .withMessage("Gender must be either male, female, or other"),

    body("profilePicture.url")
        .optional()
        .isURL()
        .withMessage("Profile picture must be a valid URL"),

    body("profilePicture.publicId")
        .optional()
        .isString()
        .withMessage("Profile picture publicId must be a string"),

    handleValidationErrors,
];

const loginValidation = [
    body("email")
        .isEmail()
        .normalizeEmail()
        .withMessage("Please provide a valid email address"),

    body("password").notEmpty().withMessage("Password is required"),

    handleValidationErrors,
];

const forgotPasswordValidation = [
    body("email")
        .isEmail()
        .normalizeEmail()
        .withMessage("Please provide a valid email address"),

    handleValidationErrors,
];

const resetPasswordValidation = [
    body("token").notEmpty().withMessage("Reset token is required"),

    body("password")
        .isLength({ min: 8 })
        .withMessage("Password must be at least 8 characters long")
        .matches(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/
        )
        .withMessage(
            "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character"
        ),

    body("confirmPassword").custom((value, { req }) => {
        if (value !== req.body.password) {
            throw new Error("Password confirmation does not match password");
        }
        return true;
    }),

    handleValidationErrors,
];

const updateProfileValidation = [
    body("firstName")
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage("First name must be between 2 and 50 characters")
        .matches(/^[a-zA-Z\s]+$/)
        .withMessage("First name can only contain letters and spaces"),

    body("lastName")
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage("Last name must be between 2 and 50 characters")
        .matches(/^[a-zA-Z\s]+$/)
        .withMessage("Last name can only contain letters and spaces"),

    body("phone")
        .optional()
        .matches(/^\+?[\d\s-()]+$/)
        .withMessage("Please provide a valid phone number"),

    body("dateOfBirth")
        .optional()
        .isISO8601()
        .withMessage("Please provide a valid date of birth")
        .custom((value) => {
            if (new Date(value) >= new Date()) {
                throw new Error("Date of birth must be in the past");
            }
            return true;
        }),

    body("gender")
        .optional()
        .isIn(["male", "female", "other"])
        .withMessage("Gender must be either male, female, or other"),

    body("profilePicture.url")
        .optional()
        .isURL()
        .withMessage("Profile picture must be a valid URL"),

    body("profilePicture.publicId")
        .optional()
        .isString()
        .withMessage("Profile picture publicId must be a string"),

    handleValidationErrors,
];

const changePasswordValidation = [
    body("currentPassword")
        .notEmpty()
        .withMessage("Current password is required"),

    body("newPassword")
        .isLength({ min: 8 })
        .withMessage("New password must be at least 8 characters long")
        .matches(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/
        )
        .withMessage(
            "New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character"
        ),

    body("confirmNewPassword").custom((value, { req }) => {
        if (value !== req.body.newPassword) {
            throw new Error(
                "Password confirmation does not match new password"
            );
        }
        return true;
    }),

    handleValidationErrors,
];

module.exports = {
    registerValidation,
    loginValidation,
    forgotPasswordValidation,
    resetPasswordValidation,
    updateProfileValidation,
    changePasswordValidation,
};
