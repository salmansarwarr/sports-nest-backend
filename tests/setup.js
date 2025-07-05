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
});

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