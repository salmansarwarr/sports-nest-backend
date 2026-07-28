const admin = require('firebase-admin');

// Unlike src/utils/stripe.js, there's no safe "dummy credential" to eagerly
// init with - admin.initializeApp() throws on malformed/missing credentials.
// So this lazy-inits only when real config is present, and no-ops otherwise
// (including in tests, unless the env vars below are set).
let app = null;

const getApp = () => {
    if (app) return app;

    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
        return null;
    }

    app = admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
    });

    return app;
};

const sendPushNotification = async (deviceTokens, { title, body, data }) => {
    if (!getApp() || !deviceTokens || deviceTokens.length === 0) {
        return null;
    }

    return admin.messaging().sendEachForMulticast({
        tokens: deviceTokens,
        notification: { title, body },
        data,
    });
};

module.exports = { sendPushNotification };
