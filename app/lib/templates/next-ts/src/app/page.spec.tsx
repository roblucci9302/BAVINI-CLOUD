import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Home from './page';

describe('Home', () => {
  it('affiche le titre de bienvenue', () => {
    render(<Home />);
    expect(screen.getByText('Bienvenue sur Next.js 14')).toBeInTheDocument();
  });

  it('affiche la description', () => {
    render(<Home />);
    expect(screen.getByText('Application TypeScript avec App Router')).toBeInTheDocument();
  });

  it('liste les fonctionnalités', () => {
    render(<Home />);
    expect(screen.getByText('React 18 avec Server Components')).toBeInTheDocument();
    expect(screen.getByText('TypeScript strict')).toBeInTheDocument();
    expect(screen.getByText('Tests avec Vitest')).toBeInTheDocument();
  });
});
