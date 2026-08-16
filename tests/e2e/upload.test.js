const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/app.js');
const User = require('../../src/models/User.js');

// Mock Cloudinary so upload tests never hit the network
jest.mock('../../src/utils/cloudinary', () => ({
    uploadToCloudinary: jest.fn().mockResolvedValue({
        secure_url: 'https://res.cloudinary.com/test/venue-documents/license.pdf',
        public_id: 'sports-nest/venue-documents/test123',
    }),
    deleteFromCloudinary: jest.fn().mockResolvedValue({ result: 'ok' }),
}));

describe('Upload Routes E2E Tests', () => {
    let server;
    let ownerToken;
    let userToken;

    const ownerData = {
        firstName: 'Venue',
        lastName: 'Owner',
        email: 'uploadowner@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        phone: '+1234567890',
        dateOfBirth: '1980-01-01',
        gender: 'male',
        role: 'owner'
    };

    const userData = {
        firstName: 'Regular',
        lastName: 'User',
        email: 'uploaduser@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        phone: '+0987654321',
        dateOfBirth: '1990-01-01',
        gender: 'female'
    };

    beforeAll(async () => {
        server = app.listen(0);
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.TEST_DATABASE_URL);
        }
    });

    afterAll(async () => {
        await mongoose.connection.close();
        if (server) {
            server.close();
        }
    });

    beforeEach(async () => {
        await request(app).post('/api/auth/register').send(ownerData);
        await User.findOneAndUpdate({ email: ownerData.email }, { isEmailVerified: true, role: 'owner' });
        const ownerLogin = await request(app).post('/api/auth/login').send({
            email: ownerData.email,
            password: ownerData.password
        });
        ownerToken = ownerLogin.body.data.tokens.accessToken;

        await request(app).post('/api/auth/register').send(userData);
        await User.findOneAndUpdate({ email: userData.email }, { isEmailVerified: true });
        const userLogin = await request(app).post('/api/auth/login').send({
            email: userData.email,
            password: userData.password
        });
        userToken = userLogin.body.data.tokens.accessToken;
    });

    describe('POST /api/uploads/document', () => {
        it('should upload a document as an owner and return the Cloudinary URL', async () => {
            const response = await request(app)
                .post('/api/uploads/document')
                .set('Authorization', `Bearer ${ownerToken}`)
                .attach('document', Buffer.from('%PDF-1.4 fake pdf content'), {
                    filename: 'license.pdf',
                    contentType: 'application/pdf'
                });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.data.url).toBe('https://res.cloudinary.com/test/venue-documents/license.pdf');
            expect(response.body.data.filename).toBe('license.pdf');
        });

        it('should reject a request with no file attached', async () => {
            const response = await request(app)
                .post('/api/uploads/document')
                .set('Authorization', `Bearer ${ownerToken}`);

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });

        it('should reject an unauthenticated request', async () => {
            const response = await request(app)
                .post('/api/uploads/document')
                .attach('document', Buffer.from('fake'), 'license.pdf');

            expect(response.status).toBe(401);
        });

        it('should reject a regular (non owner/admin) user', async () => {
            const response = await request(app)
                .post('/api/uploads/document')
                .set('Authorization', `Bearer ${userToken}`)
                .attach('document', Buffer.from('fake'), 'license.pdf');

            expect(response.status).toBe(403);
        });

        it('should reject a disallowed file type', async () => {
            const response = await request(app)
                .post('/api/uploads/document')
                .set('Authorization', `Bearer ${ownerToken}`)
                .attach('document', Buffer.from('not-a-real-doc'), {
                    filename: 'notes.txt',
                    contentType: 'text/plain'
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });
    });
});
