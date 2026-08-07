const dns = require('dns');
const mongoose = require('mongoose');
require('dotenv').config();

// mongodb+srv:// URIs need TXT/SRV DNS records to resolve the cluster's
// hosts. Some routers/ISP resolvers proxy plain A lookups fine but time out
// on those record types, which surfaces as `queryTxt ETIMEOUT`. Querying a
// public resolver directly sidesteps that instead of depending on whatever
// DNS the host OS/network hands us.
dns.setServers(['8.8.8.8', '1.1.1.1']);

// Fail fast instead of letting queries queue silently while disconnected
// (this is what turned a 10s Atlas blip into an unhandled buffering timeout).
mongoose.set('bufferCommands', false);

const CONNECT_OPTIONS = {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
};

const RETRY_DELAY_MS = 5000;

// A free-tier/shared Atlas cluster can take a few seconds to wake up from an
// idle state, so a single failed attempt at startup shouldn't kill the app -
// retry a few times before giving up.
const connectDB = async (retriesLeft = 5) => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, CONNECT_OPTIONS);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('Database connection error:', error.message);
    if (retriesLeft > 0) {
      console.error(`Retrying MongoDB connection in ${RETRY_DELAY_MS / 1000}s (${retriesLeft} attempt(s) left)...`);
      setTimeout(() => connectDB(retriesLeft - 1), RETRY_DELAY_MS);
    } else {
      process.exit(1);
    }
  }
};

// Without these listeners, a runtime connection error/drop is emitted as an
// 'error' event with no listener, which Node escalates to uncaughtException
// and takes down the whole process instead of just the affected query.
mongoose.connection.on('error', (error) => {
  console.error('MongoDB connection error:', error.message);
});

mongoose.connection.on('disconnected', () => {
  console.error('MongoDB disconnected - will reconnect automatically when the cluster is reachable again');
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected');
});

module.exports = connectDB;