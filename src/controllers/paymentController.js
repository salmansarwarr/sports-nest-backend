const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const { validationResult } = require('express-validator');
const stripeUtil = require('../utils/stripe');
const { generateReceiptPdf } = require('../utils/pdf');
const logger = require('../utils/logger');
const loyaltyUtil = require('../utils/loyalty');
const referralUtil = require('../utils/referral');

/**
 * @desc    Create a Stripe payment intent for a booking
 * @route   POST /api/payments/create-intent
 * @access  Private
 */
exports.createPaymentIntent = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { bookingId } = req.body;

        const booking = await Booking.findById(bookingId).populate('user');
        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        const isOwner = booking.user._id.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to pay for this booking'
            });
        }

        if (booking.isPaid) {
            return res.status(400).json({
                success: false,
                message: 'Booking is already paid'
            });
        }

        // A wallet debit at booking-creation time may already have covered
        // part of totalAmount (see bookingController.createBooking) - only
        // the remainder needs a Stripe charge.
        const remainder = booking.pricing.totalAmount - (booking.pricing.walletAmountApplied || 0);

        const intent = await stripeUtil.createPaymentIntent({
            amount: remainder,
            currency: booking.pricing.currency,
            metadata: { bookingId: booking._id.toString(), bookingNumber: booking.bookingNumber }
        });

        // Reuse an existing pending payment attempt for this booking if one
        // exists, instead of accumulating orphaned records on retries.
        let payment = await Payment.findOne({ booking: booking._id, status: 'pending' }).sort('-createdAt');

        if (payment) {
            payment.gatewayPaymentIntentId = intent.id;
            payment.amount = remainder;
            payment.currency = booking.pricing.currency;
            await payment.save();
        } else {
            payment = await Payment.create({
                booking: booking._id,
                user: booking.user._id,
                gateway: 'stripe',
                gatewayPaymentIntentId: intent.id,
                amount: remainder,
                currency: booking.pricing.currency,
                status: 'pending'
            });
        }

        res.status(201).json({
            success: true,
            message: 'Payment intent created',
            data: {
                clientSecret: intent.client_secret,
                paymentId: payment._id
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Handle Stripe webhook events
 * @route   POST /api/payments/webhook
 * @access  Public (verified via Stripe signature, not JWT)
 */
exports.handleWebhook = async (req, res) => {
    let event;
    try {
        event = stripeUtil.constructWebhookEvent(req.body, req.headers['stripe-signature']);
    } catch (error) {
        logger.error('Stripe webhook signature verification failed', { error: error.message });
        return res.status(400).json({ success: false, message: 'Webhook signature verification failed' });
    }

    try {
        switch (event.type) {
            case 'payment_intent.succeeded': {
                const intent = event.data.object;

                // Wallet top-ups never create a Payment doc (they're not a
                // booking transaction) - distinguished by intent metadata,
                // credited directly to the wallet ledger. Guarded against
                // webhook retries via a lookup on gatewayPaymentIntentId
                // instead of a status field, since there's no Payment
                // record here to gate on.
                if (intent.metadata?.purpose === 'wallet_topup') {
                    const alreadyCredited = await WalletTransaction.findOne({ gatewayPaymentIntentId: intent.id });
                    if (!alreadyCredited && intent.metadata.userId) {
                        const amount = Math.round(intent.amount) / 100;
                        await User.creditWallet(intent.metadata.userId, amount, {
                            source: 'top_up',
                            description: 'Wallet top-up via Stripe',
                            gatewayPaymentIntentId: intent.id,
                        });
                    }
                    break;
                }

                const payment = await Payment.findOne({ gatewayPaymentIntentId: intent.id });

                if (payment && payment.status !== 'succeeded') {
                    payment.status = 'succeeded';
                    payment.paidAt = new Date();
                    payment.gatewayChargeId = intent.latest_charge || payment.gatewayChargeId;
                    await payment.save();

                    const booking = await Booking.findById(payment.booking);
                    if (booking && !booking.isPaid) {
                        booking.payment.status = 'completed';
                        booking.payment.paidAt = new Date();
                        booking.payment.transactionId = intent.id;
                        await booking.save();

                        await loyaltyUtil.awardBookingPoints(booking);
                        await referralUtil.processReferralQualification(booking);
                    }
                }
                break;
            }

            case 'payment_intent.payment_failed': {
                const intent = event.data.object;
                const payment = await Payment.findOne({ gatewayPaymentIntentId: intent.id });

                if (payment) {
                    payment.status = 'failed';
                    payment.failureReason = intent.last_payment_error?.message;
                    await payment.save();
                    await Booking.findByIdAndUpdate(payment.booking, { 'payment.status': 'failed' });
                }
                break;
            }

            default:
                break;
        }

        res.status(200).json({ received: true });
    } catch (error) {
        logger.error('Error handling Stripe webhook', { error: error.message, eventType: event?.type });
        // Acknowledge receipt anyway so Stripe doesn't retry-hammer for an
        // internal bug on our side; the event is logged for investigation.
        res.status(200).json({ received: true });
    }
};

/**
 * @desc    Get the current user's payment history
 * @route   GET /api/payments/history
 * @access  Private
 */
exports.getPaymentHistory = async (req, res, next) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;

        const query = { user: req.user._id };
        if (status) query.status = status;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const payments = await Payment.find(query)
            .populate('booking', 'bookingNumber startTime endTime')
            .sort('-createdAt')
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Payment.countDocuments(query);

        res.status(200).json({
            success: true,
            count: payments.length,
            total,
            totalPages: Math.ceil(total / parseInt(limit)),
            currentPage: parseInt(page),
            data: payments
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get a single payment
 * @route   GET /api/payments/:id
 * @access  Private
 */
exports.getPayment = async (req, res, next) => {
    try {
        const payment = await Payment.findById(req.params.id).populate('booking');
        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }

        const isOwner = payment.user.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this payment'
            });
        }

        res.status(200).json({
            success: true,
            data: payment
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Download a PDF receipt for a completed payment
 * @route   GET /api/payments/:id/receipt
 * @access  Private
 */
exports.getReceipt = async (req, res, next) => {
    try {
        const payment = await Payment.findById(req.params.id).populate({
            path: 'booking',
            populate: ['court', 'venue', 'user']
        });

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }

        const isOwner = payment.user.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this receipt'
            });
        }

        if (payment.status !== 'succeeded') {
            return res.status(400).json({
                success: false,
                message: 'Receipt is only available for completed payments'
            });
        }

        const buffer = await generateReceiptPdf({
            booking: payment.booking,
            payment,
            user: payment.booking.user,
            venue: payment.booking.venue,
            court: payment.booking.court
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="receipt-${payment.booking.bookingNumber}.pdf"`);
        res.send(buffer);
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Mark a booking's payment as completed without going through
 *          Stripe. A dev/test-only shortcut so the booking flow can be
 *          exercised without entering a real (or test-mode) card — mirrors
 *          the fields the Stripe webhook would normally set. Disabled in
 *          production.
 * @route   POST /api/payments/:bookingId/mark-paid-test
 * @access  Private (Booking owner or Admin)
 */
exports.markBookingPaidForTesting = async (req, res, next) => {
    try {
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({
                success: false,
                message: 'Test payment bypass is disabled in production'
            });
        }

        const booking = await Booking.findById(req.params.bookingId).populate('user');
        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        const isOwner = booking.user._id.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to pay for this booking'
            });
        }

        if (booking.isPaid) {
            return res.status(400).json({
                success: false,
                message: 'Booking is already paid'
            });
        }

        const remainder = Math.max(0, booking.pricing.totalAmount - (booking.pricing.walletAmountApplied || 0));
        const testTxnId = `test_${booking._id}_${Date.now()}`;

        booking.payment.status = 'completed';
        booking.payment.method = 'card';
        booking.payment.paidAt = new Date();
        booking.payment.transactionId = testTxnId;
        await booking.save();

        await Payment.create({
            booking: booking._id,
            user: booking.user._id,
            gateway: 'stripe',
            gatewayPaymentIntentId: testTxnId,
            amount: remainder,
            currency: booking.pricing.currency,
            status: 'succeeded',
            paymentMethod: 'test-bypass',
            paidAt: new Date()
        });

        await loyaltyUtil.awardBookingPoints(booking);
        await referralUtil.processReferralQualification(booking);

        res.status(200).json({
            success: true,
            message: 'Booking marked as paid (test mode — no real payment was processed)',
            data: booking
        });
    } catch (error) {
        next(error);
    }
};
