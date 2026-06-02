/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CampusSwitcher } from '../CampusSwitcher';
import type { Campus } from '../types';

const campus = (over: Partial<Campus> = {}): Campus => ({
  id: 1,
  name: '本部',
  isMain: true,
  province: '四川', city: '成都', district: '武侯区', address: null,
  latitude: 30.63, longitude: 104.09,
  distanceToCityCenter: null, nearestSubwayMeters: null, nearestAirportKm: null,
  ...over,
});

describe('CampusSwitcher', () => {
  it('单校区 → 不渲染', () => {
    const { container } = render(
      <CampusSwitcher
        campuses={[campus({ id: 1, name: '本部', isMain: true })]}
        selectedCampusId={1}
        onChange={jest.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('多校区 → 渲染所有校区作为可选项', () => {
    render(
      <CampusSwitcher
        campuses={[
          campus({ id: 1, name: '本部', isMain: true }),
          campus({ id: 2, name: '江安', isMain: false, district: '双流区' }),
        ]}
        selectedCampusId={1}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText('本部')).toBeTruthy();
    expect(screen.getByText('江安')).toBeTruthy();
  });

  it('主校区显示「主」标记', () => {
    render(
      <CampusSwitcher
        campuses={[
          campus({ id: 1, name: '本部', isMain: true }),
          campus({ id: 2, name: '江安', isMain: false }),
        ]}
        selectedCampusId={1}
        onChange={jest.fn()}
      />,
    );
    // 主校区有「主」字 badge
    expect(screen.getByText('主')).toBeTruthy();
  });

  it('点击未选校区 → 调用 onChange(id)', () => {
    const onChange = jest.fn();
    render(
      <CampusSwitcher
        campuses={[
          campus({ id: 1, name: '本部', isMain: true }),
          campus({ id: 2, name: '江安', isMain: false }),
        ]}
        selectedCampusId={1}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText('江安'));
    expect(onChange).toHaveBeenCalledWith(2);
  });
});
