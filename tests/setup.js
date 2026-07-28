const { MongoMemoryServer } = require('mongodb-memory-server');
const { connect, connection } = require('mongoose');
let mongoServer;

beforeAll(async () => {
  // Start in-memory MongoDB instance
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  // Connect to the in-memory database
  if (connection.readyState === 0) {
    await connect(mongoUri);
  }
}, 30000);

beforeEach(async () => {
  // Clear all collections before each test
  const collections = connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

afterAll(async () => {
  // Close database connection and stop MongoDB instance
  await connection.close();
  await mongoServer.stop();
});

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.JWT_EXPIRE = '15m';
process.env.JWT_REFRESH_EXPIRE = '7d';
process.env.BCRYPT_ROUNDS = '4'; // Lower for faster tests
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy';
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = 'test@test-project.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n';
process.env.TWILIO_ACCOUNT_SID = 'AC_test_dummy';
process.env.TWILIO_AUTH_TOKEN = 'test_auth_token';
process.env.TWILIO_WHATSAPP_NUMBER = '+14155238886';
// Rate limiting (src/app.js's global limiter, and the auth-route-specific
// limiters in src/routes/authRoutes.js) is only skipped for NODE_ENV
// 'development' by default - 'test' still enforces it. E2E suites that
// register/login several users per test (each with a beforeEach re-running
// the same flow) can realistically exceed the 100-req/15min window within a
// single file, since Jest gives each test file its own module registry and
// therefore its own in-memory limiter state. Rate limiting itself isn't
// under test anywhere in this suite, so bypass it globally the same way the
// app already supports for local development.
process.env.DISABLE_RATE_LIMIT = 'true';