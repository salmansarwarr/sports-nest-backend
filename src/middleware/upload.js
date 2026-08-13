const multer = require('multer');

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ATTACHMENT_MIME_TYPES = [...IMAGE_MIME_TYPES, 'application/pdf'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        if (!IMAGE_MIME_TYPES.includes(file.mimetype)) {
            return cb(new Error('Only JPEG, PNG, WEBP, and GIF images are allowed'));
        }
        cb(null, true);
    },
});

// Broader file-type support for user-submitted attachments (support ticket
// screenshots, PDF receipts, etc.), as opposed to the image-only `upload`
// above which is used for avatars/media.
const uploadAttachments = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE, files: 5 },
    fileFilter: (req, file, cb) => {
        if (!ATTACHMENT_MIME_TYPES.includes(file.mimetype)) {
            return cb(new Error('Only JPEG, PNG, WEBP, GIF images and PDF files are allowed'));
        }
        cb(null, true);
    },
});

module.exports = upload;
module.exports.uploadAttachments = uploadAttachments;
