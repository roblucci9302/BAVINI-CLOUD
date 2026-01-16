import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// mock nanostores
vi.mock('@nanostores/react', () => ({
  useStore: vi.fn(() => ({ started: false })),
}));

// mock remix-utils
vi.mock('remix-utils/client-only', () => ({
  ClientOnly: ({ children: _children }: { children: () => React.ReactNode }) => null,
}));

// mock internal modules
vi.mock('~/lib/stores/chat', () => ({
  chatStore: { get: () => ({ started: false }) },
}));

vi.mock('./HeaderActionButtons.client', () => ({
  HeaderActionButtons: () => null,
}));

vi.mock('~/lib/persistence/ChatDescription.client', () => ({
  ChatDescription: () => null,
}));

import { Header } from './Header';

describe('Header', () => {
  it('should render the BAVINI logo', () => {
    render(<Header />);

    expect(screen.getByText('BAVINI')).toBeInTheDocument();
  });

  it('should have a link to home', () => {
    render(<Header />);

    const link = screen.getByRole('link', { name: /bavini/i });

    expect(link).toHaveAttribute('href', '/');
  });

  it('should apply gradient animation class to logo', () => {
    render(<Header />);

    const link = screen.getByRole('link', { name: /bavini/i });

    expect(link).toHaveClass('animate-gradient-x');
  });

  it('should apply gradient colors to logo', () => {
    render(<Header />);

    const link = screen.getByRole('link', { name: /bavini/i });

    expect(link).toHaveClass('bg-gradient-to-r');
    expect(link).toHaveClass('from-accent-400');
    expect(link).toHaveClass('via-violet-400');
    expect(link).toHaveClass('to-rose-400');
  });

  it('should have transparent text for gradient effect', () => {
    render(<Header />);

    const link = screen.getByRole('link', { name: /bavini/i });

    expect(link).toHaveClass('text-transparent');
    expect(link).toHaveClass('bg-clip-text');
  });
});
