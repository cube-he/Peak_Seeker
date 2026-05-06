/**
 * @jest-environment jsdom
 */
import { render, screen, act } from '@testing-library/react';
import SaveStatusBar from '../SaveStatusBar';
import { useStudentSaveStore } from '@/stores/student-save-state';

describe('SaveStatusBar', () => {
  beforeEach(() => {
    act(() => useStudentSaveStore.getState().reset());
  });

  it('renders nothing when state is idle', () => {
    const { container } = render(<SaveStatusBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows "保存中…" when state is saving', () => {
    act(() => useStudentSaveStore.getState().setSaving());
    render(<SaveStatusBar />);
    expect(screen.getByText('保存中…')).toBeInTheDocument();
  });

  it('shows "已保存" when state is saved', () => {
    act(() => useStudentSaveStore.getState().setSaved());
    render(<SaveStatusBar />);
    expect(screen.getByText(/已保存/)).toBeInTheDocument();
  });

  it('shows error message when state is error', () => {
    act(() => useStudentSaveStore.getState().setError('网络错误'));
    render(<SaveStatusBar />);
    expect(screen.getByText(/网络错误/)).toBeInTheDocument();
  });
});
