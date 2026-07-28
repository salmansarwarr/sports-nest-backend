const PromoCode = require('../../src/models/PromoCode');
const Court = require('../../src/models/Court');
const Venue = require('../../src/models/Venue');
const User = require('../../src/models/User');
const AuditLog = require('../../src/models/AuditLog');
const {
    createPromoCode,
    getPromoCodes,
    updatePromoCode,
    deletePromoCode,
    validatePromoCode,
} = require('../../src/controllers/promoCodeController');

describe('PromoCode', () => {
    let mockReq, mockRes, mockNext;
    let admin, owner, venue, court;

    beforeEach(async () => {
        admin = await User.create({
            firstName: 'Admin', lastName: 'User', email: 'admin@example.com',
            password: 'Password123!', role: 'admin'
        });
        owner = await User.create({
            firstName: 'Owner', lastName: 'User', email: 'owner@example.com',
            password: 'Password123!', role: 'owner'
        });
        venue = await Venue.create({
            name: 'Test Sports Complex',
            address: { street: '123 Main St', city: 'Karachi', state: 'Sindh', country: 'Pakistan' },
            location: { type: 'Point', coordinates: [67.0011, 24.8607] },
            contact: { primaryPhone: '+923001234567', email: 'venue@example.com' },
            amenities: { totalCourts: 5 },
            owner: owner._id
        });
        court = await Court.create({
            name: 'Test Court', venue: venue._id, sportType: 'tennis', courtType: 'outdoor',
            baseHourlyRate: 1000, owner: owner._id
        });

        mockReq = { body: {}, params: {}, query: {}, user: null };
        mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        mockNext = jest.fn();
    });

    describe('Model instance methods', () => {
        it('isValidFor should reject an inactive promo code', async () => {
            const promo = await PromoCode.create({
                code: 'SAVE10', discountType: 'percentage', discountValue: 10,
                validFrom: new Date(Date.now() - 86400000), validUntil: new Date(Date.now() + 86400000),
                isActive: false, createdBy: admin._id
            });

            const result = promo.isValidFor(1000, court._id, venue._id);
            expect(result.valid).toBe(false);
        });

        it('isValidFor should reject when outside the validity window', async () => {
            const promo = await PromoCode.create({
                code: 'EXPIRED', discountType: 'fixed', discountValue: 100,
                validFrom: new Date(Date.now() - 2 * 86400000), validUntil: new Date(Date.now() - 86400000),
                createdBy: admin._id
            });

            const result = promo.isValidFor(1000, court._id, venue._id);
            expect(result.valid).toBe(false);
        });

        it('isValidFor should reject below the minimum booking amount', async () => {
            const promo = await PromoCode.create({
                code: 'BIGSPEND', discountType: 'fixed', discountValue: 100, minBookingAmount: 5000,
                validFrom: new Date(Date.now() - 86400000), validUntil: new Date(Date.now() + 86400000),
                createdBy: admin._id
            });

            const result = promo.isValidFor(1000, court._id, venue._id);
            expect(result.valid).toBe(false);
        });

        it('isValidFor should reject a court outside the applicable scope', async () => {
            const otherCourt = await Court.create({
                name: 'Other Court', venue: venue._id, sportType: 'tennis', courtType: 'outdoor',
                baseHourlyRate: 1000, owner: owner._id
            });
            const promo = await PromoCode.create({
                code: 'SCOPED', discountType: 'fixed', discountValue: 100,
                applicableCourts: [otherCourt._id],
                validFrom: new Date(Date.now() - 86400000), validUntil: new Date(Date.now() + 86400000),
                createdBy: admin._id
            });

            const result = promo.isValidFor(1000, court._id, venue._id);
            expect(result.valid).toBe(false);
        });

        it('calculateDiscount should apply a percentage discount capped by maxDiscountAmount', async () => {
            const promo = await PromoCode.create({
                code: 'PERCENT50', discountType: 'percentage', discountValue: 50, maxDiscountAmount: 300,
                validFrom: new Date(Date.now() - 86400000), validUntil: new Date(Date.now() + 86400000),
                createdBy: admin._id
            });

            expect(promo.calculateDiscount(1000)).toBe(300); // 50% of 1000 = 500, capped at 300
            expect(promo.calculateDiscount(400)).toBe(200); // 50% of 400 = 200, under cap
        });

        it('calculateDiscount should never exceed the subtotal', async () => {
            const promo = await PromoCode.create({
                code: 'FLAT500', discountType: 'fixed', discountValue: 500,
                validFrom: new Date(Date.now() - 86400000), validUntil: new Date(Date.now() + 86400000),
                createdBy: admin._id
            });

            expect(promo.calculateDiscount(300)).toBe(300);
        });
    });

    describe('Controller', () => {
        it('should create a promo code as admin', async () => {
            mockReq.user = admin;
            mockReq.body = {
                code: 'NEWCODE', discountType: 'fixed', discountValue: 100,
                validFrom: new Date(Date.now() - 86400000).toISOString(),
                validUntil: new Date(Date.now() + 86400000).toISOString()
            };

            await createPromoCode(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(201);
            const created = await PromoCode.findOne({ code: 'NEWCODE' });
            expect(created.createdBy.toString()).toBe(admin._id.toString());

            const auditEntry = await AuditLog.findOne({ action: 'promo_code.created', resourceId: created._id });
            expect(auditEntry).not.toBeNull();
        });

        it('should list promo codes', async () => {
            await PromoCode.create({
                code: 'LIST1', discountType: 'fixed', discountValue: 50,
                validFrom: new Date(Date.now() - 86400000), validUntil: new Date(Date.now() + 86400000),
                createdBy: admin._id
            });

            mockReq.user = admin;
            await getPromoCodes(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, count: 1 }));
        });

        it('should update a promo code', async () => {
            const promo = await PromoCode.create({
                code: 'UPDATE1', discountType: 'fixed', discountValue: 50,
                validFrom: new Date(Date.now() - 86400000), validUntil: new Date(Date.now() + 86400000),
                createdBy: admin._id
            });

            mockReq.user = admin;
            mockReq.params = { id: promo._id.toString() };
            mockReq.body = { isActive: false };

            await updatePromoCode(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            const updated = await PromoCode.findById(promo._id);
            expect(updated.isActive).toBe(false);

            const auditEntry = await AuditLog.findOne({ action: 'promo_code.updated', resourceId: promo._id });
            expect(auditEntry).not.toBeNull();
        });

        it('should delete a promo code', async () => {
            const promo = await PromoCode.create({
                code: 'DELETE1', discountType: 'fixed', discountValue: 50,
                validFrom: new Date(Date.now() - 86400000), validUntil: new Date(Date.now() + 86400000),
                createdBy: admin._id
            });

            mockReq.user = admin;
            mockReq.params = { id: promo._id.toString() };

            await deletePromoCode(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(await PromoCode.findById(promo._id)).toBeNull();

            const auditEntry = await AuditLog.findOne({ action: 'promo_code.deleted', resourceId: promo._id });
            expect(auditEntry).not.toBeNull();
        });

        it('should preview a discount via validatePromoCode without mutating usage', async () => {
            const promo = await PromoCode.create({
                code: 'PREVIEW', discountType: 'percentage', discountValue: 20,
                validFrom: new Date(Date.now() - 86400000), validUntil: new Date(Date.now() + 86400000),
                createdBy: admin._id
            });

            mockReq.user = owner;
            mockReq.body = { code: 'preview', court: court._id.toString(), amount: 1000 };

            await validatePromoCode(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({ discount: 200, finalAmount: 800 })
                })
            );

            const unchanged = await PromoCode.findById(promo._id);
            expect(unchanged.usedCount).toBe(0);
        });

        it('should reject validatePromoCode for an unknown code', async () => {
            mockReq.user = owner;
            mockReq.body = { code: 'NOPE', court: court._id.toString(), amount: 1000 };

            await validatePromoCode(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(404);
        });
    });
});
