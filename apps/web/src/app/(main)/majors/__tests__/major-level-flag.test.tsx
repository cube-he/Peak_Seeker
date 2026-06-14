/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { MajorCard } from '../page';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(),
  })),
});

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
}));
jest.mock('@/components/layout/MainLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const baseMajor = { id: 1, name: '护理', code: '6301', category: '医学', level: '专科' };
const noop = () => {};
const props = {
  favorited: false, onToggleFav: noop, inCompare: false, onToggleCompare: noop,
  poolEnabled: false, inPool: false, onAddToPool: noop, signal: null,
};

it('本科生看专科专业 → 显示 (专科)', () => {
  render(<MajorCard major={baseMajor} eligibleLevel="本科" {...props} />);
  expect(screen.getByText('（专科）')).toBeInTheDocument();
});

it('专科生看专科专业 → 不标', () => {
  render(<MajorCard major={baseMajor} eligibleLevel="专科" {...props} />);
  expect(screen.queryByText('（专科）')).toBeNull();
});
