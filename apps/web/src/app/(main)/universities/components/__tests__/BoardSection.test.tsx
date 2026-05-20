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
  it('shows the group title and the first board by default', () => {
    render(<BoardSection group={group} />);
    expect(screen.getByText('川内')).toBeInTheDocument();
    expect(screen.getByText('本科甲')).toBeInTheDocument();
  });

  it('switches board when the 专科榜 toggle is clicked', async () => {
    render(<BoardSection group={group} />);
    await userEvent.click(screen.getByText('专科榜'));
    expect(screen.getByText('专科甲')).toBeInTheDocument();
    expect(screen.queryByText('本科甲')).not.toBeInTheDocument();
  });

  it('hides toggle buttons when group has only one board', () => {
    const singleGroup: BoardGroup = {
      groupKey: 'national-elite', groupTitle: '全国名校榜',
      boards: [
        { key: 'national-elite', title: '全国名校榜', groupKey: 'national-elite', groupTitle: '全国名校榜', level: '本科', items: [] },
      ],
    };
    render(<BoardSection group={singleGroup} />);
    expect(screen.queryByText('本科榜')).not.toBeInTheDocument();
    expect(screen.queryByText('专科榜')).not.toBeInTheDocument();
  });

  it('expands and collapses when board has more than 10 items', async () => {
    const manyItems = Array.from({ length: 11 }, (_, i) => item(i + 1, `院校${i + 1}`));
    const expandGroup: BoardGroup = {
      groupKey: 'sichuan', groupTitle: '川内',
      boards: [
        { key: 'sichuan-undergrad', title: '川内本科榜', groupKey: 'sichuan', groupTitle: '川内', level: '本科', items: manyItems },
      ],
    };
    render(<BoardSection group={expandGroup} />);

    // 第 11 条初始不可见
    expect(screen.queryByText('院校11')).not.toBeInTheDocument();

    // 有「查看完整榜单」展开按钮
    const expandBtn = screen.getByText(/查看完整榜单/);
    expect(expandBtn).toBeInTheDocument();

    // 点击展开
    await userEvent.click(expandBtn);

    // 第 11 条现在可见，按钮变「收起」
    expect(screen.getByText('院校11')).toBeInTheDocument();
    expect(screen.getByText(/收起/)).toBeInTheDocument();
  });
});
