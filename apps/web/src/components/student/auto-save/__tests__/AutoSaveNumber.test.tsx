/** @jest-environment jsdom */
import { render, screen, fireEvent, act } from '@testing-library/react';
import AutoSaveNumber from '../AutoSaveNumber';
import { studentApi } from '@/services/student-api';
import { useStudentSaveStore } from '@/stores/student-save-state';

jest.mock('@/services/student-api', () => ({
  studentApi: { patchMyProfile: jest.fn() },
}));
const mockedPatch = studentApi.patchMyProfile as jest.Mock;

describe('AutoSaveNumber', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedPatch.mockReset();
    mockedPatch.mockResolvedValue({ data: {} });
    act(() => useStudentSaveStore.getState().reset());
  });
  afterEach(() => jest.useRealTimers());

  it('renders defaultValue', () => {
    render(<AutoSaveNumber fieldKey="totalScore" defaultValue={650} />);
    expect(screen.getByRole('spinbutton')).toHaveValue('650');
  });

  it('debounces and PATCHes the numeric value', async () => {
    render(<AutoSaveNumber fieldKey="totalScore" defaultValue={null} />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '650' } });
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(mockedPatch).toHaveBeenCalledWith({ totalScore: 650 });
  });
});
