const LegalDocument = require('../../src/models/LegalDocument');
const User = require('../../src/models/User');
const AuditLog = require('../../src/models/AuditLog');
const { getActiveDocument, publishDocument } = require('../../src/controllers/legalController');

describe('Legal Controller', () => {
    let mockReq, mockRes, mockNext;
    let admin;

    beforeEach(async () => {
        admin = await User.create({ firstName: 'Admin', lastName: 'User', email: 'legaladmin@example.com', password: 'Password123!', role: 'admin' });

        mockReq = { body: {}, params: {}, query: {}, user: null };
        mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        mockNext = jest.fn();
    });

    describe('getActiveDocument', () => {
        it('should 404 when no document has been published yet', async () => {
            mockReq.params = { type: 'terms-of-service' };

            await getActiveDocument(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(404);
        });

        it('should return the active version', async () => {
            await LegalDocument.create({
                type: 'privacy-policy', version: 'v1.0', content: 'Old policy',
                isActive: true, publishedBy: admin._id
            });

            mockReq.params = { type: 'privacy-policy' };

            await getActiveDocument(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            const response = mockRes.json.mock.calls[0][0];
            expect(response.data.version).toBe('v1.0');
        });
    });

    describe('publishDocument', () => {
        it('should deactivate the previous active version when publishing a new one', async () => {
            const v1 = await LegalDocument.create({
                type: 'terms-of-service', version: 'v1.0', content: 'Old terms',
                isActive: true, publishedBy: admin._id
            });

            mockReq.user = admin;
            mockReq.body = { type: 'terms-of-service', version: 'v2.0', content: 'New terms' };

            await publishDocument(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(201);

            const oldVersion = await LegalDocument.findById(v1._id);
            expect(oldVersion.isActive).toBe(false);

            const newVersion = await LegalDocument.findOne({ version: 'v2.0' });
            expect(newVersion.isActive).toBe(true);

            const auditEntry = await AuditLog.findOne({ action: 'legal_document.published', resourceId: newVersion._id });
            expect(auditEntry).not.toBeNull();
        });
    });
});
