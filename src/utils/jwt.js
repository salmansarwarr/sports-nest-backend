const jwt = require('jsonwebtoken');

class JWTUtils {
  static generateAccessToken(userId) {
    return jwt.sign(
      { userId, type: 'access' },
      process.env.JWT_SECRET,
      { 
        expiresIn: process.env.JWT_EXPIRE || '15m',
        issuer: 'court-booking-api',
        audience: 'court-booking-client'
      }
    );
  }

  static generateRefreshToken(userId) {
    return jwt.sign(
      { userId, type: 'refresh' },
      process.env.JWT_REFRESH_SECRET,
      { 
        expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d',
        issuer: 'court-booking-api',
        audience: 'court-booking-client'
      }
    );
  }

  static verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        issuer: 'court-booking-api',
        audience: 'court-booking-client'
      });
      
      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }
      
      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  static verifyRefreshToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
        issuer: 'court-booking-api',
        audience: 'court-booking-client'
      });
      
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }
      
      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  static generateTokenPair(userId) {
    return {
      accessToken: this.generateAccessToken(userId),
      refreshToken: this.generateRefreshToken(userId)
    };
  }

  // Short-lived token issued in place of a full token pair when login
  // succeeds on password but the account has 2FA enabled. Deliberately a
  // signed JWT (type:'2fa-challenge') rather than a new DB-backed session
  // table, consistent with this codebase's all-JWT auth design - it proves
  // "this request already passed password verification" without granting
  // API access until /2fa/verify completes it.
  static generateTwoFactorChallengeToken(userId) {
    return jwt.sign(
      { userId, type: '2fa-challenge' },
      process.env.JWT_SECRET,
      {
        expiresIn: '5m',
        issuer: 'court-booking-api',
        audience: 'court-booking-client'
      }
    );
  }

  static verifyTwoFactorChallengeToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        issuer: 'court-booking-api',
        audience: 'court-booking-client'
      });

      if (decoded.type !== '2fa-challenge') {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired two-factor challenge token');
    }
  }
}

module.exports = JWTUtils;