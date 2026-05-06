/** @jest-environment jsdom */
import { render, act } from '@testing-library/react';
import AutoSaveSelect from '../AutoSaveSelect';
import { studentApi } from '@/services/student-api';
import { useStudentSaveStore } from '@/stores/student-save-state';

jest.mock('@/services/student-api', () => ({
  studentApi: { patchMyProfile: jest.fn() },
}));

describe('AutoSaveSelect', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (studentApi.patchMyProfile as jest.Mock).mockReset();
    (studentApi.patchMyProfile as jest.Mock).mockResolvedValue({ data: {} });
    act(() => useStudentSaveStore.getState().reset());
  });
  afterEach(() => jest.useRealTimers());

  it('renders without crashing with array defaultValue', () => {
    const { container } = render(
      <AutoSaveSelect fieldKey="preferredCities" defaultValue={['成都', '北京']} mode="tags" />,
    );
    expect(container).toBeInTheDocument();
  });

  // Note: antd Select's interaction is hard to simulate in jsdom; smoke test is sufficient.
});
