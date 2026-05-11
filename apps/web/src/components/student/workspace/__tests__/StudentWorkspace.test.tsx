/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import {
  StudentWorkspace,
  StudentWorkspacePanel,
} from '../StudentWorkspace';

describe('StudentWorkspace', () => {
  it('renders rail, main content, and aside in separate landmark regions', () => {
    render(
      <StudentWorkspace
        rail={<div>Rail content</div>}
        aside={<div>Aside content</div>}
      >
        <div>Main content</div>
      </StudentWorkspace>,
    );

    expect(
      screen.getByRole('complementary', { name: '学生工作台导航' }),
    ).toHaveTextContent('Rail content');
    expect(screen.getByTestId('student-workspace-main')).toHaveTextContent('Main content');
    expect(
      screen.getByRole('complementary', { name: '学生工作台辅助信息' }),
    ).toHaveTextContent('Aside content');
  });

  it('does not render an aside region when aside content is absent', () => {
    const { container } = render(
      <StudentWorkspace rail={<div>Rail content</div>}>
        <div>Main content</div>
      </StudentWorkspace>,
    );

    expect(
      screen.queryByRole('complementary', { name: '学生工作台辅助信息' }),
    ).not.toBeInTheDocument();
    expect(container.firstChild).not.toHaveClass(
      'xl:grid-cols-[250px_minmax(0,1fr)_300px]',
    );
  });

  it('renders a titled workspace panel with optional action', () => {
    render(
      <StudentWorkspacePanel
        title="资料完整度"
        action={<a href="/student/profile/stage/1">继续完善</a>}
      >
        <p>64%</p>
      </StudentWorkspacePanel>,
    );

    expect(screen.getByText('资料完整度')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '继续完善' })).toHaveAttribute(
      'href',
      '/student/profile/stage/1',
    );
    expect(screen.getByText('64%')).toBeInTheDocument();
  });
});
