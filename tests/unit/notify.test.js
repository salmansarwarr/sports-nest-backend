const User = require('../../src/models/User');

jest.mock('../../src/utils/email', () => ({
    sendBookingConfirmationEmail: jest.fn().mockResolvedValue(),
    sendBookingCancellationEmail: jest.fn().mockResolvedValue(),
    sendBookingReminderEmail: jest.fn().mockResolvedValue(),
    sendParticipantInviteEmail: jest.fn().mockResolvedValue(),
}));
jest.mock('../../src/utils/push', () => ({
    sendPushNotification: jest.fn().mockResolvedValue(),
}));
jest.mock('../../src/utils/whatsapp', () => ({
    sendWhatsAppMessage: jest.fn().mockResolvedValue(),
}));

const EmailService = require('../../src/utils/email');
const { sendPushNotification } = require('../../src/utils/push');
const { sendWhatsAppMessage } = require('../../src/utils/whatsapp');
const notify = require('../../src/utils/notify');

describe('notify dispatcher', () => {
    let booking;

    beforeEach(() => {
        jest.clearAllMocks();
        booking = { bookingNumber: 'BK2607280001', startTime: new Date() };
    });

    const makeUser = async (overrides = {}) => {
        return User.create({
            firstName: 'Notify',
            lastName: 'Test',
            email: `notify${Date.now()}${Math.random()}@example.com`,
            password: 'Password123!',
            phone: '+923001234567',
            deviceTokens: [{ token: 'device-token-1', platform: 'android' }],
            ...overrides,
        });
    };

    it('sends all three channels when all preferences are enabled', async () => {
        const user = await makeUser({
            preferences: { notifications: { email: true, push: true, whatsapp: true } },
        });

        await notify.bookingConfirmed(user, booking);

        expect(EmailService.sendBookingConfirmationEmail).toHaveBeenCalledWith(user, booking);
        expect(sendPushNotification).toHaveBeenCalledWith(['device-token-1'], expect.any(Object));
        expect(sendWhatsAppMessage).toHaveBeenCalledWith(user.phone, expect.any(String));
    });

    it('skips push and whatsapp when disabled in preferences', async () => {
        const user = await makeUser({
            preferences: { notifications: { email: true, push: false, whatsapp: false } },
        });

        await notify.bookingConfirmed(user, booking);

        expect(EmailService.sendBookingConfirmationEmail).toHaveBeenCalled();
        expect(sendPushNotification).not.toHaveBeenCalled();
        expect(sendWhatsAppMessage).not.toHaveBeenCalled();
    });

    it('skips email when disabled in preferences', async () => {
        const user = await makeUser({
            preferences: { notifications: { email: false, push: true, whatsapp: true } },
        });

        await notify.bookingConfirmed(user, booking);

        expect(EmailService.sendBookingConfirmationEmail).not.toHaveBeenCalled();
        expect(sendPushNotification).toHaveBeenCalled();
        expect(sendWhatsAppMessage).toHaveBeenCalled();
    });

    it('does not send push when the user has no device tokens even if enabled', async () => {
        const user = await makeUser({
            deviceTokens: [],
            preferences: { notifications: { email: true, push: true, whatsapp: true } },
        });

        await notify.bookingConfirmed(user, booking);

        expect(sendPushNotification).not.toHaveBeenCalled();
    });

    it('one channel failing does not block the others', async () => {
        EmailService.sendBookingConfirmationEmail.mockRejectedValueOnce(new Error('SMTP down'));

        const user = await makeUser({
            preferences: { notifications: { email: true, push: true, whatsapp: true } },
        });

        await expect(notify.bookingConfirmed(user, booking)).resolves.not.toThrow();

        expect(sendPushNotification).toHaveBeenCalled();
        expect(sendWhatsAppMessage).toHaveBeenCalled();
    });

    it('bookingCancelled passes the reason through to email and whatsapp', async () => {
        const user = await makeUser({
            preferences: { notifications: { email: true, push: false, whatsapp: true } },
        });

        await notify.bookingCancelled(user, booking, 'Change of plans');

        expect(EmailService.sendBookingCancellationEmail).toHaveBeenCalledWith(user, booking, 'Change of plans');
        expect(sendWhatsAppMessage).toHaveBeenCalledWith(user.phone, expect.stringContaining('Change of plans'));
    });

    describe('participantInvited', () => {
        it('sends only email for a guest participant with no linked user', async () => {
            const guestParticipant = { email: 'guest@example.com', name: 'Guest Person' };

            await notify.participantInvited(guestParticipant, booking);

            expect(EmailService.sendParticipantInviteEmail).toHaveBeenCalledWith(
                { email: 'guest@example.com', name: 'Guest Person' },
                booking
            );
            expect(sendPushNotification).not.toHaveBeenCalled();
            expect(sendWhatsAppMessage).not.toHaveBeenCalled();
        });

        it('gates all three channels for a registered-user participant', async () => {
            const user = await makeUser({
                preferences: { notifications: { email: true, push: true, whatsapp: true } },
            });

            await notify.participantInvited({ user: user._id }, booking);

            expect(EmailService.sendParticipantInviteEmail).toHaveBeenCalled();
            expect(sendPushNotification).toHaveBeenCalled();
            expect(sendWhatsAppMessage).toHaveBeenCalled();
        });
    });
});
