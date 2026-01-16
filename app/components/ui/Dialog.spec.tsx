import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children, className, ...props }: any, ref: any) => (
      <div ref={ref} className={className} {...props}>
        {children}
      </div>
    )),
  },
}));

// Mock easings
vi.mock('~/utils/easings', () => ({
  cubicEasingFn: (t: number) => t,
}));

// Mock radix dialog
vi.mock('@radix-ui/react-dialog', () => ({
  Root: ({ children }: any) => <div data-testid="dialog-root">{children}</div>,
  Close: React.forwardRef(({ children, onClick, asChild }: any, ref: any) => (
    <button ref={ref} onClick={onClick} data-testid="dialog-close">
      {children}
    </button>
  )),
  Portal: ({ children }: any) => <div data-testid="dialog-portal">{children}</div>,
  Overlay: React.forwardRef(({ children, onClick, asChild }: any, ref: any) => (
    <div ref={ref} onClick={onClick} data-testid="dialog-overlay">
      {children}
    </div>
  )),
  Content: React.forwardRef(({ children, asChild }: any, ref: any) => (
    <div ref={ref} data-testid="dialog-content">
      {children}
    </div>
  )),
  Title: ({ children, className }: any) => (
    <h2 className={className} data-testid="dialog-title">
      {children}
    </h2>
  ),
  Description: ({ children, className }: any) => (
    <p className={className} data-testid="dialog-description">
      {children}
    </p>
  ),
}));

// Mock IconButton
vi.mock('./IconButton', () => ({
  IconButton: ({ icon, title, onClick, className }: any) => (
    <button onClick={onClick} title={title} className={className} data-testid="icon-button">
      <span className={icon} />
    </button>
  ),
}));

// Import after mocks
import { Dialog, DialogButton, DialogTitle, DialogDescription, DialogRoot, DialogClose } from './Dialog';

describe('Dialog', () => {
  describe('rendering', () => {
    it('should render children', () => {
      render(
        <Dialog>
          <div>Dialog content</div>
        </Dialog>,
      );

      expect(screen.getByText('Dialog content')).toBeInTheDocument();
    });

    it('should render in portal', () => {
      render(
        <Dialog>
          <div>Content</div>
        </Dialog>,
      );

      expect(screen.getByTestId('dialog-portal')).toBeInTheDocument();
    });

    it('should render overlay', () => {
      render(
        <Dialog>
          <div>Content</div>
        </Dialog>,
      );

      expect(screen.getByTestId('dialog-overlay')).toBeInTheDocument();
    });

    it('should render close button', () => {
      render(
        <Dialog>
          <div>Content</div>
        </Dialog>,
      );

      expect(screen.getByTitle('Fermer')).toBeInTheDocument();
    });
  });

  describe('interaction', () => {
    it('should call onBackdrop when overlay clicked', () => {
      const onBackdrop = vi.fn();
      render(
        <Dialog onBackdrop={onBackdrop}>
          <div>Content</div>
        </Dialog>,
      );

      fireEvent.click(screen.getByTestId('dialog-overlay'));

      expect(onBackdrop).toHaveBeenCalled();
    });

    it('should call onClose when close button clicked', () => {
      const onClose = vi.fn();
      render(
        <Dialog onClose={onClose}>
          <div>Content</div>
        </Dialog>,
      );

      fireEvent.click(screen.getByTestId('dialog-close'));

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('styling', () => {
    it('should apply custom className', () => {
      render(
        <Dialog className="custom-dialog">
          <div>Content</div>
        </Dialog>,
      );

      expect(screen.getByTestId('dialog-content').querySelector('.custom-dialog')).toBeInTheDocument();
    });
  });
});

describe('DialogButton', () => {
  describe('types', () => {
    it('should render primary button', () => {
      render(<DialogButton type="primary">Primary</DialogButton>);

      const button = screen.getByText('Primary');
      expect(button).toHaveClass('bg-bolt-elements-button-primary-background');
    });

    it('should render secondary button', () => {
      render(<DialogButton type="secondary">Secondary</DialogButton>);

      const button = screen.getByText('Secondary');
      expect(button).toHaveClass('bg-bolt-elements-button-secondary-background');
    });

    it('should render danger button', () => {
      render(<DialogButton type="danger">Danger</DialogButton>);

      const button = screen.getByText('Danger');
      expect(button).toHaveClass('bg-bolt-elements-button-danger-background');
    });
  });

  describe('interaction', () => {
    it('should call onClick when clicked', () => {
      const onClick = vi.fn();
      render(
        <DialogButton type="primary" onClick={onClick}>
          Click me
        </DialogButton>,
      );

      fireEvent.click(screen.getByText('Click me'));

      expect(onClick).toHaveBeenCalled();
    });
  });

  describe('children', () => {
    it('should render text children', () => {
      render(<DialogButton type="primary">Button Text</DialogButton>);

      expect(screen.getByText('Button Text')).toBeInTheDocument();
    });
  });

  describe('memoization', () => {
    it('should be memoized', () => {
      expect(DialogButton).toBeDefined();
      expect(typeof DialogButton).toBe('object');
    });
  });
});

describe('DialogTitle', () => {
  describe('rendering', () => {
    it('should render children', () => {
      render(<DialogTitle>Title Text</DialogTitle>);

      expect(screen.getByText('Title Text')).toBeInTheDocument();
    });

    it('should have dialog title test id', () => {
      render(<DialogTitle>Title</DialogTitle>);

      expect(screen.getByTestId('dialog-title')).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('should apply custom className', () => {
      render(<DialogTitle className="custom-title">Title</DialogTitle>);

      expect(screen.getByTestId('dialog-title')).toHaveClass('custom-title');
    });

    it('should have base styling', () => {
      render(<DialogTitle>Title</DialogTitle>);

      const title = screen.getByTestId('dialog-title');
      expect(title).toHaveClass('text-lg', 'font-semibold');
    });
  });

  describe('memoization', () => {
    it('should be memoized', () => {
      expect(DialogTitle).toBeDefined();
      expect(typeof DialogTitle).toBe('object');
    });
  });
});

describe('DialogDescription', () => {
  describe('rendering', () => {
    it('should render children', () => {
      render(<DialogDescription>Description text</DialogDescription>);

      expect(screen.getByText('Description text')).toBeInTheDocument();
    });

    it('should have dialog description test id', () => {
      render(<DialogDescription>Description</DialogDescription>);

      expect(screen.getByTestId('dialog-description')).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('should apply custom className', () => {
      render(<DialogDescription className="custom-desc">Description</DialogDescription>);

      expect(screen.getByTestId('dialog-description')).toHaveClass('custom-desc');
    });
  });

  describe('memoization', () => {
    it('should be memoized', () => {
      expect(DialogDescription).toBeDefined();
      expect(typeof DialogDescription).toBe('object');
    });
  });
});

describe('Dialog exports', () => {
  it('should export DialogRoot', () => {
    expect(DialogRoot).toBeDefined();
  });

  it('should export DialogClose', () => {
    expect(DialogClose).toBeDefined();
  });
});
