import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** Cache simplu JSON peste Redis. Dacă Redis nu e disponibil, aplicația merge fără cache. */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    this.redis = new Redis(config.get<string>('redisUrl')!, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.redis.on('error', (e) => this.logger.warn(`Redis: ${e.message}`));
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const v = await this.redis.get(key);
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      /* cache opțional */
    }
  }

  async wrap<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null) return hit;
    const value = await fn();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }
}
