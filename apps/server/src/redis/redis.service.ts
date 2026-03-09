import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(private configService: ConfigService) {
    this.client = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD') || undefined,
      retryStrategy: (times) => {
        if (times > 3) return null; // Stop retrying after 3 attempts
        return Math.min(times * 200, 2000);
      },
    });

    this.client.on('error', (err) => {
      console.error('Redis connection error:', err.message);
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  getClient(): Redis {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.setex(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  // Token 黑名单管理
  async addToBlacklist(token: string, ttl: number): Promise<void> {
    await this.set(`blacklist:${token}`, '1', ttl);
  }

  async isBlacklisted(token: string): Promise<boolean> {
    return this.exists(`blacklist:${token}`);
  }

  // 缓存管理
  async getCache<T>(key: string): Promise<T | null> {
    const data = await this.get(`cache:${key}`);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      // Corrupted cache data, delete it and return null
      await this.del(`cache:${key}`);
      return null;
    }
  }

  async setCache<T>(key: string, value: T, ttl = 3600): Promise<void> {
    await this.set(`cache:${key}`, JSON.stringify(value), ttl);
  }

  async delCache(key: string): Promise<void> {
    await this.del(`cache:${key}`);
  }
}
