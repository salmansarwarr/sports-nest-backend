// Manual mock, applied automatically by Jest to every test file (same
// mechanism as __mocks__/nodemailer.js and __mocks__/stripe.js). Unlike
// those, firebase-admin isn't a single constructor - it's an object with
// initializeApp/credential.cert/messaging(). The sub-mock is exposed on the
// module itself so individual tests can override return values, e.g.:
//   const admin = require('firebase-admin');
//   admin.__mockSendEachForMulticast.mockResolvedValueOnce({...});
const mockSendEachForMulticast = jest.fn().mockResolvedValue({ successCount: 1, failureCount: 0, responses: [] });

module.exports = {
    initializeApp: jest.fn(() => ({})),
    credential: {
        cert: jest.fn(),
    },
    messaging: jest.fn(() => ({
        sendEachForMulticast: mockSendEachForMulticast,
    })),
    __mockSendEachForMulticast: mockSendEachForMulticast,
};
