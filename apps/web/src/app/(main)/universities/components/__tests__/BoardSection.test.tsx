/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardSection } from '../BoardSection';
import type { BoardGroup } from '../../lib/groupBoards';
import type { RankedUniversity } from '@/services/university';

jest.mock('@/components/university/UniversityLogo', () => ({
  __esModule: true,
  default: () => null,
}));

const item = (id: number, name: string): RankedUniversity => ({
  rank: id, id, name, logoUrl: null, province: '四川', city: '成都',
  type: '综合', runningNature: '公办', is985: false, is211: false,
  isDoubleFirstClass: false, softRanking: id, admissionMinRank: 1000 + id, admissionMinScore: 600,
});

const group: BoardGroup = {
  groupKey: 'sichuan', groupTitle: '川内',
  boards: [
    { key: 'sichuan-undergrad', title: '川内本科榜', groupKey: 'sichuan', groupTitle: '川内', level: '本科', items: [item(1, '本科甲')] },
    { key: 'sichuan-college', title: '川内专科榜', groupKey: 'sichuan', groupTitle: '川内', level: '专科', items: [item(2, '专科甲')] },
  ],
};

describe('BoardSection', () => {
  it('shows the group title and both boards side by side (no toggle)', () => {
    render(<BoardSection group={group} />);
    expect(screen.getByText('川内')).toBeInTheDocument();
    // 本科榜与专科榜同时渲染，不需要切换
    expect(screen.getByText('本科榜')).toBeInTheDocument();
    expect(screen.getByText('专科榜')).toBeInTheDocument();
    expect(screen.getByText('本科甲')).toBeInTheDocument();
    expect(screen.getByText('专科甲')).toBeInTheDocument();
  });

  it('renders a one-board group without column labels', () => {
    const singleGroup: BoardGroup = {
      groupKey: 'national-elite', groupTitle: '全国名校榜',
      boards: [
        { key: 'national-elite', title: '全国名校榜', groupKey: 'national-elite', groupTitle: '全国名校榜', level: '本科', items: [item(1, '清华大学')] },
      ],
    };
    render(<BoardSection group={singleGroup} />);
    expect(screen.getByText('清华大学')).toBeInTheDocument();
    expect(screen.queryByText('本科榜')).not.toBeInTheDocument();
    expect(screen.queryByText('专科榜')).not.toBeInTheDocument();
  });

  it('expands and collapses a board with more than 10 items', async () => {
    const manyItems = Array.from({ length: 11 }, (_, i) => item(i + 1, `院校${i + 1}`));
    const expandGroup: BoardGroup = {
      groupKey: 'sichuan', groupTitle: '川内',
      boards: [
        { key: 'sichuan-undergrad', title: '川内本科榜', groupKey: 'sichuan', groupTitle: '川内', level: '本科', items: manyItems },
      ],
    };
    render(<BoardSection group={expandGroup} />);

    expect(screen.queryByText('院校11')).not.toBeInTheDocument();
    const expandBtn = screen.getByText(/查看完整榜单/);
    await userEvent.click(expandBtn);
    expect(screen.getByText('院校11')).toBeInTheDocument();
    expect(screen.getByText(/收起/)).toBeInTheDocument();
  });

  it('expands each board column independently', async () => {
    const undergrad = Array.from({ length: 11 }, (_, i) => item(i + 1, `本科${i + 1}`));
    const college = Array.from({ length: 11 }, (_, i) => item(i + 101, `专科${i + 1}`));
    const twoColGroup: BoardGroup = {
      groupKey: 'sichuan', groupTitle: '川内',
      boards: [
        { key: 'sichuan-undergrad', title: '川内本科榜', groupKey: 'sichuan', groupTitle: '川内', level: '本科', items: undergrad },
        { key: 'sichuan-college', title: '川内专科榜', groupKey: 'sichuan', groupTitle: '川内', level: '专科', items: college },
      ],
    };
    render(<BoardSection group={twoColGroup} />);

    const expandBtns = screen.getAllByText(/查看完整榜单/);
    expect(expandBtns).toHaveLength(2);

    // 只展开本科榜那一列，专科榜不受影响
    await userEvent.click(expandBtns[0]);
    expect(screen.getByText('本科11')).toBeInTheDocument();
    expect(screen.queryByText('专科11')).not.toBeInTheDocument();
  });
});
