/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import SortMorePopover from '../SortMorePopover';
import { SORT_OPTIONS } from '../sort-options';

const moreOptions = SORT_OPTIONS.filter((o) => o.group !== 'hot');

describe('SortMorePopover', () => {
  it('按钮 label 包含选项个数', () => {
    render(<SortMorePopover options={moreOptions} current={null} disabled={false} onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: /更多排序/ }).textContent).toMatch(/15/);
  });

  it('默认 popover 内容未展开', () => {
    render(<SortMorePopover options={moreOptions} current={null} disabled={false} onChange={jest.fn()} />);
    expect(screen.queryByText('校友会')).toBeNull();
  });

  it('点击触发按钮后展开 popover 显示 group 标签', () => {
    render(<SortMorePopover options={moreOptions} current={null} disabled={false} onChange={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /更多排序/ }));
    expect(screen.getByText('院校排名')).toBeInTheDocument();
    expect(screen.getByText('学科实力')).toBeInTheDocument();
    expect(screen.getByText('就业表现')).toBeInTheDocument();
    expect(screen.getByText('学生评价')).toBeInTheDocument();
    expect(screen.getByText('其他')).toBeInTheDocument();
  });

  it('展开后点击 SortButton emit 给父组件', () => {
    const onChange = jest.fn();
    render(<SortMorePopover options={moreOptions} current={null} disabled={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /更多排序/ }));
    fireEvent.click(screen.getByRole('button', { name: /校友会/ }));
    expect(onChange).toHaveBeenCalledWith('rankingAlumni', 'asc');
  });
});
