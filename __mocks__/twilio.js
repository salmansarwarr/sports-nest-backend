// Manual mock, applied automatically by Jest to every test file (same
// mechanism as __mocks__/stripe.js). twilio default-exports a constructor
// function, same shape as stripe's, so this mirrors that mock closely.
const mockMessagesCreate = jest.fn().mockResolvedValue({ sid: 'SM_test_123', status: 'queued' });

const TwilioMock = jest.fn(() => ({
    messages: { create: mockMessagesCreate },
}));

TwilioMock.__mockMessagesCreate = mockMessagesCreate;

module.exports = TwilioMock;
