const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: "/api/auth/google/callback",
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;

                // 1. Try to find user by googleId
                let user = await User.findOne({ googleId: profile.id });

                // 2. If not found by googleId, check if account exists with the same email
                if (!user && email) {
                    user = await User.findOne({ email });
                    if (user) {
                        // Account linking: link Google ID to existing account & mark email verified
                        user.googleId = profile.id;
                        user.isEmailVerified = true;
                        if (!user.profilePicture?.url && profile.photos?.[0]?.value) {
                            user.profilePicture = {
                                url: profile.photos[0].value,
                                publicId: null,
                            };
                        }
                        await user.save();
                    }
                }

                // 3. If user still does not exist, create new Google-authenticated user
                if (!user) {
                    user = await User.create({
                        firstName: profile.name?.givenName || 'User',
                        lastName: profile.name?.familyName || '',
                        email: email,
                        isEmailVerified: true, // Google emails are pre-verified
                        googleId: profile.id,
                        provider: "google",
                        profilePicture: {
                            url: profile.photos?.[0]?.value || null,
                            publicId: null,
                        },
                    });
                }

                return done(null, user);
            } catch (err) {
                return done(err, null);
            }
        }
    )
);
