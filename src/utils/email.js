const nodemailer = require('nodemailer');
require('dotenv').config();
class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }

  async sendEmail(options) {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: options.email,
      subject: options.subject,
      html: options.html
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      return info;
    } catch (error) {
      console.error('Email sending failed:', error);
      throw new Error('Email could not be sent');
    }
  }

  async sendWelcomeEmail(user, verificationToken) {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Court Booking System!</h2>
        <p>Hi ${user.firstName},</p>
        <p>Thank you for registering with us. Please verify your email address by clicking the button below:</p>
        <a href="${verificationUrl}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 16px 0;">
          Verify Email Address
        </a>
        <p>Or copy and paste this link in your browser:</p>
        <p>${verificationUrl}</p>
        <p>This link will expire in 24 hours.</p>
        <p>Best regards,<br>Court Booking Team</p>
      </div>
    `;

    await this.sendEmail({
      email: user.email,
      subject: 'Welcome! Please verify your email',
      html
    });
  }

  async sendPasswordResetEmail(user, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>Hi ${user.firstName},</p>
        <p>You requested a password reset. Click the button below to reset your password:</p>
        <a href="${resetUrl}" style="background-color: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 16px 0;">
          Reset Password
        </a>
        <p>Or copy and paste this link in your browser:</p>
        <p>${resetUrl}</p>
        <p>This link will expire in 10 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
        <p>Best regards,<br>Court Booking Team</p>
      </div>
    `;

    await this.sendEmail({
      email: user.email,
      subject: 'Password Reset Request',
      html
    });
  }

  async sendBookingConfirmationEmail(user, booking) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Booking Confirmed!</h2>
        <p>Hi ${user.firstName},</p>
        <p>Your booking <strong>${booking.bookingNumber}</strong> is confirmed.</p>
        <p><strong>Start:</strong> ${new Date(booking.startTime).toLocaleString()}</p>
        <p><strong>End:</strong> ${new Date(booking.endTime).toLocaleString()}</p>
        <p>Best regards,<br>Court Booking Team</p>
      </div>
    `;

    await this.sendEmail({
      email: user.email,
      subject: `Booking Confirmed - ${booking.bookingNumber}`,
      html
    });
  }

  async sendBookingCancellationEmail(user, booking, reason) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Booking Cancelled</h2>
        <p>Hi ${user.firstName},</p>
        <p>Your booking <strong>${booking.bookingNumber}</strong> has been cancelled.</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
        <p>Best regards,<br>Court Booking Team</p>
      </div>
    `;

    await this.sendEmail({
      email: user.email,
      subject: `Booking Cancelled - ${booking.bookingNumber}`,
      html
    });
  }

  async sendBookingReminderEmail(user, booking) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Upcoming Booking Reminder</h2>
        <p>Hi ${user.firstName},</p>
        <p>This is a reminder that your booking <strong>${booking.bookingNumber}</strong> starts soon.</p>
        <p><strong>Start:</strong> ${new Date(booking.startTime).toLocaleString()}</p>
        <p>Best regards,<br>Court Booking Team</p>
      </div>
    `;

    await this.sendEmail({
      email: user.email,
      subject: `Reminder: Upcoming Booking - ${booking.bookingNumber}`,
      html
    });
  }

  async sendParticipantInviteEmail(recipient, booking) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You're Invited!</h2>
        <p>Hi ${recipient.name},</p>
        <p>You've been invited to join a group booking <strong>${booking.bookingNumber}</strong>.</p>
        <p><strong>Start:</strong> ${new Date(booking.startTime).toLocaleString()}</p>
        <p>Best regards,<br>Court Booking Team</p>
      </div>
    `;

    await this.sendEmail({
      email: recipient.email,
      subject: `You're invited to a booking - ${booking.bookingNumber}`,
      html
    });
  }
}

module.exports = new EmailService();