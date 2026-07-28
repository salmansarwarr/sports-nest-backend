const AuditLog = require('../../src/models/AuditLog');
const User = require('../../src/models/User');
const auditLog = require('../../src/utils/auditLog');

describe('auditLog.record', () => {
    let user;

    beforeEach(async () => {
        user = await User.create({
            firstName: 'Admin', lastName: 'User', email: 'audituser@example.com',
            password: 'Password123!', role: 'admin'
        });
    });

    it('should create an audit log entry with the given fields', async () => {
        const fakeResourceId = new (require('mongoose').Types.ObjectId)();

        await auditLog.record({
            actor: user,
            action: 'promo_code.created',
            resourceType: 'PromoCode',
            resourceId: fakeResourceId,
            changes: { code: 'SAVE10' },
            req: { ip: '127.0.0.1', get: () => 'test-agent' }
        });

        const entry = await AuditLog.findOne({ action: 'promo_code.created' });
        expect(entry).not.toBeNull();
        expect(entry.actor.toString()).toBe(user._id.toString());
        expect(entry.resourceType).toBe('PromoCode');
        expect(entry.resourceId.toString()).toBe(fakeResourceId.toString());
        expect(entry.changes.get('code')).toBe('SAVE10');
        expect(entry.ip).toBe('127.0.0.1');
    });

    it('should accept a plain actor ID instead of a full user document', async () => {
        const fakeResourceId = new (require('mongoose').Types.ObjectId)();

        await auditLog.record({
            actor: user._id,
            action: 'review.moderated',
            resourceType: 'Review',
            resourceId: fakeResourceId,
        });

        const entry = await AuditLog.findOne({ action: 'review.moderated' });
        expect(entry.actor.toString()).toBe(user._id.toString());
    });

    it('should never throw, even if the write itself fails', async () => {
        await expect(auditLog.record({
            actor: user,
            action: 'invalid.action',
            resourceType: 'NotARealType',
            resourceId: user._id,
        })).resolves.not.toThrow();

        // Confirm nothing was written for the invalid resourceType (schema enum rejects it)
        const entry = await AuditLog.findOne({ action: 'invalid.action' });
        expect(entry).toBeNull();
    });
});
