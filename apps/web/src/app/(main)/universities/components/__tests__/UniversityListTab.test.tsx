/** @jest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UniversityListTab } from '../UniversityListTab';
import { universityService } from '@/services/university';

// antd Pagination/Grid 使用 matchMedia，jsdom 默认没有该 API
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(),
  })),
});

jest.mock('@/services/university');
jest.mock('@/components/university/UniversityLogo', () => ({
  __esModule: true,
  default: () => null,
}));

const mockedService = universityService as jest.Mocked<typeof universityService>;

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UniversityListTab />
    </QueryClientProvider>,
  );
}

describe('UniversityListTab header', () => {
  beforeEach(() => {
    mockedService.getList.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 12, total: 1893, totalPages: 158 },
    });
    mockedService.getHot.mockResolvedValue([]);
    mockedService.getFilters.mockResolvedValue({
      provinces: [], types: [], cities: [], levels: [], grades: [], natures: [],
    });
  });

  it('shows the real total from the API, not a hardcoded number', async () => {
    renderTab();
    // 等待 h1 内容反映接口返回的 total（接口异步返回前 total=0，之后更新）
    const heading = screen.getByRole('heading', { level: 1 });
    await waitFor(() => {
      expect(heading).toHaveTextContent(/1,?893/);
      expect(heading).not.toHaveTextContent(/2,237/);
    });
  });

  it('renders 物理/历史 exam-type toggle', async () => {
    renderTab();
    expect(await screen.findByRole('button', { name: '物理类' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '历史类' })).toBeInTheDocument();
  });
});
