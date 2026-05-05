import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';
import { StudentService } from './student.service';
import { INTAKE_CELL_MAP, computeIntakeValue } from './intake-cell-map';

/**
 * 模板路径：从编译产物 dist/.../intake-export.service.js 出发回溯到 apps/server/templates/。
 * 开发时 ts-jest 直接读 src/，路径同样指向 apps/server/templates/。
 */
const TEMPLATE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'templates',
  'intake-form-2025-v1.xlsx',
);

@Injectable()
export class IntakeExportService {
  constructor(private studentService: StudentService) {}

  /**
   * 导出学生接待单 xlsx。
   * 老师/管理员视角，不过滤 ① 字段；学生端不应调到此服务（CASL 已约束）。
   */
  async export(studentId: number): Promise<ArrayBuffer> {
    const profile = await this.studentService.findById(studentId);
    if (!profile) throw new NotFoundException('学生不存在');

    if (!fs.existsSync(TEMPLATE_PATH)) {
      throw new InternalServerErrorException(
        `接待单模板缺失: ${TEMPLATE_PATH}`,
      );
    }

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(TEMPLATE_PATH);
    const ws = wb.getWorksheet('Sheet1');
    if (!ws) {
      throw new InternalServerErrorException('模板 Sheet1 不存在');
    }

    const profileRecord = profile as Record<string, any>;
    const userRecord = (profile as any).user as Record<string, any> | undefined;

    for (const map of INTAKE_CELL_MAP) {
      let raw: unknown = null;
      if (map.source.kind === 'user') {
        raw = userRecord?.[map.source.field];
      } else if (map.source.kind === 'profile') {
        raw = profileRecord[map.source.field];
      } else if (map.source.kind === 'computed') {
        raw = computeIntakeValue(map.source.key, profileRecord, userRecord);
      }
      const value = map.transform ? map.transform(raw) : raw;
      // 跳过 null/undefined/空字符串：保留模板原值（可能是占位符）
      if (value !== null && value !== undefined && value !== '') {
        ws.getCell(map.cell).value = value as ExcelJS.CellValue;
      }
    }

    return wb.xlsx.writeBuffer();
  }
}
