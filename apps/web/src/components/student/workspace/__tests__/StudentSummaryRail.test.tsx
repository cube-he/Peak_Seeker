/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import StudentSummaryRail from '../StudentSummaryRail';

describe('StudentSummaryRail', () => {
  it('shows student identity and numeric context', () => {
    render(
      <StudentSummaryRail
        activePathname="/student/profile"
        profile={{
          realName: '陈意涵',
          highSchool: '成都七中',
          classInfo: '高三 3 班',
          totalScore: 644,
          provincialRank: 8240,
        }}
        progress={{ overallCompleteness: 72, isRecommendable: true }}
        plansCount={3}
      />,
    );

    expect(screen.getByText('陈意涵')).toBeInTheDocument();
    expect(screen.getByText('成都七中 · 高三 3 班')).toBeInTheDocument();
    expect(screen.getByText('644')).toBeInTheDocument();
    expect(screen.getByText('8,240')).toBeInTheDocument();
    expect(screen.getByText('72%')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('uses fallback labels when profile values are missing', () => {
    render(
      <StudentSummaryRail
        activePathname="/student/dashboard"
        profile={{ username: 'student01' }}
      />,
    );

    expect(screen.getByText('student01')).toBeInTheDocument();
    expect(screen.getAllByText('--').length).toBeGreaterThanOrEqual(3);
  });

  it('marks the active navigation link', () => {
    render(
      <StudentSummaryRail
        activePathname="/student/plans/1"
        profile={{ realName: '陈意涵' }}
      />,
    );

    expect(screen.getByRole('link', { name: /方案/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
