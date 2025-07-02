import mongoose from 'mongoose';
import { createClient } from 'redis';

class Database {
  private static instance: Database;
  public redis: ReturnType<typeof createClient> | null = null;

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  public async connectMongoDB(): Promise<void> {
    try {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/carbonytics';
      
      await mongoose.connect(mongoUri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      console.log('✅ MongoDB connected successfully');

      mongoose.connection.on('error', (error) => {
        console.error('❌ MongoDB connection error:', error);
      });

      mongoose.connection.on('disconnected', () => {
        console.log('⚠️  MongoDB disconnected');
      });

    } catch (error) {
      console.error('❌ MongoDB connection failed:', error);
      process.exit(1);
    }
  }

  public async connectRedis(): Promise<void> {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      
      this.redis = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => Math.min(retries * 50, 1000),
        },
      });

      this.redis.on('error', (error) => {
        console.error('❌ Redis connection error:', error);
      });

      this.redis.on('connect', () => {
        console.log('✅ Redis connected successfully');
      });

      await this.redis.connect();

    } catch (error) {
      console.error('❌ Redis connection failed:', error);
      // Redis is optional, don't exit process
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await mongoose.disconnect();
      if (this.redis) {
        await this.redis.disconnect();
      }
      console.log('✅ Databases disconnected successfully');
    } catch (error) {
      console.error('❌ Error disconnecting databases:', error);
    }
  }
}

export default Database;