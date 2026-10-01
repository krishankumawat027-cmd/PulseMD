const mongoose = require('mongoose');

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

async function connectDB(options = {}) {
  const { exitOnError = true } = options;
  const mongoUri = String(process.env.MONGO_URI || '').trim();
  if (!mongoUri) {
    console.error('MongoDB connection failed: MONGO_URI is missing in environment variables.');
    if (exitOnError) process.exit(1);
    return null;
  }

  const uriDetails = describeMongoUri(mongoUri);

  try {
    if (uriDetails) {
      console.log(
        `Connecting to MongoDB ${uriDetails.protocol}://${uriDetails.host}/${uriDetails.database}`
      );
    } else {
      console.log('Connecting to MongoDB...');
    }

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000
    });
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    if (error.message.toLowerCase().includes('bad auth')) {
      console.error('MongoDB auth checklist: verify the Atlas database user password, URL-encode special characters in the password, include a database name in MONGO_URI, and confirm the user has read/write access to this cluster.');
      if (uriDetails) {
        console.error(`Current safe URI details: host=${uriDetails.host}, database=${uriDetails.database}, usernamePresent=${uriDetails.usernamePresent}, passwordPresent=${uriDetails.passwordPresent}, authSource=${uriDetails.authSource}`);
      }
    }
    if (exitOnError) process.exit(1);
    return null;
  }
}

module.exports = connectDB;
