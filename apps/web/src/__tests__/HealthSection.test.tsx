/**
 * @jest-environment jsdom
 */

// antd 内部用 window.matchMedia 做响应式断点，jsdom 没有实现，需要 mock
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }),
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HealthSection from '@/components/student/sections/HealthSection';
import { studentApi } from '@/services/student-api';

jest.mock('@/services/student-api', () => ({
  studentApi: { patchMyProfile: jest.fn().mockResolvedValue({}) },
}));
// auto-save hook 内部也调 studentApi, mock 它们的依赖
jest.mock('@/components/student/auto-save/useAutoSave', () => ({
  useAutoSave: () => ({ commit: jest.fn(), cancel: jest.fn() }),
}));

describe('HealthSection 色觉单 Radio', () => {
  beforeEach(() => { (studentApi.patchMyProfile as jest.Mock).mockClear(); });

  it('profile 初始 (colorBlind=false, colorWeak=false) → 显示「正常」选中', () => {
    render(<HealthSection profile={{ colorBlind: false, colorWeak: false }} />);
    const normal = screen.getByLabelText('正常') as HTMLInputElement;
    expect(normal.checked).toBe(true);
  });

  it('profile 初始 colorBlind=true → 显示「色盲」选中', () => {
    render(<HealthSection profile={{ colorBlind: true, colorWeak: false }} />);
    const blind = screen.getByLabelText('色盲') as HTMLInputElement;
    expect(blind.checked).toBe(true);
  });

  it('profile 初始 colorWeak=true → 显示「色弱」选中', () => {
    render(<HealthSection profile={{ colorBlind: false, colorWeak: true }} />);
    const weak = screen.getByLabelText('色弱') as HTMLInputElement;
    expect(weak.checked).toBe(true);
  });

  it('点「色盲」 → 触发 patchMyProfile({colorBlind:true, colorWeak:false})', async () => {
    const user = userEvent.setup();
    render(<HealthSection profile={{ colorBlind: false, colorWeak: false }} />);
    await user.click(screen.getByLabelText('色盲'));
    expect(studentApi.patchMyProfile).toHaveBeenCalledWith(
      expect.objectContaining({ colorBlind: true, colorWeak: false }),
    );
  });

  it('点「正常」 → 触发 patchMyProfile({colorBlind:false, colorWeak:false})', async () => {
    const user = userEvent.setup();
    render(<HealthSection profile={{ colorBlind: true, colorWeak: false }} />);
    await user.click(screen.getByLabelText('正常'));
    expect(studentApi.patchMyProfile).toHaveBeenCalledWith(
      expect.objectContaining({ colorBlind: false, colorWeak: false }),
    );
  });
});
