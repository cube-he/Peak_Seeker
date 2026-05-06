/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import ProvenanceBadge from '../ProvenanceBadge';

describe('ProvenanceBadge', () => {
  it('renders nothing when updatedBy is null', () => {
    const { container } = render(<ProvenanceBadge updatedBy={null} updatedAt={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when updatedBy is "student"', () => {
    const { container } = render(
      <ProvenanceBadge updatedBy="student" updatedAt={new Date('2026-05-04')} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders "由老师修改" when updatedBy is "teacher"', () => {
    const recent = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    render(<ProvenanceBadge updatedBy="teacher" updatedAt={recent} />);
    expect(screen.getByText(/由老师修改/)).toBeInTheDocument();
    expect(screen.getByText(/3.*天前/)).toBeInTheDocument();
  });

  it('shows "今天" when updatedAt is within last 24h', () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000);  // 1 hour ago
    render(<ProvenanceBadge updatedBy="teacher" updatedAt={recent} />);
    expect(screen.getByText(/今天/)).toBeInTheDocument();
  });
});
