import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UserMessage } from './UserMessage';

// mock the Markdown component
vi.mock('./Markdown', () => ({
  Markdown: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));

// Mock the MessageActions component
vi.mock('./MessageActions', () => ({
  FloatingMessageActions: () => <div data-testid="message-actions" />,
}));

describe('UserMessage', () => {
  const defaultProps = {
    content: 'Hello world',
    messageIndex: 0,
  };

  describe('string content', () => {
    it('should render simple text content', () => {
      render(<UserMessage {...defaultProps} />);

      expect(screen.getByTestId('markdown')).toHaveTextContent('Hello world');
    });

    it('should sanitize content with modifications regex', () => {
      // the modificationsRegex removes certain patterns
      render(<UserMessage {...defaultProps} content="   Hello world   " />);

      expect(screen.getByTestId('markdown')).toHaveTextContent('Hello world');
    });
  });

  describe('multimodal content (array)', () => {
    it('should render text from multimodal content', () => {
      const content = [{ type: 'text' as const, text: 'Hello from multimodal' }];

      render(<UserMessage {...defaultProps} content={content} />);

      expect(screen.getByTestId('markdown')).toHaveTextContent('Hello from multimodal');
    });

    it('should render images from multimodal content', () => {
      const content = [
        { type: 'image' as const, image: 'data:image/png;base64,abc123' },
        { type: 'text' as const, text: 'Description' },
      ];

      render(<UserMessage {...defaultProps} content={content} />);

      const img = screen.getByRole('img');

      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'data:image/png;base64,abc123');
    });

    it('should render multiple images', () => {
      const content = [
        { type: 'image' as const, image: 'data:image/png;base64,img1' },
        { type: 'image' as const, image: 'data:image/png;base64,img2' },
        { type: 'text' as const, text: 'Two images' },
      ];

      render(<UserMessage {...defaultProps} content={content} />);

      const images = screen.getAllByRole('img');

      expect(images).toHaveLength(2);
      expect(images[0]).toHaveAttribute('src', 'data:image/png;base64,img1');
      expect(images[1]).toHaveAttribute('src', 'data:image/png;base64,img2');
    });

    it('should concatenate multiple text parts', () => {
      const content = [
        { type: 'text' as const, text: 'First part' },
        { type: 'text' as const, text: 'Second part' },
      ];

      render(<UserMessage {...defaultProps} content={content} />);

      // HTML collapses newlines to spaces
      expect(screen.getByTestId('markdown')).toHaveTextContent('First part Second part');
    });

    it('should handle images-only content (no text)', () => {
      const content = [{ type: 'image' as const, image: 'data:image/png;base64,abc123' }];

      render(<UserMessage {...defaultProps} content={content} />);

      expect(screen.getByRole('img')).toBeInTheDocument();
      expect(screen.queryByTestId('markdown')).not.toBeInTheDocument();
    });

    it('should apply correct styling to images', () => {
      const content = [
        { type: 'image' as const, image: 'data:image/png;base64,abc123' },
        { type: 'text' as const, text: 'Test' },
      ];

      render(<UserMessage {...defaultProps} content={content} />);

      const img = screen.getByRole('img');

      expect(img).toHaveClass('max-w-[200px]');
      expect(img).toHaveClass('max-h-[200px]');
      expect(img).toHaveClass('rounded-lg');
    });
  });

  describe('message actions', () => {
    it('should render message actions', () => {
      render(<UserMessage {...defaultProps} />);

      expect(screen.getByTestId('message-actions')).toBeInTheDocument();
    });
  });
});
