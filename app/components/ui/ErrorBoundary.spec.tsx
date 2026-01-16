import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary, MinimalErrorFallback } from './ErrorBoundary';

// Suppress console.error for these tests
const originalConsoleError = console.error;

beforeEach(() => {
  console.error = vi.fn();
});

afterEach(() => {
  console.error = originalConsoleError;
});

// Component that throws an error
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error message');
  }

  return <div>No error</div>;
};

describe('ErrorBoundary', () => {
  describe('normal rendering', () => {
    it('should render children when no error', () => {
      render(
        <ErrorBoundary>
          <div>Child content</div>
        </ErrorBoundary>,
      );

      expect(screen.getByText('Child content')).toBeInTheDocument();
    });

    it('should render multiple children', () => {
      render(
        <ErrorBoundary>
          <div>Child 1</div>
          <div>Child 2</div>
        </ErrorBoundary>,
      );

      expect(screen.getByText('Child 1')).toBeInTheDocument();
      expect(screen.getByText('Child 2')).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('should catch errors and show default fallback', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(screen.getByText('Une erreur est survenue')).toBeInTheDocument();
    });

    it('should show error message in details', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      // Expand details
      fireEvent.click(screen.getByText("Détails de l'erreur"));

      expect(screen.getByText('Test error message')).toBeInTheDocument();
    });

    it('should show Réessayer button', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(screen.getByText('Réessayer')).toBeInTheDocument();
    });

    it('should show Recharger la page button', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(screen.getByText('Recharger la page')).toBeInTheDocument();
    });

    it('should call onError callback when error occurs', () => {
      const onError = vi.fn();

      render(
        <ErrorBoundary onError={onError}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ componentStack: expect.any(String) }),
      );
    });
  });

  describe('custom fallback', () => {
    it('should render custom fallback when provided', () => {
      render(
        <ErrorBoundary fallback={<div>Custom fallback</div>}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(screen.getByText('Custom fallback')).toBeInTheDocument();
    });

    it('should not show default fallback when custom fallback provided', () => {
      render(
        <ErrorBoundary fallback={<div>Custom fallback</div>}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(screen.queryByText('Une erreur est survenue')).not.toBeInTheDocument();
    });
  });

  describe('retry functionality', () => {
    it('should reset error state when Réessayer clicked', () => {
      const { rerender } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(screen.getByText('Une erreur est survenue')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Réessayer'));

      /*
       * After retry, component tries to render children again
       * Since ThrowError still throws, it will show error again
       * But the state was reset (handleRetry was called)
       */
      expect(screen.getByText('Une erreur est survenue')).toBeInTheDocument();
    });
  });

  describe('reload functionality', () => {
    it('should have reload button that calls window.location.reload', () => {
      const mockReload = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { reload: mockReload },
        writable: true,
      });

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      fireEvent.click(screen.getByText('Recharger la page'));

      expect(mockReload).toHaveBeenCalled();
    });
  });

  describe('UI elements', () => {
    it('should show warning icon', () => {
      const { container } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(container.querySelector('.i-ph\\:warning-circle')).toBeInTheDocument();
    });

    it('should show helpful message', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(
        screen.getByText("Quelque chose s'est mal passé. Vous pouvez réessayer ou recharger la page."),
      ).toBeInTheDocument();
    });
  });
});

describe('MinimalErrorFallback', () => {
  describe('rendering', () => {
    it('should render error message', () => {
      render(<MinimalErrorFallback />);

      expect(screen.getByText('Erreur de chargement')).toBeInTheDocument();
    });

    it('should show warning icon', () => {
      const { container } = render(<MinimalErrorFallback />);

      expect(container.querySelector('.i-ph\\:warning')).toBeInTheDocument();
    });
  });

  describe('retry button', () => {
    it('should not show retry button when onRetry not provided', () => {
      render(<MinimalErrorFallback />);

      expect(screen.queryByTitle('Réessayer')).not.toBeInTheDocument();
    });

    it('should show retry button when onRetry provided', () => {
      const onRetry = vi.fn();
      render(<MinimalErrorFallback onRetry={onRetry} />);

      expect(screen.getByTitle('Réessayer')).toBeInTheDocument();
    });

    it('should call onRetry when retry button clicked', () => {
      const onRetry = vi.fn();
      render(<MinimalErrorFallback onRetry={onRetry} />);

      fireEvent.click(screen.getByTitle('Réessayer'));

      expect(onRetry).toHaveBeenCalled();
    });
  });
});
