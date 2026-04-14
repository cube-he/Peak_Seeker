import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  PlanGenerationJobData,
  FailureType,
} from '../interfaces/recommend.types';
import { PlanGeneratorService } from '../services/plan-generator.service';
import { NotificationService } from '../../notification/notification.service';

/**
 * Bull queue worker for async plan generation.
 *
 * Priority levels:
 *   1 = batch post-score (highest)
 *   2 = manual single generation
 *   3 = pool refresh
 *   5 = export
 *
 * Failure classification:
 *   TRANSIENT   → retry 3x with exponential backoff
 *   DATA_ERROR  → notify teacher, don't retry
 *   ALGORITHM_ERROR → suggest fix, notify teacher
 *   SYSTEM_ERROR → notify admin
 */
@Processor('plan-generation')
export class PlanGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(PlanGenerationProcessor.name);

  constructor(
    private readonly planGenerator: PlanGeneratorService,
    private readonly notificationService: NotificationService,
  ) {
    super();
  }

  async process(job: Job<PlanGenerationJobData>): Promise<any> {
    const { data } = job;
    this.logger.log(
      `Processing plan generation job ${job.id} for student ${data.studentId}`,
    );

    try {
      const result = await this.planGenerator.generatePlan(
        data,
        async (stage, percentage, message) => {
          // Update job progress for SSE consumers
          await job.updateProgress({ stage, percentage, message });
        },
      );

      this.logger.log(
        `Plan generation complete: planId=${result.planId}, items=${result.itemCount}`,
      );

      return result;
    } catch (error: any) {
      const failureType: FailureType =
        error.failureType || FailureType.SYSTEM_ERROR;

      this.logger.error(
        `Plan generation failed [${failureType}]: ${error.message}`,
        error.stack,
      );

      // Handle different failure types
      switch (failureType) {
        case FailureType.TRANSIENT:
          // Let Bull retry (up to 3 attempts configured in queue options)
          throw error;

        case FailureType.DATA_ERROR:
          // Notify teacher, don't retry
          await this.notifyTeacher(
            data.createdById,
            `方案生成失败：${error.message}`,
            data.studentId,
          );
          // Move to failed without retry
          throw Object.assign(error, { noRetry: true });

        case FailureType.ALGORITHM_ERROR:
          await this.notifyTeacher(
            data.createdById,
            `算法错误：${error.message}。建议调整参数后重试。`,
            data.studentId,
          );
          throw Object.assign(error, { noRetry: true });

        case FailureType.SYSTEM_ERROR:
        default:
          await this.notifyAdmin(
            `系统错误：学生${data.studentId}方案生成失败 - ${error.message}`,
          );
          throw error;
      }
    }
  }

  private async notifyTeacher(
    userId: number,
    message: string,
    studentId: number,
  ): Promise<void> {
    try {
      await this.notificationService.send({
        userId,
        type: 'plan_generation_failed',
        title: '方案生成失败',
        content: message,
        refType: 'StudentProfile',
        refId: studentId,
      });
    } catch (e) {
      this.logger.error('Failed to send teacher notification', e);
    }
  }

  private async notifyAdmin(message: string): Promise<void> {
    // In production, this would send to all admin users.
    // For now, just log the error.
    this.logger.error(`[ADMIN NOTIFICATION] ${message}`);
  }
}
