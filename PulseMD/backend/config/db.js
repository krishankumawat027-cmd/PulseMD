const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let memoryMongoServer = null;

function describeMongoUri(uri) {
  try {
    const parsed = new URL(uri);
    return {
      protocol: parsed.protocol.replace(':', ''),
      host: parsed.host,
      database: parsed.pathname.replace(/^\//, '') || '(not specified)',
      authSource: parsed.searchParams.get('authSource') || '(default)',
      usernamePresent: Boolean(parsed.username),
      passwordPresent: Boolean(parsed.password)
    };
  } catch (error) {
    return null;
  }
}

async function connectWithMongoUri(uri, options = {}) {
  const { exitOnError = true } = options;
  const uriDetails = describeMongoUri(uri);

  try {
    if (uriDetails) {
      console.log(
        `Connecting to MongoDB ${uriDetails.protocol}://${uriDetails.host}/${uriDetails.database}`
      );
    } else {
      console.log('Connecting to MongoDB...');
    }

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000
    });
    console.log('MongoDB connected');
    return true;
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    if (error.message.toLowerCase().includes('bad auth')) {
      console.error('MongoDB auth checklist: verify the Atlas database user password, URL-encode special characters in the password, include a database name in MONGO_URI, and confirm the user has read/write access to this cluster.');
      if (uriDetails) {
        console.error(`Current safe URI details: host=${uriDetails.host}, database=${uriDetails.database}, usernamePresent=${uriDetails.usernamePresent}, passwordPresent=${uriDetails.passwordPresent}, authSource=${uriDetails.authSource}`);
      }
    }
    if (exitOnError) process.exit(1);
    return false;
  }
}

async function createMemoryMongoServer() {
  if (memoryMongoServer) {
    return memoryMongoServer.getUri();
  }

  memoryMongoServer = await MongoMemoryServer.create({
    binary: {
      version: '7.0.14'
    }
  });

  return memoryMongoServer.getUri();
}

async function connectDB(options = {}) {
  const { exitOnError = true } = options;
  const configuredUri = String(process.env.MONGO_URI || '').trim();

  if (configuredUri) {
    const connected = await connectWithMongoUri(configuredUri, { exitOnError: false });
    if (connected) return true;

    const fallbackUri = 'mongodb://127.0.0.1:27017/caremitra';
    console.warn(`MONGO_URI failed. Retrying with local MongoDB fallback: ${fallbackUri}`);
    const fallbackConnected = await connectWithMongoUri(fallbackUri, { exitOnError: false });
    if (fallbackConnected) {
      process.env.MONGO_URI = fallbackUri;
      return true;
    }
  } else {
    console.warn('MONGO_URI is missing in environment variables. Starting an in-memory MongoDB instance for local development.');
  }

  try {
    const memoryUri = await createMemoryMongoServer();
    process.env.MONGO_URI = memoryUri;
    const connected = await connectWithMongoUri(memoryUri, { exitOnError: false });
    if (connected) return true;
  } catch (error) {
    console.error('Failed to start in-memory MongoDB server:', error.message);
  }

  if (exitOnError) {
    process.exit(1);
  }

  return null;
}

module.exports = connectDB;
