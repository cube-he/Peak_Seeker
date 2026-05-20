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
  isDoubleFirstClass: true, softRanking: 14, admissionMinRank: 7200, admissionMinScore: 631,
};

describe('RankRow', () => {
  it('renders rank, name and Sichuan admission rank', () => {
    render(<RankRow item={item} />);
    expect(screen.getByText('四川大学')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('7200')).toBeInTheDocument();
  });

  it('shows an em dash when admission rank is missing', () => {
    render(<RankRow item={{ ...item, admissionMinRank: null }} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
