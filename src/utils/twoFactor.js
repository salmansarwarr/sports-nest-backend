const crypto = require('crypto');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');

const BACKUP_CODE_COUNT = 10;
const ISSUER = 'SportsNest';

// hash idiom mirrors User.js's createPasswordResetToken - only sha256
// hashes are ever persisted, raw codes are shown to the user exactly once.
const hashCode = (code) => crypto.createHash('sha256').update(code).digest('hex');

exports.generateSecret = () => authenticator.generateSecret();

exports.getQrCodeDataUrl = async (email, secret) => {
    const otpauthUrl = authenticator.keyuri(email, ISSUER, secret);
    return QRCode.toDataURL(otpauthUrl);
};

exports.verifyTotp = (token, secret) => {
    try {
        return authenticator.verify({ token, secret });
    } catch (error) {
        // otplib throws on a malformed (non-numeric/wrong-length) token
        // rather than just returning false.
        return false;
    }
};

// Returns { plaintext: string[], hashed: [{codeHash}] } - plaintext is
// returned to the caller exactly once (the enable response), only the
// hashed form is ever persisted.
exports.generateBackupCodes = () => {
    const plaintext = Array.from({ length: BACKUP_CODE_COUNT }, () =>
        crypto.randomBytes(5).toString('hex').toUpperCase()
    );
    const hashed = plaintext.map((code) => ({ codeHash: hashCode(code) }));
    return { plaintext, hashed };
};

// Finds and consumes (marks used) a matching unused backup code in-place on
// the user document. Returns true if a match was found; caller is
// responsible for saving the user afterward. Mirrors the single-use
// consumption semantics implied by usedAt.
exports.consumeBackupCode = (user, code) => {
    const codeHash = hashCode(code.toUpperCase());
    const match = user.twoFactorAuth.backupCodes.find((bc) => bc.codeHash === codeHash && !bc.usedAt);
    if (!match) return false;
    match.usedAt = new Date();
    return true;
};
