import { Request, Response, NextFunction } from 'express';
import Database from '../config/database';
import { config } from '../config/config';

export const cache = (ttl: number = config.CACHE_TTL) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const database = Database.getInstance();
      
      if (!database.redis) {
        // If Redis is not available, skip caching
        next();
        return;
      }

      const key = `cache:${req.method}:${req.originalUrl}`;
      const cached = await database.redis.get(key);

      if (cached) {
        res.json(JSON.parse(cached));
        return;
      }

      // Override res.json to cache the response
      const originalJson = res.json;
      res.json = function(data: any) {
        // Cache successful responses only
        if (res.statusCode >= 200 && res.statusCode < 300) {
          database.redis?.setex(key, ttl, JSON.stringify(data));
        }
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      // If caching fails, continue without caching
      next();
    }
  };
};

export const clearCache = (pattern: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const database = Database.getInstance();
      
      if (database.redis) {
        const keys = await database.redis.keys(`cache:*${pattern}*`);
        if (keys.length > 0) {
          await database.redis.del(keys);
        }
      }

      next();
    } catch (error) {
      // If cache clearing fails, continue
      next();
    }
  };
};
