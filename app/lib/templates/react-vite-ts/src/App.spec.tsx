import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('affiche le titre correctement', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('affiche le compteur initial à 0', () => {
    render(<App />);
    expect(screen.getByText(/Compteur : 0/)).toBeInTheDocument();
  });

  it('incrémente le compteur au clic', () => {
    render(<App />);

    const button = screen.getByRole('button', { name: /Incrémenter/ });
    fireEvent.click(button);

    expect(screen.getByText(/Compteur : 1/)).toBeInTheDocument();
  });

  it('incrémente plusieurs fois', () => {
    render(<App />);

    const button = screen.getByRole('button', { name: /Incrémenter/ });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(screen.getByText(/Compteur : 3/)).toBeInTheDocument();
  });
});
