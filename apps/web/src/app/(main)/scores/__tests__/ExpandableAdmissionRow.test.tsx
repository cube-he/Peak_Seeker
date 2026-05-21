/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExpandableAdmissionRow } from '../ExpandableAdmissionRow';
import type { AggregatedAdmissionListItem } from '@volunteer-helper/shared';
import { admissionService } from '@/services/admission';

jest.mock('@/services/admission', () => ({
  admissionService: { getAggregatedDetail: jest.fn() },
}));

jest.mock('@/components/university/UniversityLogo', () => ({
  __esModule: true,
  default: () => null,
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(),
  })),
});

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

describe('ExpandableAdmissionRow', () => {
  beforeEach(() => {
    (admissionService.getAggregatedDetail as jest.Mock).mockReset();
  });

  it('renders an expand toggle and is collapsed by default', () => {
    render(<ExpandableAdmissionRow item={makeItem(1)} userRank={12000} />);
    expect(screen.getByRole('button', { name: /展.?开/ })).toBeInTheDocument();
    expect(screen.queryByText('历年录取数据')).not.toBeInTheDocument();
  });

  it('fetches detail and renders the expanded row when toggled open', async () => {
    (admissionService.getAggregatedDetail as jest.Mock).mockResolvedValue({
      universityId: 1,
      majorCode: 'M1',
      groupCode: 'G1',
      batch: '本科一批',
      recruitType: '普通类',
      subjects: '物理',
      yearlyData: [
        {
          year: 2024,
          majorMinScore: 600,
          majorMinRank: 12000,
          majorAvgScore: 610,
          majorAvgRank: 10000,
          majorAdmissionCount: 30,
          groupMinScore: 598,
          groupMinRank: 12500,
          groupAdmissionCount: 90,
        },
      ],
      currentPlan: null,
      supplementary: null,
    });

    render(<ExpandableAdmissionRow item={makeItem(1)} userRank={12000} />);

    fireEvent.click(screen.getByRole('button', { name: /展.?开/ }));

    await waitFor(() => {
      expect(admissionService.getAggregatedDetail).toHaveBeenCalledWith({
        universityId: 1,
        majorCode: 'M1',
        groupCode: 'G1',
        batch: '本科一批',
        recruitType: '普通类',
        province: '四川',
        subjects: '物理',
      });
    });
    await waitFor(() => {
      expect(screen.getByText('历年录取数据')).toBeInTheDocument();
    });
  });
});
