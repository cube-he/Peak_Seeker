import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CacheRefreshService } from './cache-refresh.service';

// All Prisma model names that this service can import into
export type ImportTarget =
  | 'University'
  | 'Major'
  | 'EnrollmentPlan'
  | 'AdmissionRecord'
  | 'ScoreSegment'
  | 'BatchLine'
  | 'BatchConfig';

export interface BatchImportOptions {
  target: ImportTarget;
  data: Record<string, any>[];
  batchSize?: number;   // default 500
  userId: number;
  ipAddress?: string;
}

export interface BatchImportResult {
  success: boolean;
  target: ImportTarget;
  totalRecords: number;
  importedRecords: number;
  skippedDuplicates: number;
  durationMs: number;
  error?: string;
}

@Injectable()
export class BatchImportService {
  private readonly logger = new Logger(BatchImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly cacheRefreshService: CacheRefreshService,
  ) {}

  /**
   * Transaction-based batch import with 5-minute timeout.
   * 500 records per batch, skipDuplicates, full rollback on error.
   */
  async import(options: BatchImportOptions): Promise<BatchImportResult> {
    const {
      target,
      data,
      batchSize = 500,
      userId,
      ipAddress,
    } = options;

    const start = Date.now();

    if (data.length === 0) {
      return {
        success: true,
        target,
        totalRecords: 0,
        importedRecords: 0,
        skippedDuplicates: 0,
        durationMs: 0,
      };
    }

    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          let totalImported = 0;
          let totalSkipped = 0;

          for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);
            const batchResult = await this.importBatch(tx, target, batch);
            totalImported += batchResult.count;
            // skipDuplicates means created count may be less than input count
            totalSkipped += batch.length - batchResult.count;
          }

          return { totalImported, totalSkipped };
        },
        {
          timeout: 5 * 60 * 1000, // 5-minute timeout
        },
      );

      const durationMs = Date.now() - start;

      // Write audit log after successful import
      await this.auditService.log({
        userId,
        action: 'DATA_IMPORT',
        entityType: target,
        newValue: {
          totalRecords: data.length,
          importedRecords: result.totalImported,
          skippedDuplicates: result.totalSkipped,
          durationMs,
        },
        ipAddress,
      });

      // Refresh caches for affected data
      await this.cacheRefreshService.refreshForTarget(target);

      this.logger.log(
        `Import "${target}" complete: ${result.totalImported}/${data.length} records in ${durationMs}ms`,
      );

      return {
        success: true,
        target,
        totalRecords: data.length,
        importedRecords: result.totalImported,
        skippedDuplicates: result.totalSkipped,
        durationMs,
      };
    } catch (error: any) {
      const durationMs = Date.now() - start;
      this.logger.error(
        `Import "${target}" failed after ${durationMs}ms: ${error.message}`,
      );

      return {
        success: false,
        target,
        totalRecords: data.length,
        importedRecords: 0,
        skippedDuplicates: 0,
        durationMs,
        error: error.message,
      };
    }
  }

  // ---- private helpers ----

  /**
   * Run a single batch createMany with skipDuplicates on the resolved Prisma delegate.
   */
  private async importBatch(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    target: ImportTarget,
    batch: Record<string, any>[],
  ): Promise<{ count: number }> {
    const delegate = this.getDelegate(tx, target);
    return delegate.createMany({
      data: batch,
      skipDuplicates: true,
    });
  }

  /**
   * Resolve the correct Prisma delegate by target name.
   */
  private getDelegate(tx: any, target: ImportTarget): any {
    const map: Record<ImportTarget, string> = {
      University: 'university',
      Major: 'major',
      EnrollmentPlan: 'enrollmentPlan',
      AdmissionRecord: 'admissionRecord',
      ScoreSegment: 'scoreSegment',
      BatchLine: 'batchLine',
      BatchConfig: 'batchConfig',
    };

    const key = map[target];
    if (!key || !tx[key]) {
      throw new Error(`Unknown import target: ${target}`);
    }
    return tx[key];
  }
}
