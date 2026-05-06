/** @jest-environment jsdom */
import { render, screen, fireEvent, act } from '@testing-library/react';
import AutoSaveCheckbox from '../AutoSaveCheckbox';
import { studentApi } from '@/services/student-api';
import { useStudentSaveStore } from '@/stores/student-save-state';

jest.mock('@/services/student-api', () => ({
  studentApi: { patchMyProfile: jest.fn() },
}));
const mockedPatch = studentApi.patchMyProfile as jest.Mock;

describe('AutoSaveCheckbox', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedPatch.mockReset();
    mockedPatch.mockResolvedValue({ data: {} });
    act(() => useStudentSaveStore.getState().reset());
  });
  afterEach(() => jest.useRealTimers());

  it('commits array of selected values', async () => {
    render(
      <AutoSaveCheckbox
        fieldKey="reChoices"
        options={[
          { label: '化学', value: 'CHEM' },
          { label: '生物', value: 'BIO' },
          { label: '政治', value: 'POL' },
          { label: '地理', value: 'GEO' },
        ]}
        defaultValue={[]}
      />,
    );
    fireEvent.click(screen.getByLabelText('化学'));
    fireEvent.click(screen.getByLabelText('生物'));
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(mockedPatch).toHaveBeenLastCalledWith({ reChoices: ['CHEM', 'BIO'] });
  });
});
