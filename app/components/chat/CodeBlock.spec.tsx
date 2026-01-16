import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CodeBlock } from './CodeBlock';

// Mock shiki
vi.mock('shiki', () => ({
  bundledLanguages: {
    typescript: true,
    javascript: true,
    python: true,
    plaintext: true,
  },
  codeToHtml: vi.fn(async (code: string, options: { lang: string; theme: string }) => {
    return `<pre><code class="language-${options.lang}">${code}</code></pre>`;
  }),
  isSpecialLang: vi.fn(() => false),
}));

// Mock logger
vi.mock('~/utils/logger', () => ({
  createScopedLogger: () => ({
    warn: vi.fn(),
    trace: vi.fn(),
  }),
}));

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
};

describe('CodeBlock', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: mockClipboard });
    mockClipboard.writeText.mockClear();
  });

  describe('rendering', () => {
    it('should apply custom className', () => {
      const { container } = render(<CodeBlock code="test" className="custom-class" />);

      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('should have relative positioning', () => {
      const { container } = render(<CodeBlock code="test" />);

      expect(container.firstChild).toHaveClass('relative');
    });

    it('should have group class for hover effects', () => {
      const { container } = render(<CodeBlock code="test" />);

      expect(container.firstChild).toHaveClass('group');
    });

    it('should have text-left class', () => {
      const { container } = render(<CodeBlock code="test" />);

      expect(container.firstChild).toHaveClass('text-left');
    });
  });

  describe('copy functionality', () => {
    it('should render copy button by default', () => {
      render(<CodeBlock code="test code" />);

      const copyButton = screen.getByTitle('Copier le code');
      expect(copyButton).toBeInTheDocument();
    });

    it('should not render copy button when disableCopy is true', () => {
      render(<CodeBlock code="test code" disableCopy={true} />);

      expect(screen.queryByTitle('Copier le code')).not.toBeInTheDocument();
    });

    it('should copy code to clipboard on click', () => {
      const testCode = 'const x = 1;';
      render(<CodeBlock code={testCode} />);

      const copyButton = screen.getByTitle('Copier le code');
      fireEvent.click(copyButton);

      expect(mockClipboard.writeText).toHaveBeenCalledWith(testCode);
    });

    it('should not copy again while in copied state', () => {
      render(<CodeBlock code="test" />);

      const copyButton = screen.getByTitle('Copier le code');

      fireEvent.click(copyButton);
      expect(mockClipboard.writeText).toHaveBeenCalledTimes(1);

      // Click again immediately
      fireEvent.click(copyButton);
      expect(mockClipboard.writeText).toHaveBeenCalledTimes(1);
    });
  });

  describe('props', () => {
    it('should accept language prop', () => {
      expect(() => {
        render(<CodeBlock code="const x = 1;" language="typescript" />);
      }).not.toThrow();
    });

    it('should accept theme prop', () => {
      expect(() => {
        render(<CodeBlock code="test" theme="light-plus" />);
      }).not.toThrow();
    });

    it('should default disableCopy to false', () => {
      render(<CodeBlock code="test" />);

      // Copy button should be present when disableCopy is false (default)
      expect(screen.getByTitle('Copier le code')).toBeInTheDocument();
    });
  });

  describe('memoization', () => {
    it('should be memoized', () => {
      expect(CodeBlock).toBeDefined();
      expect(typeof CodeBlock).toBe('object'); // memo components are objects
    });
  });
});
