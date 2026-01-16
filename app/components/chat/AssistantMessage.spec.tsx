import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AssistantMessage } from './AssistantMessage';

// Mock the Markdown component
vi.mock('./Markdown', () => ({
  Markdown: ({ children }: { children: string; html?: boolean }) => (
    <div data-testid="markdown-content">{children}</div>
  ),
}));

// Mock the MessageActions component
vi.mock('./MessageActions', () => ({
  FloatingMessageActions: () => <div data-testid="message-actions" />,
}));

describe('AssistantMessage', () => {
  const defaultProps = {
    content: 'Hello, world!',
    messageIndex: 0,
  };

  it('should render with content', () => {
    render(<AssistantMessage {...defaultProps} />);

    expect(screen.getByTestId('markdown-content')).toHaveTextContent('Hello, world!');
  });

  it('should pass content to Markdown component', () => {
    const content = 'This is a **test** message';
    render(<AssistantMessage {...defaultProps} content={content} />);

    expect(screen.getByTestId('markdown-content')).toHaveTextContent(content);
  });

  it('should render empty content', () => {
    render(<AssistantMessage {...defaultProps} content="" />);

    expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
  });

  it('should have correct container class', () => {
    const { container } = render(<AssistantMessage {...defaultProps} content="Test" />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('w-full', 'min-w-0');
  });

  it('should handle multiline content', () => {
    const multilineContent = `Line 1
Line 2
Line 3`;
    render(<AssistantMessage {...defaultProps} content={multilineContent} />);

    expect(screen.getByTestId('markdown-content')).toHaveTextContent('Line 1');
  });

  it('should handle HTML-like content safely', () => {
    const htmlContent = '<script>alert("xss")</script>';
    render(<AssistantMessage {...defaultProps} content={htmlContent} />);

    // The content should be passed to Markdown which handles sanitization
    expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
  });

  it('should handle code blocks in content', () => {
    const codeContent = '```typescript\nconst x = 1;\n```';
    render(<AssistantMessage {...defaultProps} content={codeContent} />);

    // Text content gets normalized (whitespace collapsed)
    expect(screen.getByTestId('markdown-content')).toHaveTextContent('```typescript');
    expect(screen.getByTestId('markdown-content')).toHaveTextContent('const x = 1;');
  });

  it('should be memoized', () => {
    // AssistantMessage is wrapped in memo, verify it's a valid component
    expect(AssistantMessage).toBeDefined();
    expect(typeof AssistantMessage).toBe('object'); // memo components are objects
  });

  it('should render message actions', () => {
    render(<AssistantMessage {...defaultProps} />);

    expect(screen.getByTestId('message-actions')).toBeInTheDocument();
  });
});
