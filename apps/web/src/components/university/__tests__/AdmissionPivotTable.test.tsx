/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import AdmissionPivotTable from '../AdmissionPivotTable';

// AntD Table 依赖 matchMedia 做响应式断点，jsdom 未实现，需打桩。
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// 专科院校按「专业组」投档，专业级分数/位次常为空，真实数据落在 group/filing 字段。
const groupOnlyRecord = {
  year: 2025,
  majorId: 6656,
  majorName: '软件技术',
  majorCode: '01',
  groupCode: '101',
  recruitType: '普通类高职(专科)',
  subjects: '历史',
  majorMinScore: null,
  majorMinRank: null,
  majorAdmissionCount: null,
  groupMinScore: 495,
  groupMinRank: 51298,
  groupAdmissionCount: 26,
  filingMinScore: 495,
  filingMinRank: 51298,
};

describe('AdmissionPivotTable', () => {
  it('falls back to group-level score/rank/count when major-level is missing', () => {
    render(<AdmissionPivotTable data={[groupOnlyRecord]} />);
    expect(screen.getByText('495')).toBeInTheDocument();
    expect(screen.getByText('26')).toBeInTheDocument();
    // 位次/分数/人数都兜底成功后，表格里不应再出现「—」
    expect(screen.queryAllByText('—')).toHaveLength(0);
  });

  it('keeps major-level value when it is present (本科不受影响)', () => {
    render(
      <AdmissionPivotTable
        data={[{ ...groupOnlyRecord, majorMinScore: 600, majorMinRank: 9000, majorAdmissionCount: 4 }]}
      />,
    );
    expect(screen.getByText('600')).toBeInTheDocument();
    expect(screen.queryByText('495')).not.toBeInTheDocument();
  });

  it('shows an em dash when every level is missing', () => {
    render(
      <AdmissionPivotTable
        data={[
          {
            ...groupOnlyRecord,
            majorMinScore: null,
            majorMinRank: null,
            majorAdmissionCount: null,
            groupMinScore: null,
            groupMinRank: null,
            groupAdmissionCount: null,
            filingMinScore: null,
            filingMinRank: null,
          },
        ]}
      />,
    );
    expect(screen.queryAllByText('—').length).toBeGreaterThan(0);
  });
});
