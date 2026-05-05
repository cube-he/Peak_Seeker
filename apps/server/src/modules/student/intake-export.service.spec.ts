import * as ExcelJS from 'exceljs';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { IntakeExportService } from './intake-export.service';
import { StudentService } from './student.service';

describe('IntakeExportService', () => {
  let service: IntakeExportService;
  let studentService: { findById: jest.Mock };

  beforeEach(async () => {
    studentService = { findById: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntakeExportService,
        { provide: StudentService, useValue: studentService },
      ],
    }).compile();
    service = module.get(IntakeExportService);
  });

  /** Helper: 把 ArrayBuffer 还原成 ExcelJS Workbook 并取指定单元格的值 */
  async function getCell(
    buffer: ArrayBuffer,
    cell: string,
  ): Promise<ExcelJS.CellValue> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet('Sheet1');
    if (!ws) throw new Error('Sheet1 missing');
    return ws.getCell(cell).value;
  }

  it('总分写入 B16', async () => {
    studentService.findById.mockResolvedValue({
      id: 1,
      user: { realName: '小王', gender: 'MALE', phone: '13800000000', ethnicity: '汉' },
      totalScore: 600,
      provincialRank: 1234,
      politicalStatus: 'LEAGUE_MEMBER',
    });
    const buf = await service.export(1);
    expect(await getCell(buf, 'B16')).toBe(600);
  });

  it('姓名写入 B2', async () => {
    studentService.findById.mockResolvedValue({
      id: 1,
      user: { realName: '小李', gender: 'FEMALE', phone: '139', ethnicity: '汉' },
    });
    const buf = await service.export(1);
    expect(await getCell(buf, 'B2')).toBe('小李');
  });

  it('性别中文转换写入 B3（FEMALE → 女）', async () => {
    studentService.findById.mockResolvedValue({
      id: 1,
      user: { realName: '小李', gender: 'FEMALE' },
    });
    const buf = await service.export(1);
    expect(await getCell(buf, 'B3')).toBe('女');
  });

  it('户籍 / 高考所在地拼接', async () => {
    studentService.findById.mockResolvedValue({
      id: 1,
      user: { realName: '小王' },
      province: '四川', city: '成都', county: '武侯区',
      examLocationProvince: '四川', examLocationCity: '成都', examLocationCounty: '高新区',
    });
    const buf = await service.export(1);
    expect(await getCell(buf, 'D2')).toBe('四川/成都/武侯区');
    expect(await getCell(buf, 'D3')).toBe('四川/成都/高新区');
  });

  it('视力左右拼接（C7）', async () => {
    studentService.findById.mockResolvedValue({
      id: 1,
      user: { realName: '小王' },
      visionLeft: 5.0,
      visionRight: 4.8,
    });
    const buf = await service.export(1);
    // ExcelJS 把 "5/4.8" 当字符串写入；不强求 5.0 显示为 "5.0"
    expect(await getCell(buf, 'C7')).toBe('5/4.8');
  });

  it('政治面貌枚举 → 中文勾选框（B5）', async () => {
    studentService.findById.mockResolvedValue({
      id: 1,
      user: { realName: '小王' },
      politicalStatus: 'PARTY_MEMBER',
    });
    const buf = await service.export(1);
    const v = await getCell(buf, 'B5');
    expect(typeof v).toBe('string');
    expect(v).toContain('党员☑');
  });

  it('preferredMajors 数组拼接（B22）', async () => {
    studentService.findById.mockResolvedValue({
      id: 1,
      user: { realName: '小王' },
      preferredMajors: ['计算机', '软件工程', '人工智能'],
    });
    const buf = await service.export(1);
    expect(await getCell(buf, 'B22')).toBe('计算机、软件工程、人工智能');
  });

  it('学生不存在抛 NotFoundException', async () => {
    studentService.findById.mockRejectedValue(new NotFoundException());
    await expect(service.export(999)).rejects.toThrow(NotFoundException);
  });
});
