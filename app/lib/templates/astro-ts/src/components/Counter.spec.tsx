import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Counter from './Counter';

describe('Counter', () => {
  it('affiche le compteur initial', () => {
    render(<Counter initialCount={5} />);
    expect(screen.getByText('Compteur: 5')).toBeInTheDocument();
  });

  it('incremente le compteur', () => {
    render(<Counter initialCount={0} />);
    fireEvent.click(screen.getByText('+'));
    expect(screen.getByText('Compteur: 1')).toBeInTheDocument();
  });

  it('decremente le compteur', () => {
    render(<Counter initialCount={5} />);
    fireEvent.click(screen.getByText('-'));
    expect(screen.getByText('Compteur: 4')).toBeInTheDocument();
  });

  it('utilise 0 par defaut', () => {
    render(<Counter />);
    expect(screen.getByText('Compteur: 0')).toBeInTheDocument();
  });
});
