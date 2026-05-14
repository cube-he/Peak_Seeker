/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TeacherLayout from '../layout';
import { useAuthStore } from '@/stores/authStore';

jest.mock('next/navigation', () => ({
  usePathname: () => '/teacher/dashboard',
}));

jest.mock('@/components/layout/BrandLogo', () => ({
  __esModule: true,
  default: function MockBrandLogo({ href }: { href: string }) {
    return <a href={href}>VolunteerHelper</a>;
  },
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

class MockResizeObserver {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
});

Object.defineProperty(window, 'getComputedStyle', {
  writable: true,
  value: () => ({
    getPropertyValue: () => '',
  }),
});

describe('TeacherLayout', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: 1, username: 'teacher' },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      isLoggedIn: true,
    });
  });

  it('opens the user menu when clicking the avatar', async () => {
    render(
      <TeacherLayout>
        <div>页面内容</div>
      </TeacherLayout>,
    );

    fireEvent.click(screen.getByText('t'));

    await waitFor(() => {
      expect(screen.getByText('个人中心')).toBeInTheDocument();
      expect(screen.getAllByText('退出登录')).toHaveLength(2);
    });
  });
});
