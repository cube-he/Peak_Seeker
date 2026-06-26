import { buildExportTitle } from '../export-filename';

const base = {
  student: { name: '王润', examTypeLabel: '', score: null, rank: null },
  plan: { id: 1, name: 'v1', year: 2026, batchName: '本科批B段', version: 1 },
};

describe('buildExportTitle', () => {
  it('姓名_批次_志愿方案(家长版)_导出日期', () => {
    expect(buildExportTitle(base as any, new Date(2026, 5, 26))).toBe(
      '王润_本科批B段_志愿方案(家长版)_20260626',
    );
  });

  it('清洗文件名非法字符并合并连续下划线', () => {
    const s = { ...base, student: { ...base.student, name: 'A//B' } };
    expect(buildExportTitle(s as any, new Date(2026, 5, 26))).toBe(
      'A_B_本科批B段_志愿方案(家长版)_20260626',
    );
  });

  it('姓名缺失回退「学生」, 批次缺失则省略', () => {
    const s = { student: { name: '' }, plan: { batchName: null } };
    expect(buildExportTitle(s as any, new Date(2026, 0, 5))).toBe(
      '学生_志愿方案(家长版)_20260105',
    );
  });
});
