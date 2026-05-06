/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import CompactProgress from '../CompactProgress';

describe('CompactProgress', () => {
  it('shows percent and counts', () => {
    render(<CompactProgress percent={60} filled={38} total={64} missing={[]} />);
    expect(screen.getByText('38/64')).toBeInTheDocument();
  });

  it('shows top-3 missing fields with "等N项" suffix', () => {
    render(<CompactProgress percent={50} filled={30} total={64} missing={['a','b','c','d','e']} />);
    expect(screen.getByText(/a、b、c.*等5项/)).toBeInTheDocument();
  });

  it('hides missing block when missing is empty', () => {
    render(<CompactProgress percent={100} filled={64} total={64} missing={[]} />);
    expect(screen.queryByText(/缺：/)).not.toBeInTheDocument();
  });
});
