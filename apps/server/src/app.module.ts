import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { UniversityModule } from './modules/university/university.module';
import { MajorModule } from './modules/major/major.module';
import { AdmissionModule } from './modules/admission/admission.module';
import { PlanModule } from './modules/plan/plan.module';
import { RecommendModule } from './modules/recommend/recommend.module';
import { FavoriteModule } from './modules/favorite/favorite.module';
import { HistoryModule } from './modules/history/history.module';
import { DataImportModule } from './modules/data-import/data-import.module';

@Module({
  imports: [
    // 配置模块
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // 限流模块
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1分钟
        limit: 100, // 最多100次请求
      },
    ]),

    // 基础设施模块
    PrismaModule,
    RedisModule,

    // 业务模块
    AuthModule,
    UserModule,
    UniversityModule,
    MajorModule,
    AdmissionModule,
    PlanModule,
    RecommendModule,
    FavoriteModule,
    HistoryModule,
    DataImportModule,
  ],
  providers: [
    // 全局应用限流守卫
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
