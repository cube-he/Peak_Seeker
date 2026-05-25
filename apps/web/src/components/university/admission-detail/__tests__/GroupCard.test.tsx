/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import GroupCard from '../GroupCard';
import type { GroupedAdmission } from '@/utils/group-admissions';

const baseGroup: GroupedAdmission = {
  year: 2024,
  subjects: '物理类',
  batch: '本科一批 B段',
  groupCode: '9999',
  groupName: '工科试验班',
  groupMinScore: 612,
  groupMinRank: 4521,
  groupAdmissionCount: 45,
  majors: [
    { majorCode: '080901', majorName: '计算机', majorMinScore: 615, majorMinRank: 4380, planCount: 10,
      extras: { majorRanking: '12', disciplineEval: null, isNationalFeature: false } },
    { majorCode: '080902', majorName: '软件工程', majorMinScore: 612, majorMinRank: 4521, planCount: 8,
      extras: { majorRanking: null, disciplineEval: null, isNationalFeature: false } },
  ],
};

const otherYears: GroupedAdmission[] = [
  { ...baseGroup, year: 2023, groupMinScore: 608, groupMinRank: 4890, majors: [] },
  { ...baseGroup, year: 2022, groupMinScore: 605, groupMinRank: 5200, majors: [] },
];

describe('GroupCard', () => {
  it('卡头显示组代码、组名、批次、招生人数', () => {
    render(<GroupCard group={baseGroup} multiYearGroups={[baseGroup, ...otherYears]} tier="rush" diffText="差 2279 名" userRank={6800} />);
    expect(screen.getByText(/9999/)).toBeInTheDocument();
    expect(screen.getByText(/工科试验班/)).toBeInTheDocument();
    expect(screen.getByText(/本科一批 B段/)).toBeInTheDocument();
    expect(screen.getByText(/45/)).toBeInTheDocument();
  });

  it('卡头显示 3 年数据（按年份降序）', () => {
    render(<GroupCard group={baseGroup} multiYearGroups={[baseGroup, ...otherYears]} tier="rush" diffText={null} userRank={null} />);
    expect(screen.getByText('2024')).toBeInTheDocument();
    expect(screen.getByText('2023')).toBeInTheDocument();
    expect(screen.getByText('2022')).toBeInTheDocument();
  });

  it('tier=rush 时显示 "冲" chip', () => {
    render(<GroupCard group={baseGroup} multiYearGroups={[baseGroup]} tier="rush" diffText="差 100 名" userRank={5000} />);
    expect(screen.getByText('冲')).toBeInTheDocument();
  });

  it('tier=stable 显示 "稳"', () => {
    render(<GroupCard group={baseGroup} multiYearGroups={[baseGroup]} tier="stable" diffText="高出 100 名" userRank={5000} />);
    expect(screen.getByText('稳')).toBeInTheDocument();
  });

  it('userRank 为 null 时不显示 tier chip 和 diffText', () => {
    render(<GroupCard group={baseGroup} multiYearGroups={[baseGroup]} tier="unknown" diffText={null} userRank={null} />);
    expect(screen.queryByText('冲')).toBeNull();
    expect(screen.queryByText('稳')).toBeNull();
  });

  it('默认折叠，不显示组内专业行', () => {
    render(<GroupCard group={baseGroup} multiYearGroups={[baseGroup]} tier="rush" diffText={null} userRank={null} />);
    expect(screen.queryByText('计算机')).toBeNull();
  });

  it('点击展开按钮后显示组内专业', () => {
    render(<GroupCard group={baseGroup} multiYearGroups={[baseGroup]} tier="rush" diffText={null} userRank={null} />);
    fireEvent.click(screen.getByRole('button', { name: /展开|折叠/ }));
    expect(screen.getByText('计算机')).toBeInTheDocument();
    expect(screen.getByText('软件工程')).toBeInTheDocument();
  });
});
