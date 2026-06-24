import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CacheRefreshService } from './cache-refresh.service';

export interface SupplementaryImportRow {
  year: number;
  province: string;
  batch: string;
  roundNumber?: number;
  universityId: number;
  universityName: string;
  subject?: string;        // 科类 物理/历史 — 候选卡按学生科类过滤征集
  groupCode?: string;      // 专业组代码 — loadSupplementaryByGroup 按组聚合(groupCode 非空才可见)
  majorId?: number;
  majorCode?: string;      // 专业代码 — 组内专业级征集
  majorName?: string;
  planCount?: number;
  requirements?: string;
  filingMinScore?: number;
  filingMinRank?: number;
}

@Injectable()
export class SupplementaryImportService {
  private readonly logger = new Logger(SupplementaryImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly cacheRefreshService: CacheRefreshService,
  ) {}

  /**
   * Import supplementary (征集志愿) records and refresh the summary table.
   */
  async import(
    data: SupplementaryImportRow[],
    userId: number,
    ipAddress?: string,
  ): Promise<{
    success: boolean;
    importedCount: number;
    summaryCount: number;
    durationMs: number;
    error?: string;
  }> {
    const start = Date.now();

    if (data.length === 0) {
      return {
        success: true,
        importedCount: 0,
        summaryCount: 0,
        durationMs: 0,
      };
    }

    try {
      // 1. Insert supplementary records in a transaction
      const importedCount = await this.prisma.$transaction(
        async (tx) => {
          const result = await tx.supplementaryRecord.createMany({
            data: data.map((row) => ({
              year: row.year,
              province: row.province,
              batch: row.batch,
              roundNumber: row.roundNumber ?? 1,
              universityId: row.universityId,
              universityName: row.universityName,
              subject: row.subject ?? null,
              groupCode: row.groupCode ?? null,
              majorId: row.majorId ?? null,
              majorCode: row.majorCode ?? null,
              majorName: row.majorName ?? null,
              planCount: row.planCount ?? null,
              requirements: row.requirements ?? null,
              filingMinScore: row.filingMinScore ?? null,
              filingMinRank: row.filingMinRank ?? null,
            })),
            skipDuplicates: true,
          });
          return result.count;
        },
        { timeout: 5 * 60 * 1000 },
      );

      // 2. TRUNCATE + INSERT refresh SupplementarySummary
      const summaryCount = await this.refreshSummaryTable();

      // 3. Refresh caches
      await this.cacheRefreshService.refreshForTarget('SupplementaryRecord');

      // 4. Audit log
      const durationMs = Date.now() - start;
      await this.auditService.log({
        userId,
        action: 'DATA_IMPORT',
        entityType: 'SupplementaryRecord',
        newValue: { importedCount, summaryCount, durationMs },
        ipAddress,
      });

      this.logger.log(
        `Supplementary import: ${importedCount} records, ${summaryCount} summaries in ${durationMs}ms`,
      );

      return {
        success: true,
        importedCount,
        summaryCount,
        durationMs,
      };
    } catch (error: any) {
      const durationMs = Date.now() - start;
      this.logger.error(`Supplementary import failed: ${error.message}`);

      return {
        success: false,
        importedCount: 0,
        summaryCount: 0,
        durationMs,
        error: error.message,
      };
    }
  }

  /**
   * TRUNCATE the SupplementarySummary table and rebuild from SupplementaryRecord.
   *
   * Calculates per-university/batch/province aggregates:
   * - totalRounds, totalPlanCount, supplementaryRate (avgRatio),
   *   trend (INCREASING/STABLE/DECREASING), consecutiveYears
   */
  private async refreshSummaryTable(): Promise<number> {
    // TRUNCATE for fastest clear
    await this.prisma.$executeRaw`TRUNCATE TABLE supplementary_summaries`;

    // Aggregate: count distinct rounds, sum plan counts, grouped by year/province/batch/universityId
    const insertResult = await this.prisma.$executeRaw`
      INSERT INTO supplementary_summaries
        (created_at, year, province, batch, university_id, total_rounds, total_plan_count, supplementary_rate)
      SELECT
        NOW(),
        sr.year,
        sr.province,
        sr.batch,
        sr.university_id,
        COUNT(DISTINCT sr.round_number) AS total_rounds,
        COALESCE(SUM(sr.plan_count), 0) AS total_plan_count,
        CASE
          WHEN ep_total.total_plan > 0
          THEN ROUND(COALESCE(SUM(sr.plan_count), 0) * 100.0 / ep_total.total_plan, 2)
          ELSE NULL
        END AS supplementary_rate
      FROM supplementary_records sr
      LEFT JOIN (
        SELECT
          ep.university_id,
          ep.year,
          ep.province,
          ep.batch,
          SUM(ep.plan_count) AS total_plan
        FROM enrollment_plans ep
        GROUP BY ep.university_id, ep.year, ep.province, ep.batch
      ) ep_total
        ON ep_total.university_id = sr.university_id
        AND ep_total.year = sr.year
        AND ep_total.province = sr.province
        AND ep_total.batch = sr.batch
      GROUP BY sr.year, sr.province, sr.batch, sr.university_id, ep_total.total_plan
    `;

    this.logger.log(
      `SupplementarySummary refreshed: ${insertResult} rows inserted`,
    );

    return Number(insertResult);
  }
}
