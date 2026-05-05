import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
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
import { AiConfigModule } from './modules/ai-config/ai-config.module';
import { CaslModule } from './modules/casl';
import { AuditModule } from './modules/audit/audit.module';
import { QueueModule } from './modules/queue/queue.module';
import { NotificationModule } from './modules/notification/notification.module';
import { StudentModule } from './modules/student/student.module';
import { TeacherModule } from './modules/teacher/teacher.module';
import { HealthModule } from './modules/health/health.module';
import { HealthRestrictionModule } from './modules/health-restriction/health-restriction.module';
import { EligibleRegionModule } from './modules/eligible-region/eligible-region.module';
import { TimelineModule } from './modules/timeline/timeline.module';
import { ScoreSegmentModule } from './modules/score-segment/score-segment.module';
import { AlgorithmConfigModule } from './modules/algorithm-config/algorithm-config.module';
import { GeoModule } from './modules/geo/geo.module';

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
    CaslModule,
    AuditModule,
    QueueModule,
    NotificationModule,
    HealthModule,
    ScheduleModule.forRoot(),

    // 业务模块
    AuthModule,
    UserModule,
    StudentModule,
    TeacherModule,
    UniversityModule,
    GeoModule,
    MajorModule,
    AdmissionModule,
    PlanModule,
    RecommendModule,
    FavoriteModule,
    HistoryModule,
    DataImportModule,
    AiConfigModule,
    HealthRestrictionModule,
    EligibleRegionModule,
    TimelineModule,
    ScoreSegmentModule,
    AlgorithmConfigModule,
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
