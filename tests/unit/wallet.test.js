const User = require('../../src/models/User');
const WalletTransaction = require('../../src/models/WalletTransaction');
const {
    getWallet,
    getTransactions,
    topUp,
    adjustWallet,
} = require('../../src/controllers/walletController');

describe('Wallet', () => {
    let user, admin;

    beforeEach(async () => {
        user = await User.create({
            firstName: 'Regular', lastName: 'User', email: 'user@example.com',
            password: 'Password123!', role: 'user'
        });
        admin = await User.create({
            firstName: 'Admin', lastName: 'User', email: 'admin@example.com',
            password: 'Password123!', role: 'admin'
        });
    });

    describe('User.creditWallet / debitWallet statics', () => {
        it('should credit the wallet and record a ledger entry', async () => {
            const updated = await User.creditWallet(user._id, 500, { source: 'admin_adjustment', description: 'test credit' });

            expect(updated.walletBalance).toBe(500);

            const tx = await WalletTransaction.findOne({ user: user._id });
            expect(tx.type).toBe('credit');
            expect(tx.amount).toBe(500);
            expect(tx.balanceAfter).toBe(500);
            expect(tx.source).toBe('admin_adjustment');
        });

        it('should debit the wallet and record a ledger entry when balance is sufficient', async () => {
            await User.creditWallet(user._id, 500, { source: 'admin_adjustment' });

            const updated = await User.debitWallet(user._id, 300, { source: 'booking_payment' });

            expect(updated.walletBalance).toBe(200);

            const tx = await WalletTransaction.findOne({ user: user._id, type: 'debit' });
            expect(tx.amount).toBe(300);
            expect(tx.balanceAfter).toBe(200);
        });

        it('should reject a debit that exceeds the current balance, leaving balance unchanged', async () => {
            await User.creditWallet(user._id, 100, { source: 'admin_adjustment' });

            const result = await User.debitWallet(user._id, 500, { source: 'booking_payment' });

            expect(result).toBeNull();

            const reloaded = await User.findById(user._id);
            expect(reloaded.walletBalance).toBe(100);

            const debitCount = await WalletTransaction.countDocuments({ user: user._id, type: 'debit' });
            expect(debitCount).toBe(0);
        });

        it('should reject zero/negative amounts as no-ops', async () => {
            expect(await User.creditWallet(user._id, 0, { source: 'admin_adjustment' })).toBeNull();
            expect(await User.creditWallet(user._id, -10, { source: 'admin_adjustment' })).toBeNull();
            expect(await User.debitWallet(user._id, 0, { source: 'booking_payment' })).toBeNull();
        });

        it('should let exactly one of two concurrent debits succeed when balance only covers one', async () => {
            await User.creditWallet(user._id, 100, { source: 'admin_adjustment' });

            const [first, second] = await Promise.all([
                User.debitWallet(user._id, 100, { source: 'booking_payment' }),
                User.debitWallet(user._id, 100, { source: 'booking_payment' }),
            ]);

            const results = [first, second];
            const succeeded = results.filter((r) => r !== null);
            expect(succeeded.length).toBe(1);

            const reloaded = await User.findById(user._id);
            expect(reloaded.walletBalance).toBe(0);

            const debitCount = await WalletTransaction.countDocuments({ user: user._id, type: 'debit' });
            expect(debitCount).toBe(1);
        });
    });

    describe('walletController', () => {
        let mockReq, mockRes, mockNext;

        beforeEach(() => {
            mockReq = { body: {}, params: {}, query: {}, user: null };
            mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
            mockNext = jest.fn();
        });

        it('getWallet should return the current balance', async () => {
            user.walletBalance = 750;
            mockReq.user = user;

            await getWallet(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                data: { walletBalance: 750 }
            }));
        });

        it('getTransactions should paginate the ledger for the current user only', async () => {
            await User.creditWallet(user._id, 100, { source: 'admin_adjustment' });
            const other = await User.create({
                firstName: 'Other', lastName: 'User', email: 'other@example.com', password: 'Password123!'
            });
            await User.creditWallet(other._id, 999, { source: 'admin_adjustment' });

            mockReq.user = user;
            await getTransactions(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, count: 1 }));
        });

        it('topUp should create a Stripe intent tagged with wallet_topup metadata', async () => {
            const Stripe = require('stripe');
            Stripe.__mockPaymentIntents.create.mockClear();

            mockReq.user = user;
            mockReq.body = { amount: 200 };

            await topUp(mockReq, mockRes, mockNext);

            expect(Stripe.__mockPaymentIntents.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    amount: 20000,
                    metadata: expect.objectContaining({ purpose: 'wallet_topup', userId: user._id.toString() })
                })
            );
            expect(mockRes.status).toHaveBeenCalledWith(201);
        });

        it('adjustWallet should credit a target user and audit-log the change (admin only)', async () => {
            mockReq.user = admin;
            mockReq.params = { userId: user._id.toString() };
            mockReq.body = { amount: 250, type: 'credit', reason: 'goodwill credit' };

            await adjustWallet(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            const reloaded = await User.findById(user._id);
            expect(reloaded.walletBalance).toBe(250);
        });

        it('adjustWallet should reject an over-debit with a 400', async () => {
            mockReq.user = admin;
            mockReq.params = { userId: user._id.toString() };
            mockReq.body = { amount: 250, type: 'debit', reason: 'correction' };

            await adjustWallet(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });
    });
});
