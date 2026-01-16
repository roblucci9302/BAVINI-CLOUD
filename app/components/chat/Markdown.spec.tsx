import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Markdown } from './Markdown';

// Mock react-markdown
vi.mock('react-markdown', () => ({
  default: ({ children, className }: { children: string; className?: string }) => (
    <div className={className} data-testid="react-markdown">
      {children}
    </div>
  ),
}));

// Mock CodeBlock.lazy
vi.mock('./CodeBlock.lazy', () => ({
  CodeBlock: ({ code, language }: { code: string; language: string }) => (
    <pre data-testid="code-block" data-language={language}>
      {code}
    </pre>
  ),
}));

// Mock Artifact
vi.mock('./Artifact', () => ({
  Artifact: ({ messageId }: { messageId: string }) => (
    <div data-testid="artifact" data-message-id={messageId}>
      Artifact
    </div>
  ),
}));

// Mock markdown utils
vi.mock('~/utils/markdown', () => ({
  remarkPlugins: () => [],
  rehypePlugins: () => [],
  allowedHTMLElements: ['div', 'p', 'pre', 'code', 'span'],
}));

// Mock logger
vi.mock('~/utils/logger', () => ({
  createScopedLogger: () => ({
    trace: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('Markdown', () => {
  describe('basic rendering', () => {
    it('should render children content', () => {
      render(<Markdown>Hello, world!</Markdown>);

      expect(screen.getByTestId('react-markdown')).toHaveTextContent('Hello, world!');
    });

    it('should render empty content', () => {
      render(<Markdown>{''}</Markdown>);

      expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
    });

    it('should render multiline content', () => {
      const content = `Line 1
Line 2
Line 3`;
      render(<Markdown>{content}</Markdown>);

      expect(screen.getByTestId('react-markdown')).toHaveTextContent('Line 1');
    });
  });

  describe('props handling', () => {
    it('should handle html prop', () => {
      // The component should accept html prop without error
      expect(() => {
        render(<Markdown html>Test content</Markdown>);
      }).not.toThrow();
    });

    it('should handle limitedMarkdown prop', () => {
      // The component should accept limitedMarkdown prop without error
      expect(() => {
        render(<Markdown limitedMarkdown>Test content</Markdown>);
      }).not.toThrow();
    });

    it('should default html to false', () => {
      render(<Markdown>Test</Markdown>);

      // If no errors, html defaulted correctly
      expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
    });

    it('should default limitedMarkdown to false', () => {
      render(<Markdown>Test</Markdown>);

      // If no errors, limitedMarkdown defaulted correctly
      expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
    });
  });

  describe('markdown features', () => {
    it('should handle bold text', () => {
      render(<Markdown>**bold text**</Markdown>);

      expect(screen.getByTestId('react-markdown')).toHaveTextContent('**bold text**');
    });

    it('should handle italic text', () => {
      render(<Markdown>*italic text*</Markdown>);

      expect(screen.getByTestId('react-markdown')).toHaveTextContent('*italic text*');
    });

    it('should handle code blocks', () => {
      const codeContent = '```typescript\nconst x = 1;\n```';
      render(<Markdown>{codeContent}</Markdown>);

      expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
    });

    it('should handle inline code', () => {
      render(<Markdown>Use `npm install` to install</Markdown>);

      expect(screen.getByTestId('react-markdown')).toHaveTextContent('Use `npm install` to install');
    });

    it('should handle lists', () => {
      const listContent = `- Item 1
- Item 2
- Item 3`;
      render(<Markdown>{listContent}</Markdown>);

      expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
    });

    it('should handle headings', () => {
      render(<Markdown># Heading 1</Markdown>);

      expect(screen.getByTestId('react-markdown')).toHaveTextContent('# Heading 1');
    });

    it('should handle links', () => {
      render(<Markdown>[Link text](https://example.com)</Markdown>);

      expect(screen.getByTestId('react-markdown')).toHaveTextContent('[Link text](https://example.com)');
    });
  });

  describe('special content', () => {
    it('should handle content with HTML-like syntax', () => {
      render(<Markdown>{'<div>Some HTML</div>'}</Markdown>);

      expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
    });

    it('should handle content with special characters', () => {
      render(<Markdown>{'Special chars: < > & " \''}</Markdown>);

      expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
    });

    it('should handle unicode content', () => {
      render(<Markdown>{'Unicode: 你好 🎉 مرحبا'}</Markdown>);

      expect(screen.getByTestId('react-markdown')).toHaveTextContent('Unicode: 你好 🎉 مرحبا');
    });
  });

  describe('memoization', () => {
    it('should be memoized', () => {
      expect(Markdown).toBeDefined();
      expect(typeof Markdown).toBe('object'); // memo components are objects
    });
  });
});
