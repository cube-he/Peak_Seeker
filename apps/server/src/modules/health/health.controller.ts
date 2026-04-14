import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

interface HealthCheck {
  name: string;
  status: 'up' | 'down';
  message?: string;
}

interface HealthResponse {
  status: 'healthy' | 'degraded';
  checks: HealthCheck[];
  timestamp: string;
}

@ApiTags('健康检查')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @ApiOperation({ summary: '服务健康检查' })
  async check(): Promise<HealthResponse> {
    const checks: HealthCheck[] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const allUp = checks.every((c) => c.status === 'up');

    return {
      status: allUp ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<HealthCheck> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { name: 'database', status: 'up' };
    } catch (error) {
      return {
        name: 'database',
        status: 'down',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async checkRedis(): Promise<HealthCheck> {
    try {
      const result = await this.redis.getClient().ping();
      return {
        name: 'redis',
        status: result === 'PONG' ? 'up' : 'down',
      };
    } catch (error) {
      return {
        name: 'redis',
        status: 'down',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
