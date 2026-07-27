// Manual mock, applied automatically by Jest to every test file. Prevents
// EmailService (src/utils/email.js) from opening a real SMTP connection in
// tests, which previously hung until Jest's per-test timeout was exceeded
// since EMAIL_HOST/PORT are unset in the test environment.
module.exports = {
    createTransport: jest.fn(() => ({
        sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
    })),
};
