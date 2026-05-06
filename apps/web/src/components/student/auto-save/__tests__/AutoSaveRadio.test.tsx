/** @jest-environment jsdom */
import { render, screen, fireEvent, act } from '@testing-library/react';
import AutoSaveRadio from '../AutoSaveRadio';
import { studentApi } from '@/services/student-api';
import { useStudentSaveStore } from '@/stores/student-save-state';

jest.mock('@/services/student-api', () => ({
  studentApi: { patchMyProfile: jest.fn() },
}));
const mockedPatch = studentApi.patchMyProfile as jest.Mock;

describe('AutoSaveRadio', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedPatch.mockReset();
    mockedPatch.mockResolvedValue({ data: {} });
    act(() => useStudentSaveStore.getState().reset());
  });
  afterEach(() => jest.useRealTimers());

  it('commits selected option value', async () => {
    render(
      <AutoSaveRadio
        fieldKey="examType"
        options={[
          { label: '物理类', value: 'PHYSICS' },
          { label: '历史类', value: 'HISTORY' },
        ]}
        defaultValue={null}
      />,
    );
    fireEvent.click(screen.getByText('物理类'));
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(mockedPatch).toHaveBeenCalledWith({ examType: 'PHYSICS' });
  });
});
