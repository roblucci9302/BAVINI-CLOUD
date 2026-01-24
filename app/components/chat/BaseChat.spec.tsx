import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { atom } from 'nanostores';
import React from 'react';

// Create mock stores before imports
const { mockChatStore, mockWorkbenchStore } = vi.hoisted(() => {
  const { atom } = require('nanostores');
  return {
    mockChatStore: atom({ mode: 'agent', controlMode: 'auto' }),
    mockWorkbenchStore: {
      showWorkbench: atom(false),
    },
  };
});

// Mock stores
vi.mock('~/lib/stores/chat', () => ({
  chatStore: mockChatStore,
  setChatMode: vi.fn(),
}));

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: mockWorkbenchStore,
}));

// Mock performance preloaders
vi.mock('~/lib/performance', () => ({
  preloadOnTypingStart: vi.fn(),
  preloadOnFirstMessage: vi.fn(),
  preloadOnWorkbenchInteraction: vi.fn(),
}));

// Mock child components
vi.mock('remix-utils/client-only', () => ({
  ClientOnly: ({ children, fallback }: any) => {
    if (typeof children === 'function') {
      return children();
    }

    return children || fallback;
  },
}));

vi.mock('~/components/ui/ColorBends.lazy', () => ({
  LazyColorBendsWrapper: () => <div data-testid="color-bends" />,
}));

vi.mock('~/components/sidebar/Menu.client', () => ({
  Menu: () => <div data-testid="menu" />,
}));

vi.mock('~/components/ui/IconButton', () => ({
  IconButton: ({ children, onClick, title, className, disabled }: any) => (
    <button onClick={onClick} title={title} className={className} disabled={disabled} data-testid="icon-button">
      {children}
    </button>
  ),
}));

vi.mock('~/components/workbench/Workbench.client', () => ({
  Workbench: ({ chatStarted, isStreaming }: any) => (
    <div data-testid="workbench" data-chat-started={chatStarted} data-streaming={isStreaming} />
  ),
}));

vi.mock('./AnimatedPlaceholder', () => ({
  AnimatedPlaceholder: () => <div data-testid="animated-placeholder" />,
}));

vi.mock('./Messages.client', () => ({
  Messages: React.forwardRef(({ messages, isStreaming, className }: any, ref: any) => (
    <div ref={ref} data-testid="messages" data-streaming={isStreaming} className={className}>
      {messages?.length || 0} messages
    </div>
  )),
}));

vi.mock('./MultiAgentToggle', () => ({
  MultiAgentToggle: () => <div data-testid="multi-agent-toggle" />,
}));

vi.mock('./SendButton.client', () => ({
  SendButton: ({ hasContent, isStreaming, onClick }: any) => (
    <button data-testid="send-button" data-has-content={hasContent} data-streaming={isStreaming} onClick={onClick}>
      Send
    </button>
  ),
}));

vi.mock('./TemplatePills', () => ({
  TemplatePills: ({ onSelectTemplate }: any) => (
    <div data-testid="template-pills" onClick={() => onSelectTemplate?.('test prompt')} />
  ),
}));

vi.mock('./BaseChat.module.scss', () => ({
  default: {
    BaseChat: 'base-chat',
    welcomeGradient: 'welcome-gradient',
    Chat: 'chat',
    chatWithWorkbench: 'chat-with-workbench',
    welcomeInput: 'welcome-input',
  },
}));

// Mock react-resizable-panels to avoid layout errors in tests
vi.mock('react-resizable-panels', () => ({
  Panel: ({ children, className }: any) => <div className={className} data-testid="panel">{children}</div>,
  PanelGroup: React.forwardRef(({ children, className }: any, ref: any) => {
    // Expose imperative handle methods required by the component
    React.useImperativeHandle(ref, () => ({
      setLayout: vi.fn(),
      getLayout: vi.fn(() => ({ panel1: 50, panel2: 50 })),
    }));
    return <div className={className} data-testid="panel-group">{children}</div>;
  }),
  PanelResizeHandle: ({ className }: any) => <div className={className} data-testid="panel-resize-handle" />,
}));

// Import after mocks
import { BaseChat } from './BaseChat';
import { preloadOnTypingStart, preloadOnFirstMessage } from '~/lib/performance';
import { setChatMode } from '~/lib/stores/chat';

describe('BaseChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChatStore.set({ mode: 'agent', controlMode: 'auto' });
    mockWorkbenchStore.showWorkbench.set(false);
  });

  describe('basic rendering', () => {
    it('should render without crashing', () => {
      render(<BaseChat />);

      expect(screen.getByTestId('menu')).toBeInTheDocument();
    });

    it('should render workbench when chatStarted and showWorkbench are true', () => {
      mockWorkbenchStore.showWorkbench.set(true);
      render(<BaseChat chatStarted={true} />);

      expect(screen.getByTestId('workbench')).toBeInTheDocument();
    });

    it('should render multi-agent toggle', () => {
      render(<BaseChat />);

      expect(screen.getByTestId('multi-agent-toggle')).toBeInTheDocument();
    });

    it('should render send button', () => {
      render(<BaseChat />);

      expect(screen.getByTestId('send-button')).toBeInTheDocument();
    });
  });

  describe('welcome screen', () => {
    it('should show welcome title when chat not started', () => {
      render(<BaseChat chatStarted={false} />);

      expect(screen.getByText('Vous imaginez, on réalise')).toBeInTheDocument();
    });

    it('should show welcome subtitle when chat not started', () => {
      render(<BaseChat chatStarted={false} />);

      expect(screen.getByText('Décrivez votre projet app, website et BAVINI le crée pour vous.')).toBeInTheDocument();
    });

    it('should show template pills when chat not started', () => {
      render(<BaseChat chatStarted={false} />);

      expect(screen.getByTestId('template-pills')).toBeInTheDocument();
    });

    it('should show category buttons when chat not started', () => {
      render(<BaseChat chatStarted={false} />);

      expect(screen.getByText('Landing Page')).toBeInTheDocument();
      expect(screen.getByText('E-commerce')).toBeInTheDocument();
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    it('should not show welcome screen when chat started', () => {
      render(<BaseChat chatStarted={true} />);

      expect(screen.queryByText('Vous imaginez, on réalise')).not.toBeInTheDocument();
    });

    it('should not show category buttons when chat started', () => {
      render(<BaseChat chatStarted={true} />);

      expect(screen.queryByText('Landing Page')).not.toBeInTheDocument();
    });
  });

  describe('messages display', () => {
    it('should not show messages when chat not started', () => {
      render(<BaseChat chatStarted={false} />);

      expect(screen.queryByTestId('messages')).not.toBeInTheDocument();
    });

    it('should show messages when chat started', () => {
      render(<BaseChat chatStarted={true} />);

      expect(screen.getByTestId('messages')).toBeInTheDocument();
    });

    it('should pass isStreaming to messages', () => {
      render(<BaseChat chatStarted={true} isStreaming={true} />);

      expect(screen.getByTestId('messages')).toHaveAttribute('data-streaming', 'true');
    });
  });

  describe('textarea', () => {
    it('should render textarea', () => {
      render(<BaseChat />);

      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('should have correct aria-label', () => {
      render(<BaseChat />);

      expect(screen.getByLabelText('Message à envoyer à BAVINI')).toBeInTheDocument();
    });

    it('should display input value', () => {
      render(<BaseChat input="Hello World" />);

      expect(screen.getByRole('textbox')).toHaveValue('Hello World');
    });

    it('should call handleInputChange on input', () => {
      const handleInputChange = vi.fn();
      render(<BaseChat handleInputChange={handleInputChange} />);

      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test' } });

      expect(handleInputChange).toHaveBeenCalled();
    });

    it('should trigger preload on focus', () => {
      render(<BaseChat />);

      fireEvent.focus(screen.getByRole('textbox'));

      expect(preloadOnTypingStart).toHaveBeenCalled();
    });
  });

  describe('send message', () => {
    it('should call sendMessage on Enter key', () => {
      const sendMessage = vi.fn();
      render(<BaseChat sendMessage={sendMessage} input="test" />);

      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

      expect(sendMessage).toHaveBeenCalled();
    });

    it('should not call sendMessage on Shift+Enter', () => {
      const sendMessage = vi.fn();
      render(<BaseChat sendMessage={sendMessage} input="test" />);

      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', shiftKey: true });

      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('should trigger first message preload', () => {
      const sendMessage = vi.fn();
      render(<BaseChat sendMessage={sendMessage} input="test" />);

      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

      expect(preloadOnFirstMessage).toHaveBeenCalled();
    });

    it('should only trigger first message preload once', () => {
      const sendMessage = vi.fn();
      render(<BaseChat sendMessage={sendMessage} input="test" />);

      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

      expect(preloadOnFirstMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('send button interaction', () => {
    it('should pass hasContent based on input', () => {
      render(<BaseChat input="test" />);

      expect(screen.getByTestId('send-button')).toHaveAttribute('data-has-content', 'true');
    });

    it('should pass hasContent based on selected files', () => {
      const selectedFiles = [{ file: new File([''], 'test.png'), preview: 'data:...' }];
      render(<BaseChat selectedFiles={selectedFiles} />);

      expect(screen.getByTestId('send-button')).toHaveAttribute('data-has-content', 'true');
    });

    it('should pass isStreaming to send button', () => {
      render(<BaseChat isStreaming={true} />);

      expect(screen.getByTestId('send-button')).toHaveAttribute('data-streaming', 'true');
    });

    it('should call handleStop when streaming and clicking send', () => {
      const handleStop = vi.fn();
      render(<BaseChat isStreaming={true} handleStop={handleStop} />);

      fireEvent.click(screen.getByTestId('send-button'));

      expect(handleStop).toHaveBeenCalled();
    });

    it('should call sendMessage when not streaming and clicking send', () => {
      const sendMessage = vi.fn();
      render(<BaseChat isStreaming={false} sendMessage={sendMessage} input="test" />);

      fireEvent.click(screen.getByTestId('send-button'));

      expect(sendMessage).toHaveBeenCalled();
    });
  });

  describe('category prompts', () => {
    it('should send prompt when clicking category button', () => {
      const sendMessage = vi.fn();
      render(<BaseChat chatStarted={false} sendMessage={sendMessage} />);

      fireEvent.click(screen.getByText('Landing Page'));

      expect(sendMessage).toHaveBeenCalledWith(
        expect.any(Object),
        'Utilise le template LandingModern pour créer une landing page SaaS moderne et responsive avec hero, features, pricing et footer.',
      );
    });
  });

  describe('file handling', () => {
    it('should display file previews', () => {
      const file = new File([''], 'test.png', { type: 'image/png' });
      const selectedFiles = [{ file, preview: 'data:image/png;base64,abc' }];

      render(<BaseChat selectedFiles={selectedFiles} />);

      expect(screen.getByAltText('test.png')).toBeInTheDocument();
    });

    it('should call onFileRemove when clicking remove button', () => {
      const onFileRemove = vi.fn();
      const file = new File([''], 'test.png', { type: 'image/png' });
      const selectedFiles = [{ file, preview: 'data:image/png;base64,abc' }];

      render(<BaseChat selectedFiles={selectedFiles} onFileRemove={onFileRemove} />);

      fireEvent.click(screen.getByTitle('Supprimer'));

      expect(onFileRemove).toHaveBeenCalledWith(0);
    });

    it('should call onFileSelect when clicking attach button', () => {
      const onFileSelect = vi.fn();
      // chatStarted must be true for the button to be an attach button
      render(<BaseChat chatStarted={true} onFileSelect={onFileSelect} />);

      const attachButton = screen.getByTitle('Joindre un fichier');
      fireEvent.click(attachButton);

      expect(onFileSelect).toHaveBeenCalled();
    });
  });

  describe('enhance prompt', () => {
    it('should call enhancePrompt when clicking enhance button', () => {
      const enhancePrompt = vi.fn();
      render(<BaseChat input="test" enhancePrompt={enhancePrompt} />);

      const enhanceButton = screen.getByTitle('Améliorer le prompt');
      fireEvent.click(enhanceButton);

      expect(enhancePrompt).toHaveBeenCalled();
    });

    it('should disable enhance button when input is empty', () => {
      render(<BaseChat input="" />);

      const enhanceButton = screen.getByTitle('Améliorer le prompt');
      expect(enhanceButton).toBeDisabled();
    });

    it('should disable enhance button when enhancing', () => {
      render(<BaseChat input="test" enhancingPrompt={true} />);

      const enhanceButton = screen.getByTitle('Améliorer le prompt');
      expect(enhanceButton).toBeDisabled();
    });

    it('should show loading spinner when enhancing', () => {
      const { container } = render(<BaseChat input="test" enhancingPrompt={true} />);

      // When enhancing, shows a spinner icon instead of stars
      expect(container.querySelector('.i-svg-spinners\\:90-ring-with-bg')).toBeInTheDocument();
    });

    it('should show stars icon when not enhancing', () => {
      const { container } = render(<BaseChat input="test" />);

      // Normal state shows the stars icon
      expect(container.querySelector('.i-bolt\\:stars')).toBeInTheDocument();
    });
  });

  describe('ref forwarding', () => {
    it('should forward ref to container', () => {
      const ref = React.createRef<HTMLDivElement>();

      render(<BaseChat ref={ref} />);

      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('workbench visibility', () => {
    it('should pass chatStarted to workbench', () => {
      // Set showWorkbench to true for Workbench to render
      mockWorkbenchStore.showWorkbench.set(true);

      render(<BaseChat chatStarted={true} />);

      expect(screen.getByTestId('workbench')).toHaveAttribute('data-chat-started', 'true');
    });

    it('should pass isStreaming to workbench', () => {
      // Workbench requires both chatStarted and showWorkbench to be true
      mockWorkbenchStore.showWorkbench.set(true);

      render(<BaseChat chatStarted={true} isStreaming={true} />);

      expect(screen.getByTestId('workbench')).toHaveAttribute('data-streaming', 'true');
    });
  });

  describe('data attributes', () => {
    it('should set data-chat-visible attribute', () => {
      const { container } = render(<BaseChat showChat={true} />);

      expect(container.firstChild).toHaveAttribute('data-chat-visible', 'true');
    });

    it('should set data-chat-visible to false when showChat is false', () => {
      const { container } = render(<BaseChat showChat={false} />);

      expect(container.firstChild).toHaveAttribute('data-chat-visible', 'false');
    });
  });
});
