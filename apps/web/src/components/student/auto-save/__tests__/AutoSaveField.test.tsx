/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, act } from '@testing-library/react';
import AutoSaveField from '../AutoSaveField';
import { studentApi } from '@/services/student-api';
import { useStudentSaveStore } from '@/stores/student-save-state';

jest.mock('@/services/student-api', () => ({
  studentApi: {
    patchMyProfile: jest.fn(),
  },
}));

const mockedPatch = studentApi.patchMyProfile as jest.Mock;

describe('AutoSaveField', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedPatch.mockReset();
    act(() => useStudentSaveStore.getState().reset());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('triggers PATCH 1500ms after the last change', async () => {
    mockedPatch.mockResolvedValue({ data: {} });
    render(<AutoSaveField fieldKey="province" defaultValue="" />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '四川' } });
    expect(mockedPatch).not.toHaveBeenCalled();

    await act(async () => { jest.advanceTimersByTime(1499); });
    expect(mockedPatch).not.toHaveBeenCalled();

    await act(async () => { jest.advanceTimersByTime(1); });
    expect(mockedPatch).toHaveBeenCalledWith({ province: '四川' });
  });

  it('debounces multiple rapid changes into one PATCH', async () => {
    mockedPatch.mockResolvedValue({ data: {} });
    render(<AutoSaveField fieldKey="province" defaultValue="" />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '四' } });
    await act(async () => { jest.advanceTimersByTime(500); });
    fireEvent.change(input, { target: { value: '四川' } });
    await act(async () => { jest.advanceTimersByTime(500); });
    fireEvent.change(input, { target: { value: '四川省' } });
    await act(async () => { jest.advanceTimersByTime(1500); });

    expect(mockedPatch).toHaveBeenCalledTimes(1);
    expect(mockedPatch).toHaveBeenCalledWith({ province: '四川省' });
  });

  it('sets save state to saving then saved on success', async () => {
    mockedPatch.mockResolvedValue({ data: {} });
    render(<AutoSaveField fieldKey="province" defaultValue="" />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '四川' } });
    await act(async () => { jest.advanceTimersByTime(1500); });
    await act(async () => { await Promise.resolve(); });

    expect(useStudentSaveStore.getState().state).toBe('saved');
  });

  it('sets save state to error on PATCH failure', async () => {
    mockedPatch.mockRejectedValue(new Error('网络错误'));
    render(<AutoSaveField fieldKey="province" defaultValue="" />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '四川' } });
    await act(async () => { jest.advanceTimersByTime(1500); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    expect(useStudentSaveStore.getState().state).toBe('error');
  });
});
