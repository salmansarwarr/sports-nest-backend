// Manual mock, applied automatically by Jest to every test file (same
// mechanism as __mocks__/nodemailer.js). The real `stripe` package
// default-exports a constructor function, so this mock exports a jest.fn()
// that returns the sub-resources src/utils/stripe.js calls. The sub-mocks
// are exposed on the mock function itself so individual tests can override
// return values, e.g.:
//   const Stripe = require('stripe');
//   Stripe.__mockPaymentIntents.create.mockResolvedValueOnce({...});
const mockPaymentIntents = {
    create: jest.fn().mockResolvedValue({
        id: 'pi_test_123',
        client_secret: 'pi_test_123_secret',
        status: 'requires_payment_method',
    }),
    retrieve: jest.fn().mockResolvedValue({ id: 'pi_test_123', status: 'succeeded' }),
};

const mockRefunds = {
    create: jest.fn().mockResolvedValue({ id: 're_test_123', status: 'succeeded' }),
};

const mockWebhooks = {
    constructEvent: jest.fn((rawBody) => JSON.parse(rawBody)),
};

const StripeMock = jest.fn(() => ({
    paymentIntents: mockPaymentIntents,
    refunds: mockRefunds,
    webhooks: mockWebhooks,
}));

StripeMock.__mockPaymentIntents = mockPaymentIntents;
StripeMock.__mockRefunds = mockRefunds;
StripeMock.__mockWebhooks = mockWebhooks;

module.exports = StripeMock;
