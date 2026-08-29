const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { randomUUID } = require('crypto');
const path = require('path');

// Cloudflare R2 is S3-compatible; the endpoint is:
//   https://<accountId>.r2.cloudflarestorage.com
const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    },
});

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME;

// Public base URL for the bucket (R2.dev subdomain or custom domain).
// e.g. https://pub-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.r2.dev
//   or https://assets.yourdomain.com
const PUBLIC_URL = (process.env.CLOUDFLARE_R2_PUBLIC_URL || '').replace(/\/$/, '');

/**
 * Upload a buffer to R2.
 *
 * @param {Buffer} buffer        File content
 * @param {object} options
 * @param {string} options.folder  Logical folder prefix (no trailing slash)
 * @param {string} [options.filename]  Original filename; used to preserve the extension.
 *                                     Defaults to a random UUID with no extension.
 * @param {string} [options.contentType]  MIME type (e.g. 'image/jpeg').
 * @returns {Promise<{ url: string, key: string }>}
 */
const uploadToR2 = async (buffer, options = {}) => {
    const { folder = 'uploads', filename, contentType } = options;

    const ext = filename ? path.extname(filename) : '';
    const key = `${folder}/${randomUUID()}${ext}`;

    const upload = new Upload({
        client: s3,
        params: {
            Bucket: BUCKET,
            Key: key,
            Body: buffer,
            ContentType: contentType || 'application/octet-stream',
        },
    });

    await upload.done();

    return {
        key,
        url: `${PUBLIC_URL}/${key}`,
    };
};

/**
 * Delete an object from R2 by its key.
 *
 * @param {string} key  The R2 object key (as returned by uploadToR2)
 */
const deleteFromR2 = async (key) => {
    if (!key) return;
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
};

module.exports = { uploadToR2, deleteFromR2 };
