/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import MajorRow from '../MajorRow';

const baseMajor = {
  majorCode: '080901',
  majorName: '计算机科学与技术',
  majorMinScore: 615,
  majorMinRank: 4380,
  planCount: 10,
  extras: { majorRanking: null as string | null, disciplineEval: null as string | null, isNationalFeature: false },
};

const noMultiYear = [{ year: 2024, majorMinScore: 615, majorMinRank: 4380 }];

describe('MajorRow', () => {
  it('显示专业名 + 代码 + 计划数', () => {
    render(<MajorRow major={baseMajor} multiYearData={noMultiYear} />);
    expect(screen.getByText('计算机科学与技术')).toBeInTheDocument();
    expect(screen.getByText(/080901/)).toBeInTheDocument();
    expect(screen.getByText(/计划 10/)).toBeInTheDocument();
  });

  it('majorRanking 非空时渲染 "软科 #N" chip', () => {
    render(<MajorRow major={{ ...baseMajor, extras: { ...baseMajor.extras, majorRanking: '12' } }} multiYearData={noMultiYear} />);
    expect(screen.getByText(/软科\s*#12/)).toBeInTheDocument();
  });

  it('从 disciplineEval 文本中提取首个等级到 chip', () => {
    render(<MajorRow major={{ ...baseMajor, extras: { ...baseMajor.extras, disciplineEval: '软科：A+，校友会：A' } }} multiYearData={noMultiYear} />);
    expect(screen.getByText('A+')).toBeInTheDocument();
  });

  it('disciplineEval 无可识别等级时用原文本', () => {
    render(<MajorRow major={{ ...baseMajor, extras: { ...baseMajor.extras, disciplineEval: '一般' } }} multiYearData={noMultiYear} />);
    expect(screen.getByText('一般')).toBeInTheDocument();
  });

  it('isNationalFeature 为 true 时显示"国家特色" chip', () => {
    render(<MajorRow major={{ ...baseMajor, extras: { ...baseMajor.extras, isNationalFeature: true } }} multiYearData={noMultiYear} />);
    expect(screen.getByText('国家特色')).toBeInTheDocument();
  });

  it('三个 chip 字段都为空 时不渲染 chip 行', () => {
    const { container } = render(<MajorRow major={baseMajor} multiYearData={noMultiYear} />);
    expect(container.querySelector('[data-testid="major-chips"]')).toBeNull();
  });

  it('多年数据并排显示', () => {
    const multi = [
      { year: 2024, majorMinScore: 615, majorMinRank: 4380 },
      { year: 2023, majorMinScore: 611, majorMinRank: 4720 },
      { year: 2022, majorMinScore: 608, majorMinRank: 5100 },
    ];
    render(<MajorRow major={baseMajor} multiYearData={multi} />);
    expect(screen.getByText('2024')).toBeInTheDocument();
    expect(screen.getByText('2023')).toBeInTheDocument();
    expect(screen.getByText('2022')).toBeInTheDocument();
    expect(screen.getByText(/4380/)).toBeInTheDocument();
    expect(screen.getByText(/4720/)).toBeInTheDocument();
  });
});
