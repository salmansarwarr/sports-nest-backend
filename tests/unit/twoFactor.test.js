const { authenticator } = require('otplib');
const User = require('../../src/models/User');
const AuditLog = require('../../src/models/AuditLog');
const {
    setupTwoFactor,
    enableTwoFactor,
    disableTwoFactor,
    getTwoFactorStatus,
} = require('../../src/controllers/authController');

describe('Two-Factor Authentication', () => {
    let user, mockReq, mockRes, mockNext;

    beforeEach(async () => {
        user = await User.create({
            firstName: 'Regular', lastName: 'User', email: 'user@example.com',
            password: 'Password123!', role: 'user'
        });

        mockReq = { body: {}, params: {}, query: {}, user: null };
        mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        mockNext = jest.fn();
    });

    describe('setupTwoFactor', () => {
        it('should generate a pending secret and a QR code data URL', async () => {
            mockReq.user = user;

            await setupTwoFactor(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            const response = mockRes.json.mock.calls[0][0];
            expect(response.data.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
            expect(response.data.manualEntryKey).toEqual(expect.any(String));

            const reloaded = await User.findById(user._id).select('+twoFactorAuth.pendingSecret');
            expect(reloaded.twoFactorAuth.pendingSecret).toBe(response.data.manualEntryKey);
        });

        it('should reject setup if 2FA is already enabled', async () => {
            user.twoFactorAuth.enabled = true;
            await user.save();
            mockReq.user = user;

            await setupTwoFactor(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });
    });

    describe('enableTwoFactor', () => {
        it('should enable 2FA and return backup codes given a valid code', async () => {
            mockReq.user = user;
            await setupTwoFactor(mockReq, mockRes, mockNext);
            const { manualEntryKey } = mockRes.json.mock.calls[0][0].data;

            mockRes.json.mockClear();
            mockReq.user = await User.findById(user._id);
            mockReq.body = { code: authenticator.generate(manualEntryKey) };

            await enableTwoFactor(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            const response = mockRes.json.mock.calls[0][0];
            expect(response.data.backupCodes).toHaveLength(10);

            const reloaded = await User.findById(user._id).select('+twoFactorAuth.secret');
            expect(reloaded.twoFactorAuth.enabled).toBe(true);
            expect(reloaded.twoFactorAuth.secret).toBe(manualEntryKey);
            expect(reloaded.twoFactorAuth.backupCodes).toHaveLength(10);

            const auditEntry = await AuditLog.findOne({ action: 'user.2fa_enabled', resourceId: user._id });
            expect(auditEntry).not.toBeNull();
        });

        it('should reject an invalid code', async () => {
            mockReq.user = user;
            await setupTwoFactor(mockReq, mockRes, mockNext);

            mockRes.json.mockClear();
            mockReq.user = await User.findById(user._id);
            mockReq.body = { code: '000000' };

            await enableTwoFactor(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);

            const reloaded = await User.findById(user._id);
            expect(reloaded.twoFactorAuth.enabled).toBe(false);
        });

        it('should reject enabling without a prior setup call', async () => {
            mockReq.user = user;
            mockReq.body = { code: '123456' };

            await enableTwoFactor(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });
    });

    describe('disableTwoFactor', () => {
        beforeEach(async () => {
            const secret = authenticator.generateSecret();
            user.twoFactorAuth.secret = secret;
            user.twoFactorAuth.enabled = true;
            user.twoFactorAuth.backupCodes = [{ codeHash: 'somehash' }];
            await user.save();
        });

        it('should disable 2FA after re-verifying the password', async () => {
            mockReq.user = await User.findById(user._id);
            mockReq.body = { password: 'Password123!' };

            await disableTwoFactor(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);

            const reloaded = await User.findById(user._id);
            expect(reloaded.twoFactorAuth.enabled).toBe(false);
            expect(reloaded.twoFactorAuth.backupCodes).toHaveLength(0);

            const auditEntry = await AuditLog.findOne({ action: 'user.2fa_disabled', resourceId: user._id });
            expect(auditEntry).not.toBeNull();
        });

        it('should reject an incorrect password', async () => {
            mockReq.user = await User.findById(user._id);
            mockReq.body = { password: 'WrongPassword!' };

            await disableTwoFactor(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);

            const reloaded = await User.findById(user._id);
            expect(reloaded.twoFactorAuth.enabled).toBe(true);
        });
    });

    describe('getTwoFactorStatus', () => {
        it('should report disabled by default', async () => {
            mockReq.user = user;

            await getTwoFactorStatus(mockReq, mockRes, mockNext);

            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                data: { enabled: false }
            }));
        });
    });
});
