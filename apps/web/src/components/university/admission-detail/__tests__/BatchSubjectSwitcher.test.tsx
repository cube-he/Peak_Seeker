/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import BatchSubjectSwitcher from '../BatchSubjectSwitcher';

describe('BatchSubjectSwitcher', () => {
  it('渲染 2 个科类按钮 + 3 个批次按钮', () => {
    render(
      <BatchSubjectSwitcher
        subject="物理类"
        batchCategory="本科批"
        onSubjectChange={jest.fn()}
        onBatchChange={jest.fn()}
      />
    );
    expect(screen.getByRole('button', { name: '物理类' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '历史类' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '本科批' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提前批' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '高职专科' })).toBeInTheDocument();
  });

  it('当前选中的按钮带 aria-pressed=true', () => {
    render(
      <BatchSubjectSwitcher
        subject="历史类"
        batchCategory="提前批"
        onSubjectChange={jest.fn()}
        onBatchChange={jest.fn()}
      />
    );
    expect(screen.getByRole('button', { name: '历史类' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '物理类' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '提前批' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('点击科类按钮触发 onSubjectChange', () => {
    const onSubjectChange = jest.fn();
    render(
      <BatchSubjectSwitcher
        subject="物理类"
        batchCategory="本科批"
        onSubjectChange={onSubjectChange}
        onBatchChange={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '历史类' }));
    expect(onSubjectChange).toHaveBeenCalledWith('历史类');
  });

  it('点击批次按钮触发 onBatchChange', () => {
    const onBatchChange = jest.fn();
    render(
      <BatchSubjectSwitcher
        subject="物理类"
        batchCategory="本科批"
        onSubjectChange={jest.fn()}
        onBatchChange={onBatchChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '高职专科' }));
    expect(onBatchChange).toHaveBeenCalledWith('高职专科');
  });
});
