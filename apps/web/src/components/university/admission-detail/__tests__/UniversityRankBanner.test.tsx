/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import UniversityRankBanner from '../UniversityRankBanner';

const baseRankInput = {
  latestUniversityMinRank: 28000,
  latestUniversityMinScore: 595,
  latestYear: 2024,
  trendYears: [
    { year: 2023, universityMinScore: 590, universityMinRank: 29200 },
    { year: 2022, universityMinScore: 587, universityMinRank: 30100 },
  ],
};

describe('UniversityRankBanner', () => {
  it('显示最新年大数字 + 位次', () => {
    render(
      <UniversityRankBanner
        subject="物理类"
        batchCategory="本科批"
        rankInput={baseRankInput}
        tier="rush"
        userRank={6800}
        diffText="差 21200 名"
      />
    );
    expect(screen.getByText('595')).toBeInTheDocument();
    expect(screen.getByText(/#28[,\s]?000/)).toBeInTheDocument();
    expect(screen.getByText(/2024 录取/)).toBeInTheDocument();
  });

  it('显示历年趋势', () => {
    render(
      <UniversityRankBanner
        subject="物理类"
        batchCategory="本科批"
        rankInput={baseRankInput}
        tier="rush"
        userRank={6800}
        diffText="差 21200 名"
      />
    );
    expect(screen.getByText('590')).toBeInTheDocument();
    expect(screen.getByText('587')).toBeInTheDocument();
  });

  it('userRank 非空时显示 tier chip + 差额', () => {
    render(
      <UniversityRankBanner
        subject="物理类"
        batchCategory="本科批"
        rankInput={baseRankInput}
        tier="rush"
        userRank={6800}
        diffText="差 21200 名"
      />
    );
    expect(screen.getByText(/冲/)).toBeInTheDocument();
    expect(screen.getByText(/差 21200 名/)).toBeInTheDocument();
  });

  it('userRank 为 null 时显示"输入位次"提示，不显示 tier chip', () => {
    render(
      <UniversityRankBanner
        subject="物理类"
        batchCategory="本科批"
        rankInput={baseRankInput}
        tier="unknown"
        userRank={null}
        diffText={null}
      />
    );
    expect(screen.queryByText('冲')).toBeNull();
    expect(screen.getByText(/输入位次/)).toBeInTheDocument();
  });

  it('数据完全为空时显示降级提示', () => {
    const emptyRankInput = { latestUniversityMinRank: null, latestUniversityMinScore: null, latestYear: null, trendYears: [] };
    render(
      <UniversityRankBanner
        subject="物理类"
        batchCategory="本科批"
        rankInput={emptyRankInput}
        tier="unknown"
        userRank={null}
        diffText={null}
      />
    );
    expect(screen.getByText(/暂无该科类\/批次/)).toBeInTheDocument();
  });
});
