/** @jest-environment jsdom */
import { render, screen, fireEvent, act } from '@testing-library/react';
import AutoSaveTextArea from '../AutoSaveTextArea';
import { studentApi } from '@/services/student-api';
import { useStudentSaveStore } from '@/stores/student-save-state';

jest.mock('@/services/student-api', () => ({
  studentApi: { patchMyProfile: jest.fn() },
}));
const mockedPatch = studentApi.patchMyProfile as jest.Mock;

describe('AutoSaveTextArea', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedPatch.mockReset();
    mockedPatch.mockResolvedValue({ data: {} });
    act(() => useStudentSaveStore.getState().reset());
  });
  afterEach(() => jest.useRealTimers());

  it('commits text after debounce', async () => {
    render(<AutoSaveTextArea fieldKey="careerPlan" defaultValue="" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '考研' } });
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(mockedPatch).toHaveBeenCalledWith({ careerPlan: '考研' });
  });
});
