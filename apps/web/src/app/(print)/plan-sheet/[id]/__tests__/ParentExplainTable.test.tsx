/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import ParentExplainTable from '../ParentExplainTable';
import type { ExportSheet } from '../types';

const sheet: ExportSheet = {
  student: { name: '张三', examTypeLabel: '物理类', score: 670, rank: 1000 },
  plan: { id: 7, name: 'v1 方案', year: 2026, batchName: '本科批', version: 1 },
  years: [2023, 2024, 2025],
  groups: [
    {
      sequence: 1,
      gradient: 'WEN',
      gradientLabel: '稳',
      universityName: '电子科技大学',
      universityCode: '0612',
      schoolNature: '公办',
      schoolTags: '985/211/双一流',
      province: '四川',
      city: '成都',
      universityRank: 33,
      groupCode: '01',
      groupPlanCount: 88,
      groupPlanCountVs2025: 8,
      groupMinScore2025: 668,
      subjectRequirement: '物理/化学',
      fallback: false,
      majors: [
        {
          majorCode: '0809',
          majorName: '计算机类',
          planCount: 20,
          planByYear: { 2023: null, 2024: 18, 2025: 20 },
          minRankByYear: { 2023: null, 2024: 1500, 2025: 1200 },
          suppByYear: { 2023: null, 2024: null, 2025: [2, 1] },
          duration: '四年',
          tuition: 4900,
          planNotes: '色盲色弱不录取',
          bookPageNumber: 312,
        },
        {
          majorCode: '0807',
          majorName: '电子信息类',
          planCount: 30,
          planByYear: { 2023: null, 2024: 28, 2025: 30 },
          minRankByYear: { 2023: null, 2024: 1800, 2025: 1600 },
          suppByYear: { 2023: null, 2024: null, 2025: null },
          duration: '四年',
          tuition: 4900,
          planNotes: '',
          bookPageNumber: null,
        },
      ],
    },
  ],
};

describe('ParentExplainTable', () => {
  it('院校名称合并一次, 候选专业各占一行', () => {
    render(<ParentExplainTable sheet={sheet} />);
    expect(screen.getAllByText('电子科技大学')).toHaveLength(1);
    expect(screen.getByText('计算机类')).toBeInTheDocument();
    expect(screen.getByText('电子信息类')).toBeInTheDocument();
    expect(screen.getByText('四川-成都')).toBeInTheDocument(); // 省份-城市
    expect(screen.getByText('33')).toBeInTheDocument();
    expect(screen.getByText(/组招\s*88\s*人/)).toBeInTheDocument();
    expect(screen.getByText('+8')).toBeInTheDocument(); // vs2025 扩招 chip
    expect(screen.getByText(/25组线\s*668\s*分/)).toBeInTheDocument();
    expect(screen.getByText('物理/化学')).toBeInTheDocument(); // 选科列
  });

  it('缺数据年份显示「—」, 有征集年份显示逐轮人数（第1轮\\第2轮）', () => {
    render(<ParentExplainTable sheet={sheet} />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    // 第1轮2人, 第2轮1人 → （2\1）
    expect(screen.getByText('（2\\1）')).toBeInTheDocument();
  });

  it('梯度标签渲染', () => {
    render(<ParentExplainTable sheet={sheet} />);
    expect(screen.getByText('稳')).toBeInTheDocument();
  });

  it('有招生考试报页码显示 P.XX 角标, 无则不显示', () => {
    render(<ParentExplainTable sheet={sheet} />);
    expect(screen.getByText('P.312')).toBeInTheDocument();
    // 第二个专业 bookPageNumber=null → 不应出现任何 P. 角标
    expect(screen.queryAllByText(/^P\./)).toHaveLength(1);
  });
});
