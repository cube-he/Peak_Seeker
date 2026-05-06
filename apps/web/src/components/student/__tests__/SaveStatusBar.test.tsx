/** @jest-environment jsdom */
import { render, act } from '@testing-library/react';
import SaveStatusBar from '../SaveStatusBar';
import { useStudentSaveStore } from '@/stores/student-save-state';
import { message } from 'antd';

jest.mock('antd', () => ({
  message: {
    loading: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    destroy: jest.fn(),
  },
}));

describe('SaveStatusBar (toast)', () => {
  beforeEach(() => {
    (message.loading as jest.Mock).mockReset();
    (message.success as jest.Mock).mockReset();
    (message.error as jest.Mock).mockReset();
    (message.destroy as jest.Mock).mockReset();
    act(() => useStudentSaveStore.getState().reset());
  });

  it('calls message.loading on saving', () => {
    render(<SaveStatusBar />);
    act(() => useStudentSaveStore.getState().setSaving());
    expect(message.loading).toHaveBeenCalledWith(
      expect.objectContaining({ content: '保存中…', duration: 0 }),
    );
  });

  it('calls message.success on saved', () => {
    render(<SaveStatusBar />);
    act(() => useStudentSaveStore.getState().setSaved());
    expect(message.success).toHaveBeenCalledWith(
      expect.objectContaining({ content: '已保存', duration: 1.5 }),
    );
  });

  it('calls message.error on error', () => {
    render(<SaveStatusBar />);
    act(() => useStudentSaveStore.getState().setError('网络错误'));
    expect(message.error).toHaveBeenCalledWith(
      expect.objectContaining({ content: '网络错误' }),
    );
  });
});
