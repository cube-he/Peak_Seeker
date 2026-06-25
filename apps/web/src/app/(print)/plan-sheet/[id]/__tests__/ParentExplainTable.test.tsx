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
      city: '成都',
      universityRank: 33,
      groupCode: '01',
      groupPlanCount: 88,
      fallback: false,
      majors: [
        {
          majorCode: '0809',
          majorName: '计算机类',
          planCount: 20,
          planByYear: { 2023: null, 2024: 18, 2025: 20 },
          minScoreByYear: { 2023: null, 2024: 662, 2025: 668 },
          suppByYear: { 2023: null, 2024: null, 2025: { count: 3, rounds: 2 } },
          duration: '四年',
          tuition: 4900,
          planNotes: '色盲色弱不录取',
        },
        {
          majorCode: '0807',
          majorName: '电子信息类',
          planCount: 30,
          planByYear: { 2023: null, 2024: 28, 2025: 30 },
          minScoreByYear: { 2023: null, 2024: 658, 2025: 665 },
          suppByYear: { 2023: null, 2024: null, 2025: null },
          duration: '四年',
          tuition: 4900,
          planNotes: '',
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
    expect(screen.getByText('成都')).toBeInTheDocument();
    expect(screen.getByText('33')).toBeInTheDocument();
    expect(screen.getByText(/组招\s*88\s*人/)).toBeInTheDocument();
  });

  it('缺数据年份显示「—」, 有征集年份显示征集尾注', () => {
    render(<ParentExplainTable sheet={sheet} />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getByText(/征\s*2\s*轮/)).toBeInTheDocument();
  });

  it('梯度标签渲染', () => {
    render(<ParentExplainTable sheet={sheet} />);
    expect(screen.getByText('稳')).toBeInTheDocument();
  });
});
