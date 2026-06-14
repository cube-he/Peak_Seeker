/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import PreferredMajorTierEditor from '../PreferredMajorTierEditor';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(),
  })),
});

const options = [
  { label: '护理', value: '护理', levels: { phy: '专科', his: '专科' } },
  { label: '临床医学', value: '临床医学', levels: { phy: '本科', his: '本科' } },
];

it('本科生意向池里的专科专业 chip 标 (专科)', () => {
  render(
    <PreferredMajorTierEditor
      value={[{ tier: 0, majors: ['护理'] }]}
      options={options as any}
      onChange={() => {}}
      eligibleLevel="本科"
      examType="PHYSICS"
    />,
  );
  expect(screen.getByText('（专科）')).toBeInTheDocument();
});
