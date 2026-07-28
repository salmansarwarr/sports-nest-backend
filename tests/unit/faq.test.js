const Faq = require('../../src/models/Faq');
const User = require('../../src/models/User');
const {
    getFaqs,
    createFaq,
    updateFaq,
    deleteFaq,
} = require('../../src/controllers/faqController');

describe('FAQ Controller', () => {
    let mockReq, mockRes, mockNext;
    let admin;

    beforeEach(async () => {
        admin = await User.create({ firstName: 'Admin', lastName: 'User', email: 'faqadmin@example.com', password: 'Password123!', role: 'admin' });

        mockReq = { body: {}, params: {}, query: {}, user: null };
        mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        mockNext = jest.fn();
    });

    describe('getFaqs', () => {
        beforeEach(async () => {
            await Faq.create({ question: 'Q1', answer: 'A1', category: 'booking', isPublished: true, order: 2 });
            await Faq.create({ question: 'Q2', answer: 'A2', category: 'payment', isPublished: true, order: 1 });
            await Faq.create({ question: 'Q3 (draft)', answer: 'A3', category: 'booking', isPublished: false });
        });

        it('should only return published FAQs, sorted by order', async () => {
            mockReq.query = {};

            await getFaqs(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            const response = mockRes.json.mock.calls[0][0];
            expect(response.count).toBe(2);
            expect(response.data[0].question).toBe('Q2'); // order: 1 comes first
        });

        it('should filter by category', async () => {
            mockReq.query = { category: 'payment' };

            await getFaqs(mockReq, mockRes, mockNext);

            const response = mockRes.json.mock.calls[0][0];
            expect(response.count).toBe(1);
            expect(response.data[0].question).toBe('Q2');
        });
    });

    describe('createFaq / updateFaq / deleteFaq', () => {
        it('should create an FAQ as admin', async () => {
            mockReq.user = admin;
            mockReq.body = { question: 'New question?', answer: 'New answer.' };

            await createFaq(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(201);
            expect(await Faq.findOne({ question: 'New question?' })).not.toBeNull();
        });

        it('should update an FAQ', async () => {
            const faq = await Faq.create({ question: 'Old', answer: 'Old answer' });

            mockReq.user = admin;
            mockReq.params = { id: faq._id.toString() };
            mockReq.body = { isPublished: false };

            await updateFaq(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            const updated = await Faq.findById(faq._id);
            expect(updated.isPublished).toBe(false);
        });

        it('should delete an FAQ', async () => {
            const faq = await Faq.create({ question: 'Delete me', answer: 'Answer' });

            mockReq.user = admin;
            mockReq.params = { id: faq._id.toString() };

            await deleteFaq(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(await Faq.findById(faq._id)).toBeNull();
        });
    });
});
