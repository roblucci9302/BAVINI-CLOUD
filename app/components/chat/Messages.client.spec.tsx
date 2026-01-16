import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Messages } from './Messages.client';

// Mock UserMessage
vi.mock('./UserMessage', () => ({
  UserMessage: ({ content }: { content: string }) => <div data-testid="user-message">{content}</div>,
}));

// Mock AssistantMessage
vi.mock('./AssistantMessage', () => ({
  AssistantMessage: ({ content }: { content: string }) => <div data-testid="assistant-message">{content}</div>,
}));

describe('Messages', () => {
  describe('basic rendering', () => {
    it('should render without messages', () => {
      render(<Messages />);

      expect(screen.queryByTestId('user-message')).not.toBeInTheDocument();
      expect(screen.queryByTestId('assistant-message')).not.toBeInTheDocument();
    });

    it('should render with empty messages array', () => {
      render(<Messages messages={[]} />);

      expect(screen.queryByTestId('user-message')).not.toBeInTheDocument();
      expect(screen.queryByTestId('assistant-message')).not.toBeInTheDocument();
    });

    it('should apply custom id', () => {
      const { container } = render(<Messages id="custom-id" />);

      expect(container.querySelector('#custom-id')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(<Messages className="custom-class" />);

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('message rendering', () => {
    it('should render user message', () => {
      const messages = [{ id: '1', role: 'user' as const, content: 'Hello' }];

      render(<Messages messages={messages} />);

      expect(screen.getByTestId('user-message')).toHaveTextContent('Hello');
    });

    it('should render assistant message', () => {
      const messages = [{ id: '2', role: 'assistant' as const, content: 'Hi there!' }];

      render(<Messages messages={messages} />);

      expect(screen.getByTestId('assistant-message')).toHaveTextContent('Hi there!');
    });

    it('should render multiple messages', () => {
      const messages = [
        { id: '1', role: 'user' as const, content: 'First message' },
        { id: '2', role: 'assistant' as const, content: 'Second message' },
        { id: '3', role: 'user' as const, content: 'Third message' },
      ];

      render(<Messages messages={messages} />);

      expect(screen.getAllByTestId('user-message')).toHaveLength(2);
      expect(screen.getAllByTestId('assistant-message')).toHaveLength(1);
    });

    it('should show user icon for user messages', () => {
      const messages = [{ id: '1', role: 'user' as const, content: 'Hello' }];

      const { container } = render(<Messages messages={messages} />);

      const userIcon = container.querySelector('.i-ph\\:user-fill');
      expect(userIcon).toBeInTheDocument();
    });

    it('should not show user icon for assistant messages', () => {
      const messages = [{ id: '2', role: 'assistant' as const, content: 'Hi' }];

      const { container } = render(<Messages messages={messages} />);

      const userIcon = container.querySelector('.i-ph\\:user-fill');
      expect(userIcon).not.toBeInTheDocument();
    });
  });

  describe('streaming indicator', () => {
    it('should show loading indicator when streaming', () => {
      render(<Messages isStreaming={true} />);

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('should not show loading indicator when not streaming', () => {
      render(<Messages isStreaming={false} />);

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('should show loading indicator with messages when streaming', () => {
      const messages = [{ id: '1', role: 'user' as const, content: 'Hello' }];

      render(<Messages messages={messages} isStreaming={true} />);

      expect(screen.getByTestId('user-message')).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have role log', () => {
      const { container } = render(<Messages />);

      expect(container.firstChild).toHaveAttribute('role', 'log');
    });

    it('should have aria-label for conversation history', () => {
      const { container } = render(<Messages />);

      expect(container.firstChild).toHaveAttribute('aria-label', 'Historique de la conversation');
    });

    it('should have aria-live polite', () => {
      const { container } = render(<Messages />);

      expect(container.firstChild).toHaveAttribute('aria-live', 'polite');
    });

    it('should have aria-label on streaming indicator', () => {
      render(<Messages isStreaming={true} />);

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-label', 'Génération de la réponse en cours');
    });
  });

  describe('styling', () => {
    it('should apply background class to user messages', () => {
      const messages = [{ id: '1', role: 'user' as const, content: 'Hello' }];

      const { container } = render(<Messages messages={messages} />);

      const messageWrapper = container.querySelector('[class*="bg-bolt-elements-messages-background"]');
      expect(messageWrapper).toBeInTheDocument();
    });

    it('should show streaming indicator when streaming', () => {
      const messages = [
        { id: '1', role: 'user' as const, content: 'Hello' },
        { id: '2', role: 'assistant' as const, content: 'Hi there!' },
      ];

      const { container } = render(<Messages messages={messages} isStreaming={true} />);

      // Streaming indicator (spinner) is shown when streaming
      const streamingIndicator = container.querySelector('[role="status"]');
      expect(streamingIndicator).toBeInTheDocument();
    });

    it('should add margin-top to non-first messages', () => {
      const messages = [
        { id: '1', role: 'user' as const, content: 'First' },
        { id: '2', role: 'assistant' as const, content: 'Second' },
      ];

      const { container } = render(<Messages messages={messages} />);

      const messageWrappers = container.querySelectorAll('.flex.gap-4');

      // Message spacing class
      expect(messageWrappers[1]).toHaveClass('mt-3');
    });

    it('should not add margin-top to first message', () => {
      const messages = [{ id: '1', role: 'user' as const, content: 'First' }];

      const { container } = render(<Messages messages={messages} />);

      const messageWrapper = container.querySelector('.flex.gap-4');
      expect(messageWrapper).not.toHaveClass('mt-5');
    });
  });

  describe('ref forwarding', () => {
    it('should forward ref to container', () => {
      const ref = { current: null as HTMLDivElement | null };

      render(<Messages ref={ref} id="test-messages" />);

      expect(ref.current).toBeInstanceOf(HTMLDivElement);
      expect(ref.current?.id).toBe('test-messages');
    });
  });

  describe('props defaults', () => {
    it('should default isStreaming to false', () => {
      render(<Messages />);

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('should default messages to empty array', () => {
      render(<Messages />);

      expect(screen.queryByTestId('user-message')).not.toBeInTheDocument();
      expect(screen.queryByTestId('assistant-message')).not.toBeInTheDocument();
    });
  });
});
