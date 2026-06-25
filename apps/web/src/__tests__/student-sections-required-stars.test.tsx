/**
 * @jest-environment jsdom
 */
import { render } from '@testing-library/react';
import BasicInfoSection from '@/components/student/sections/BasicInfoSection';
import HukouSection from '@/components/student/sections/HukouSection';
import ScoreSection from '@/components/student/sections/ScoreSection';

// matchMedia mock — antd Grid 响应式需要 (沿用 HealthSection.test.tsx 的 setup)
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: jest.fn(), removeListener: jest.fn(),
      addEventListener: jest.fn(), removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
});

// 全字段 mock auto-save 内部 API 调用
jest.mock('@/services/student-api', () => ({
  studentApi: { patchMyProfile: jest.fn().mockResolvedValue({}) },
}));
jest.mock('@/components/student/auto-save/useAutoSave', () => ({
  useAutoSave: () => ({ commit: jest.fn(), cancel: jest.fn() }),
}));

function requiredLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.ant-form-item-required'))
    .map((el) => el.textContent ?? '');
}

describe('Section 必填红星', () => {
  it('BasicInfoSection: 姓名/手机/性别/民族 红星; 家长手机/政治面貌/填表人/科类 不红星', () => {
    const { container } = render(<BasicInfoSection profile={{}} />);
    const labels = requiredLabels(container);
    expect(labels.some(l => l.includes('姓名'))).toBe(true);
    expect(labels.some(l => l.includes('手机') && !l.includes('家长'))).toBe(true);
    expect(labels.some(l => l.includes('性别'))).toBe(true);
    expect(labels.some(l => l.includes('民族'))).toBe(true);
    expect(labels.some(l => l.includes('家长手机'))).toBe(false);
    expect(labels.some(l => l.includes('科类'))).toBe(false);
    expect(labels.some(l => l.includes('填表人'))).toBe(false);
    expect(labels.some(l => l.includes('政治面貌'))).toBe(false);
  });

  it('HukouSection: 户籍/高考报名地/农村户籍 都红星', () => {
    const { container } = render(<HukouSection profile={{}} />);
    const labels = requiredLabels(container);
    expect(labels.some(l => l.includes('户籍') && !l.includes('农村'))).toBe(true);
    expect(labels.some(l => l.includes('高考报名地'))).toBe(true);
    expect(labels.some(l => l.includes('农村户籍'))).toBe(true);
  });

  it('ScoreSection: 9 项 (年份/成绩来源/语数英/首选分/再选1/再选2/首选/再选) 红星; 总分/位次不红星', () => {
    const { container } = render(<ScoreSection profile={{}} />);
    const labels = requiredLabels(container);
    for (const t of ['高考年份', '成绩来源', '语文', '数学', '英语', '首选科目分', '再选一', '再选二', '首选科目', '再选科目']) {
      expect(labels.some(l => l.includes(t))).toBe(true);
    }
    expect(labels.some(l => l.includes('总分'))).toBe(false);
    expect(labels.some(l => l.includes('位次'))).toBe(false);
  });
});
