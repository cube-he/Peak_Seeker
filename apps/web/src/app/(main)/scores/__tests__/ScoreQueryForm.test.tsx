/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import { ScoreQueryForm } from '../ScoreQueryForm';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(),
  })),
});

describe('ScoreQueryForm', () => {
  it('shows province as a fixed 四川 read-only field', () => {
    render(<ScoreQueryForm onSubmit={jest.fn()} loading={false} />);
    expect(screen.getByText('四川')).toBeInTheDocument();
  });

  it('submits subjects and score when the query button is clicked', () => {
    const onSubmit = jest.fn();
    render(
      <ScoreQueryForm
        onSubmit={onSubmit}
        loading={false}
        defaultSubjects="物理"
        defaultScore={600}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /查.?询/ }));

    expect(onSubmit).toHaveBeenCalledWith({ subjects: '物理', score: 600 });
  });

  it('does not render a range input or mode cards', () => {
    render(<ScoreQueryForm onSubmit={jest.fn()} loading={false} />);
    expect(screen.queryByText('浮动范围')).not.toBeInTheDocument();
    expect(screen.queryByText('按位次查')).not.toBeInTheDocument();
  });
});
