const mockRequestUse = jest.fn();
const mockResponseUse = jest.fn();
const mockCreate = jest.fn(() => ({
  defaults: {},
  interceptors: {
    request: { use: mockRequestUse },
    response: { use: mockResponseUse },
  },
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: mockCreate,
    post: jest.fn(),
  },
}));

jest.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({
      accessToken: null,
      refreshToken: null,
      setAccessToken: jest.fn(),
      logout: jest.fn(),
    })),
    setState: jest.fn(),
  },
}));

describe('api client configuration', () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

  beforeEach(() => {
    jest.resetModules();
    mockCreate.mockClear();
    mockRequestUse.mockClear();
    mockResponseUse.mockClear();
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  afterAll(() => {
    if (originalApiUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_URL;
    } else {
      process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    }
  });

  it('uses the same-origin API proxy by default', () => {
    jest.isolateModules(() => {
      require('../api');
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: '/api/v1',
      })
    );
  });
});
