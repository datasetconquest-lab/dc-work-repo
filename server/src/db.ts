import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

// MongoDB connection string — must be set via environment variable
if (!process.env.MONGODB_URI) {
  if (isProduction) {
    console.error('FATAL: MONGODB_URI environment variable is required in production');
    process.exit(1);
  }
  console.warn('⚠️  MONGODB_URI not set — using local MongoDB (mongodb://localhost:27017/dc_teams)');
}
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dc_teams';

// The application's data lives in the `dc_teams` database. Force it explicitly
// so a connection string without a database path (which otherwise defaults to
// the empty `test` database) can never point the server at the wrong data.
const DB_NAME = process.env.MONGODB_DB || 'dc_teams';

// Connection options
const mongooseOptions: mongoose.ConnectOptions = {
  dbName: DB_NAME,
  // Connection pooling
  maxPoolSize: 20,
  minPoolSize: 5,
  // Server selection and socket timeouts
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  // Write concern
  w: 'majority' as const,
  retryWrites: true,
};

// Connect to MongoDB with retries
export async function connectDB(): Promise<boolean> {
  const maxRetries = 5;
  let currentRetry = 0;

  while (currentRetry < maxRetries) {
    try {
      await mongoose.connect(MONGODB_URI, mongooseOptions);
      console.log('✓ MongoDB connected successfully');
      console.log(`  Database: ${mongoose.connection.db?.databaseName || 'unknown'}`);
      console.log(`  Host: ${mongoose.connection.host}`);
      return true;
    } catch (error) {
      currentRetry++;
      console.error(`✗ MongoDB connection attempt ${currentRetry}/${maxRetries} failed:`, (error as Error).message);

      if (currentRetry < maxRetries) {
        console.log(`  Retrying in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      } else {
        console.error('  Max retries reached. Could not connect to MongoDB.');
        return false;
      }
    }
  }
  return false;
}

// Test connection
export async function testConnection(): Promise<boolean> {
  try {
    if (mongoose.connection.readyState === 1) {
      console.log('✓ MongoDB connection is active');
      return true;
    }
    return await connectDB();
  } catch (error) {
    console.error('✗ MongoDB connection test failed:', error);
    return false;
  }
}

// Handle connection events
mongoose.connection.on('connected', () => {
  console.log('MongoDB connected');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed through app termination');
  process.exit(0);
});

// Export mongoose instance for direct access if needed
export { mongoose };
