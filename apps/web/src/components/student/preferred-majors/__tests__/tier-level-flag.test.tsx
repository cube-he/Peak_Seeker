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

it('本科生: 专科专业 chip 标(专科), 本科专业 chip 不标', () => {
  render(
    <PreferredMajorTierEditor
      value={[{ tier: 0, majors: ['护理', '临床医学'] }]}
      options={options as any}
      onChange={() => {}}
      eligibleLevel="本科"
      examType="PHYSICS"
    />,
  );
  // 护理(专科)与本科生层次对不上 → 标
  expect(screen.getByText('（专科）')).toBeInTheDocument();
  // 临床医学(本科)与本科生同层 → 不标
  expect(screen.queryByText('（本科）')).toBeNull();
});
