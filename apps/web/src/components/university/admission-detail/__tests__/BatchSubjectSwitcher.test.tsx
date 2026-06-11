/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import BatchSubjectSwitcher from '../BatchSubjectSwitcher';

// 批次维度已改为 AdmissionDetailTab 内"按批次结构表逐批次展示", switcher 只剩科类切换
describe('BatchSubjectSwitcher', () => {
  it('渲染 2 个科类按钮', () => {
    render(<BatchSubjectSwitcher subject="物理类" onSubjectChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: '物理类' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '历史类' })).toBeInTheDocument();
  });

  it('当前选中的按钮带 aria-pressed=true', () => {
    render(<BatchSubjectSwitcher subject="历史类" onSubjectChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: '历史类' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '物理类' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('点击科类按钮触发 onSubjectChange', () => {
    const onSubjectChange = jest.fn();
    render(<BatchSubjectSwitcher subject="物理类" onSubjectChange={onSubjectChange} />);
    fireEvent.click(screen.getByRole('button', { name: '历史类' }));
    expect(onSubjectChange).toHaveBeenCalledWith('历史类');
  });
});
