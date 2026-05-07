/** @jest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AutoSavePicker from '../AutoSavePicker';

jest.mock('@/services/student-api', () => ({
  studentApi: {
    patchMyProfile: jest.fn().mockResolvedValue({}),
  },
}));
jest.mock('@/services/user', () => ({
  userService: { updateProfile: jest.fn().mockResolvedValue({}) },
}));

const wrap = (ui: React.ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

const fakeHook = () => ({
  data: [
    { label: '成都市', value: 'CD' },
    { label: '北京市', value: 'BJ' },
    { label: '上海市', value: 'SH' },
  ],
  isLoading: false,
});

describe('AutoSavePicker', () => {
  it('renders default selected values as labels', () => {
    wrap(
      <AutoSavePicker
        fieldKey="preferredCities"
        defaultValue={['CD', 'BJ']}
        optionsHook={fakeHook}
        // jsdom 无真实布局，"responsive" 会把所有 tag 收缩成 "+ N ..."；
        // 传数字避免该行为，确保 label 文本可被断言
        maxTagCount={10}
      />,
    );
    expect(screen.getByText('成都市')).toBeInTheDocument();
    expect(screen.getByText('北京市')).toBeInTheDocument();
  });

  it('does NOT allow free input (mode is multiple, not tags)', async () => {
    const user = userEvent.setup();
    wrap(
      <AutoSavePicker
        fieldKey="preferredCities"
        defaultValue={[]}
        optionsHook={fakeHook}
        maxTagCount={10}
      />,
    );
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, '不存在的城市');
    await user.keyboard('{Enter}');
    // antd "multiple" mode 输入只触发 filter，不会成为新 value（不产生 tag）
    // mirror span（aria-hidden）是搜索框内部辅助元素，不代表选中值；
    // 用 .ant-select-selection-item-content 断言真实 tag 不存在
    const tags = document
      .querySelectorAll('.ant-select-selection-item-content');
    const tagTexts = Array.from(tags).map((el) => el.textContent);
    expect(tagTexts).not.toContain('不存在的城市');
  });

  it('filters dropdown by typed keyword', async () => {
    const user = userEvent.setup();
    wrap(
      <AutoSavePicker
        fieldKey="preferredCities"
        defaultValue={[]}
        optionsHook={fakeHook}
      />,
    );
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, '成');
    await waitFor(() => {
      expect(screen.getByText('成都市')).toBeInTheDocument();
    });
  });
});
