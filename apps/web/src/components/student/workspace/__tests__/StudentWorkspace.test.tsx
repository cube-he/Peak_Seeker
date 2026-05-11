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

    expect(screen.getByLabelText('学生工作台导航')).toHaveTextContent('Rail content');
    expect(screen.getByRole('main')).toHaveTextContent('Main content');
    expect(screen.getByLabelText('学生工作台辅助信息')).toHaveTextContent('Aside content');
  });

  it('does not render an aside region when aside content is absent', () => {
    render(
      <StudentWorkspace rail={<div>Rail content</div>}>
        <div>Main content</div>
      </StudentWorkspace>,
    );

    expect(screen.queryByLabelText('学生工作台辅助信息')).not.toBeInTheDocument();
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
