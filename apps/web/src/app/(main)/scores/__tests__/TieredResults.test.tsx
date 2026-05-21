/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import { TieredResults } from '../TieredResults';
import type { AggregatedAdmissionListItem } from '@volunteer-helper/shared';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(),
  })),
});

jest.mock('@/services/admission', () => ({
  admissionService: { getAggregatedDetail: jest.fn() },
}));

jest.mock('@/components/university/UniversityLogo', () => ({
  __esModule: true,
  default: () => null,
}));

function makeItem(id: number): AggregatedAdmissionListItem {
  return {
    university: {
      id,
      name: '校' + id,
      code: 'C' + id,
      province: '四川',
      city: '成都',
      type: '综合',
      runningNature: '公办',
      is985: false,
      is211: false,
      isDoubleFirstClass: false,
      logoUrl: null,
    },
    major: { id, name: '专业' + id, category: '工学', discipline: '计算机类', softRating: null },
    majorCode: 'M' + id,
    majorName: '专业' + id,
    groupCode: 'G' + id,
    batch: '本科一批',
    subjects: '物理',
    recruitType: '普通类',
    predictedMinRank: {
      point: 12000,
      conservative: 12500,
      optimistic: 11500,
      basisYears: [2024, 2023],
      confidence: 'high',
      targetYear: 2026,
    },
  };
}

describe('TieredResults', () => {
  it('defaults to the stable tab', () => {
    render(
      <TieredResults
        userRank={12000}
        buckets={{
          rush: [makeItem(1)],
          stable: [makeItem(2)],
          safe: [makeItem(3)],
        }}
      />,
    );
    expect(screen.getByText('校2')).toBeInTheDocument();
  });

  it('shows an empty state for a tier with no results', () => {
    render(
      <TieredResults
        userRank={12000}
        buckets={{ rush: [], stable: [makeItem(2)], safe: [] }}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /冲/ }));
    expect(screen.getByText('暂无可冲院校')).toBeInTheDocument();
  });

  it('shows a 加载更多 button when a tier has more than one page of items', () => {
    const manyItems = Array.from({ length: 12 }, (_, i) => makeItem(i + 1));
    render(
      <TieredResults
        userRank={12000}
        buckets={{ rush: [], stable: manyItems, safe: [] }}
      />,
    );
    expect(screen.getByRole('button', { name: '加载更多' })).toBeInTheDocument();
  });
});
