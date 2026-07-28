const PDFDocument = require('pdfkit');

// Generates a receipt PDF in-memory (no disk writes - nothing else in this
// app touches local disk either) and resolves to a Buffer.
const generateReceiptPdf = ({ booking, payment, user, venue, court }) => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const chunks = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        doc.fontSize(20).text('Payment Receipt', { align: 'center' });
        doc.moveDown();

        doc.fontSize(10)
            .text(`Receipt #: ${payment._id}`)
            .text(`Booking #: ${booking.bookingNumber}`)
            .text(`Date: ${new Date(payment.paidAt || payment.createdAt).toLocaleString()}`);
        doc.moveDown();

        doc.fontSize(12).text('Billed To', { underline: true });
        doc.fontSize(10).text(`${user.firstName} ${user.lastName}`).text(user.email);
        doc.moveDown();

        doc.fontSize(12).text('Booking Details', { underline: true });
        doc.fontSize(10)
            .text(`Venue: ${venue.name}`)
            .text(`Court: ${court.name}`)
            .text(`Start: ${new Date(booking.startTime).toLocaleString()}`)
            .text(`End: ${new Date(booking.endTime).toLocaleString()}`);
        doc.moveDown();

        doc.fontSize(12).text('Charges', { underline: true });
        doc.fontSize(10).text(`Base price: ${booking.pricing.basePrice} ${booking.pricing.currency}`);

        (booking.pricing.discounts || []).forEach((discount) => {
            doc.text(`Discount (${discount.name || discount.type}): -${discount.amount} ${booking.pricing.currency}`);
        });

        if (booking.pricing.tax) {
            doc.text(`Tax: ${booking.pricing.tax} ${booking.pricing.currency}`);
        }
        if (booking.pricing.serviceFee) {
            doc.text(`Service fee: ${booking.pricing.serviceFee} ${booking.pricing.currency}`);
        }
        if (booking.pricing.depositAmount) {
            doc.text(`Includes security deposit: ${booking.pricing.depositAmount} ${booking.pricing.currency}`);
        }

        doc.moveDown(0.5);
        doc.fontSize(12).text(`Total: ${booking.pricing.totalAmount} ${booking.pricing.currency}`, { underline: true });
        doc.moveDown();

        doc.fontSize(12).text('Payment', { underline: true });
        doc.fontSize(10)
            .text(`Method: ${payment.paymentMethod || payment.gateway}`)
            .text(`Status: ${payment.status}`)
            .text(`Transaction ID: ${payment.gatewayPaymentIntentId || 'N/A'}`);

        if (payment.refunds && payment.refunds.length > 0) {
            doc.moveDown();
            doc.fontSize(12).text('Refunds', { underline: true });
            payment.refunds.forEach((refund) => {
                doc.fontSize(10).text(
                    `${new Date(refund.createdAt).toLocaleDateString()}: -${refund.amount} ${booking.pricing.currency} (${refund.reason || 'refund'})`
                );
            });
        }

        doc.end();
    });
};

module.exports = { generateReceiptPdf };
