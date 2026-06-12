/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { RankRow } from '../RankRow';
import type { RankedUniversity } from '@/services/university';

jest.mock('@/components/university/UniversityLogo', () => ({
  __esModule: true,
  default: () => null,
}));

const item: RankedUniversity = {
  rank: 1, id: 5, name: '四川大学', logoUrl: null, province: '四川', city: '成都',
  type: '综合', runningNature: '公办', is985: true, is211: true,
  isDoubleFirstClass: true, softRanking: 14, softRankList: '本科',
  admissionMinRank: 7200, admissionMinScore: 631,
};

describe('RankRow', () => {
  it('renders rank, name and Sichuan admission rank', () => {
    render(<RankRow item={item} />);
    expect(screen.getByText('四川大学')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    // 位次走 toLocaleString 渲染, 带千分位
    expect(screen.getByText('7,200')).toBeInTheDocument();
  });

  it('shows an em dash when admission rank is missing', () => {
    render(<RankRow item={{ ...item, admissionMinRank: null }} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('labels soft ranking with the list (本科/民办/高职) instead of hardcoded "全国"', () => {
    const { rerender } = render(<RankRow item={{ ...item, softRankList: '本科', softRanking: 14 }} />);
    // 渲染格式: "软科 本科#14" (软科与榜名之间有空格)
    expect(screen.getByText(/软科 本科#14/)).toBeInTheDocument();
    rerender(<RankRow item={{ ...item, softRankList: '民办', softRanking: 5 }} />);
    expect(screen.getByText(/软科 民办#5/)).toBeInTheDocument();
    rerender(<RankRow item={{ ...item, softRankList: '高职', softRanking: 22 }} />);
    expect(screen.getByText(/软科 高职#22/)).toBeInTheDocument();
  });

  it('falls back to bare 软科 #N when softRankList is missing (legacy data)', () => {
    render(<RankRow item={{ ...item, softRankList: null, softRanking: 99 }} />);
    expect(screen.getByText(/软科 #99/)).toBeInTheDocument();
  });
});
