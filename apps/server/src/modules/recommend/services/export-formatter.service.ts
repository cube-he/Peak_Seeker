import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import { ExportFormat } from '../interfaces/recommend.types';
import { BinSamplerService } from './bin-sampler.service';

/**
 * Sub-module 15: Export Formatter
 *
 * Generates exports using exceljs:
 * - Excel full version (A3 landscape, 24 columns, gradient coloring, multi-sheet)
 * - Excel compact version (A4, 12 key columns)
 * - PDF placeholder (note: PDF generation can be added later via puppeteer/pdfmake)
 */
@Injectable()
export class ExportFormatterService {
  private readonly logger = new Logger(ExportFormatterService.name);

  // Gradient colors for Excel rows
  private static readonly GRADIENT_COLORS: Record<string, string> = {
    CHONG: 'FFE8D1', // Light orange for 冲
    WEN: 'D1F0E8', // Light green for 稳
    BAO: 'D1E0F0', // Light blue for 保
  };

  constructor(private readonly prisma: PrismaService) {}

  async export(
    planId: number,
    format: ExportFormat,
  ): Promise<Buffer> {
    const plan = await this.prisma.volunteerPlan.findUnique({
      where: { id: planId },
      include: {
        planItems: { orderBy: { sequence: 'asc' } },
        student: { include: { user: true } },
      },
    });

    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    switch (format) {
      case 'excel_full':
        return this.exportFullExcel(plan);
      case 'excel_compact':
        return this.exportCompactExcel(plan);
      case 'pdf':
        return this.exportPdfPlaceholder(plan);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  // ---- Full Excel (A3 landscape, 24 columns) ----

  private async exportFullExcel(plan: any): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    // Sheet 1: Main plan
    const sheet = workbook.addWorksheet('志愿方案', {
      pageSetup: {
        paperSize: 8 as any, // A3
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    });

    // Header info
    const studentName = plan.student?.user?.realName || '学生';
    const titleRow = sheet.addRow([
      `${studentName} - ${plan.name} (${plan.year}年)`,
    ]);
    titleRow.font = { bold: true, size: 14 };
    sheet.mergeCells('A1:X1');

    const infoRow = sheet.addRow([
      `成绩：${plan.scoreUsed || '-'}分 | 位次：${plan.rankUsed || '-'} | 省份：${plan.province || '四川'} | 模式：${plan.priorityMode || '院校优先'}`,
    ]);
    infoRow.font = { size: 10, color: { argb: '666666' } };
    sheet.mergeCells('A2:X2');

    sheet.addRow([]); // Spacer

    // Column headers (24 columns)
    const headers = [
      '序号', '梯度', '院校名称', '院校代码', '专业组',
      '专业名称', '专业代码', '锚定专业', '组内专业数',
      '推荐排序', '选科要求', '办学性质', '院校标签',
      '25年组投档分', '25年组投档位次', '25年专业分', '25年专业位次',
      '24年专业分', '24年专业位次', '三年均位次',
      '招生计划', '学费', '洁净度', '推荐理由',
    ];

    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true, size: 9 };
    headerRow.alignment = { horizontal: 'center', wrapText: true };

    // Set column widths
    const widths = [
      5, 6, 18, 8, 10, 16, 8, 16, 6,
      20, 12, 8, 14,
      8, 8, 8, 8, 8, 8, 8,
      6, 8, 6, 30,
    ];
    widths.forEach((w, i) => {
      sheet.getColumn(i + 1).width = w;
    });

    // Data rows
    for (const item of plan.planItems) {
      const gradientLabel =
        item.gradient === 'CHONG' ? '冲' :
        item.gradient === 'WEN' ? '稳' : '保';

      const row = sheet.addRow([
        item.sequence,
        gradientLabel,
        item.universityName,
        item.universityCode || '',
        item.groupCode || '',
        item.majorName,
        item.majorCode || '',
        item.anchorMajor || '',
        item.groupMajorCount || '',
        item.recommendedOrder || '',
        item.subjectRequirement || '',
        item.schoolNature || '',
        item.schoolTags || '',
        item.score25Group ?? '',
        item.rank25Group ?? '',
        item.score25Major ?? '',
        item.rank25Major ?? '',
        item.score24Major ?? '',
        item.rank24Major ?? '',
        item.avgMinRank3y ?? '',
        item.planCount ?? '',
        item.tuition ?? '',
        item.cleanliness || '',
        item.selectionReason || '',
      ]);

      // Apply gradient color
      const color =
        ExportFormatterService.GRADIENT_COLORS[item.gradient] || 'FFFFFF';
      row.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: color },
        };
        cell.font = { size: 8 };
        cell.alignment = { wrapText: true, vertical: 'middle' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    }

    // Add borders to header row
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'E0E0E0' },
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    // Sheet 2: Risk warnings
    const riskSheet = workbook.addWorksheet('风险提示');
    riskSheet.addRow(['序号', '院校', '专业', '风险提示']);
    riskSheet.getRow(1).font = { bold: true };

    for (const item of plan.planItems) {
      if (item.riskWarning) {
        riskSheet.addRow([
          item.sequence,
          item.universityName,
          item.majorName,
          item.riskWarning,
        ]);
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // ---- Compact Excel (A4, 12 key columns) ----

  private async exportCompactExcel(plan: any): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('志愿方案(精简)', {
      pageSetup: {
        paperSize: 9, // A4
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    });

    const studentName = plan.student?.user?.realName || '学生';
    const titleRow = sheet.addRow([`${studentName} - ${plan.name}`]);
    titleRow.font = { bold: true, size: 12 };
    sheet.mergeCells('A1:L1');

    sheet.addRow([]);

    const headers = [
      '序号', '梯度', '院校名称', '专业组', '专业名称',
      '选科要求', '25年位次', '24年位次', '三年均位次',
      '招生计划', '学费', '推荐理由',
    ];

    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true, size: 9 };

    const widths = [5, 5, 18, 10, 16, 12, 8, 8, 8, 6, 8, 25];
    widths.forEach((w, i) => {
      sheet.getColumn(i + 1).width = w;
    });

    for (const item of plan.planItems) {
      const gradientLabel =
        item.gradient === 'CHONG' ? '冲' :
        item.gradient === 'WEN' ? '稳' : '保';

      const row = sheet.addRow([
        item.sequence,
        gradientLabel,
        item.universityName,
        item.groupCode || '',
        item.majorName,
        item.subjectRequirement || '',
        item.rank25Major ?? item.rank25Group ?? '',
        item.rank24Major ?? '',
        item.avgMinRank3y ?? '',
        item.planCount ?? '',
        item.tuition ?? '',
        item.selectionReason || '',
      ]);

      const color =
        ExportFormatterService.GRADIENT_COLORS[item.gradient] || 'FFFFFF';
      row.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: color },
        };
        cell.font = { size: 8 };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    }

    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'E0E0E0' },
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // ---- PDF placeholder ----

  private async exportPdfPlaceholder(plan: any): Promise<Buffer> {
    // PDF generation requires additional dependencies (puppeteer or pdfmake).
    // For now, generate an Excel and note that PDF can be added later.
    this.logger.warn(
      'PDF export not yet implemented — generating Excel as fallback',
    );
    return this.exportCompactExcel(plan);
  }
}
