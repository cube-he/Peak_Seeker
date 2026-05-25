/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import SortButton from '../SortButton';
import type { SortOption } from '../sort-options';

const hotOption: SortOption = { key: 'minRank', label: '位次', group: 'hot', defaultDir: 'asc', lockedAsc: true, requiresExamType: true };
const flexOption: SortOption = { key: 'avgSalary', label: '平均薪资', group: 'employment', defaultDir: 'desc' };

describe('SortButton', () => {
  it('未选时不显示方向图标', () => {
    render(<SortButton option={flexOption} current={null} disabled={false} onChange={jest.fn()} />);
    const btn = screen.getByRole('button', { name: /平均薪资/ });
    expect(btn.textContent).not.toMatch(/↑|↓/);
  });

  it('选中时显示对应方向图标', () => {
    render(<SortButton option={flexOption} current={{ key: 'avgSalary', direction: 'desc' }} disabled={false} onChange={jest.fn()} />);
    const btn = screen.getByRole('button', { name: /平均薪资/ });
    expect(btn.textContent).toMatch(/↓/);
  });

  it('点击未选按钮 → emit defaultDir', () => {
    const onChange = jest.fn();
    render(<SortButton option={flexOption} current={null} disabled={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /平均薪资/ }));
    expect(onChange).toHaveBeenCalledWith('avgSalary', 'desc');
  });

  it('点击 asc → desc (非锁升序)', () => {
    const flexAscOpt: SortOption = { ...flexOption, defaultDir: 'asc' };
    const onChange = jest.fn();
    render(<SortButton option={flexAscOpt} current={{ key: 'avgSalary', direction: 'asc' }} disabled={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /平均薪资/ }));
    expect(onChange).toHaveBeenCalledWith('avgSalary', 'desc');
  });

  it('点击 desc → null (取消)', () => {
    const onChange = jest.fn();
    render(<SortButton option={flexOption} current={{ key: 'avgSalary', direction: 'desc' }} disabled={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /平均薪资/ }));
    expect(onChange).toHaveBeenCalledWith(null, null);
  });

  it('锁升序按钮：点击 asc → null（跳过 desc）', () => {
    const onChange = jest.fn();
    render(<SortButton option={hotOption} current={{ key: 'minRank', direction: 'asc' }} disabled={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /位次/ }));
    expect(onChange).toHaveBeenCalledWith(null, null);
  });

  it('锁升序按钮：不显示 ↓ 图标', () => {
    render(<SortButton option={hotOption} current={{ key: 'minRank', direction: 'asc' }} disabled={false} onChange={jest.fn()} />);
    const btn = screen.getByRole('button', { name: /位次/ });
    expect(btn.textContent).not.toMatch(/↓/);
    expect(btn.textContent).toMatch(/↑/);
  });

  it('disabled 状态：点击无效', () => {
    const onChange = jest.fn();
    render(<SortButton option={hotOption} current={null} disabled={true} onChange={onChange} />);
    const btn = screen.getByRole('button', { name: /位次/ });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onChange).not.toHaveBeenCalled();
  });
});
