/** @jest-environment jsdom */
import { render, screen, fireEvent, act } from '@testing-library/react';
import AutoSaveSwitch from '../AutoSaveSwitch';
import { studentApi } from '@/services/student-api';
import { useStudentSaveStore } from '@/stores/student-save-state';

jest.mock('@/services/student-api', () => ({
  studentApi: { patchMyProfile: jest.fn() },
}));
const mockedPatch = studentApi.patchMyProfile as jest.Mock;

describe('AutoSaveSwitch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedPatch.mockReset();
    mockedPatch.mockResolvedValue({ data: {} });
    act(() => useStudentSaveStore.getState().reset());
  });
  afterEach(() => jest.useRealTimers());

  it('toggles and commits boolean true', async () => {
    render(<AutoSaveSwitch fieldKey="isRural" defaultValue={false} />);
    fireEvent.click(screen.getByRole('switch'));
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(mockedPatch).toHaveBeenCalledWith({ isRural: true });
  });

  it('treats null defaultValue as false', () => {
    render(<AutoSaveSwitch fieldKey="isRural" defaultValue={null} />);
    expect(screen.getByRole('switch')).not.toBeChecked();
  });
});
