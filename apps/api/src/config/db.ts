import { MongoClient, Db } from 'mongodb';

console.log('Current directory:', process.cwd());
console.log('Environment variables:', {
  MONGODB_URI: process.env.MONGODB_URI,
  NODE_ENV: process.env.NODE_ENV
});

if (!process.env.MONGODB_URI) {
  throw new Error('Please add your Mongo URI to .env file');
}

const client = new MongoClient(process.env.MONGODB_URI);
let cachedDb: Db | null = null;

export async function connectToDatabase(): Promise<Db> {
  if (cachedDb) {
    return cachedDb;
  }

  try {
    await client.connect();
    const db = client.db('video-recorder');
    cachedDb = db;
    console.log('Connected to MongoDB');
    return db;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}