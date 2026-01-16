import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

// Create mock stores
const { mockThemeStore, mockToggleTheme } = vi.hoisted(() => {
  const { atom } = require('nanostores');
  return {
    mockThemeStore: atom('light'),
    mockToggleTheme: vi.fn(),
  };
});

// Mock stores
vi.mock('~/lib/stores/theme', () => ({
  themeStore: mockThemeStore,
  toggleTheme: mockToggleTheme,
}));

// Mock IconButton
vi.mock('./IconButton', () => ({
  IconButton: ({ icon, title, onClick, className, size }: any) => (
    <button onClick={onClick} title={title} className={className} data-icon={icon} data-size={size}>
      Icon Button
    </button>
  ),
}));

// Import after mocks
import { ThemeSwitch } from './ThemeSwitch';

describe('ThemeSwitch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockThemeStore.set('light');
  });

  describe('rendering', () => {
    it('should render the theme switch button', async () => {
      render(<ThemeSwitch />);

      // In tests, useEffect runs synchronously, so component renders immediately
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(screen.getByTitle('Changer le thème')).toBeInTheDocument();
    });
  });

  describe('theme icons', () => {
    it('should show sun icon when theme is dark', async () => {
      mockThemeStore.set('dark');

      render(<ThemeSwitch />);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const button = screen.getByTitle('Changer le thème');
      expect(button).toHaveAttribute('data-icon', 'i-ph-sun-dim-duotone');
    });

    it('should show moon icon when theme is light', async () => {
      mockThemeStore.set('light');

      render(<ThemeSwitch />);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const button = screen.getByTitle('Changer le thème');
      expect(button).toHaveAttribute('data-icon', 'i-ph-moon-stars-duotone');
    });
  });

  describe('interaction', () => {
    it('should call toggleTheme when clicked', async () => {
      render(<ThemeSwitch />);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      fireEvent.click(screen.getByTitle('Changer le thème'));

      expect(mockToggleTheme).toHaveBeenCalled();
    });
  });

  describe('props', () => {
    it('should pass className to IconButton', async () => {
      render(<ThemeSwitch className="custom-class" />);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const button = screen.getByTitle('Changer le thème');
      expect(button).toHaveClass('custom-class');
    });

    it('should use xl size', async () => {
      render(<ThemeSwitch />);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const button = screen.getByTitle('Changer le thème');
      expect(button).toHaveAttribute('data-size', 'xl');
    });
  });

  describe('memoization', () => {
    it('should be memoized', () => {
      expect(ThemeSwitch).toBeDefined();
      expect(typeof ThemeSwitch).toBe('object'); // memo components are objects
    });
  });
});
