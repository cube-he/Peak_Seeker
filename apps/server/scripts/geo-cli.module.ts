/**
 * Lightweight NestJS module for geo CLI scripts.
 *
 * Loads ONLY what the geo backfill / validate / refresh-poi / audit scripts
 * need — avoids pulling in AuthModule, RecommendModule, AdmissionModule, etc.
 * which transitively require express, passport, jwt, etc., which aren't
 * available when the server is installed with `pnpm install --prod` under
 * pnpm's strict hoisting (see DEPLOY notes in the project README).
 *
 * Use this instead of `AppModule` when bootstrapping standalone scripts:
 *
 *   const app = await NestFactory.createApplicationContext(GeoCliModule);
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../src/prisma/prisma.module';
import { RedisModule } from '../src/redis/redis.module';
import { GeoModule } from '../src/modules/geo/geo.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    GeoModule,
  ],
})
export class GeoCliModule {}
