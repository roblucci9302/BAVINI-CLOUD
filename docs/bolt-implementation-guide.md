# Bolt.new Implementation Guide for BAVINI25

## Quick Reference: Key Code Snippets

This document provides ready-to-use code snippets extracted from Bolt.new that can be adapted for BAVINI25.

---

## 1. CSS Custom Properties Layout System

### Setup Global Variables

```scss
// styles/variables.scss
:root {
  // Layout dimensions
  --header-height: 54px;
  --chat-max-width: 58rem;

  // Dynamic positioning (changed by JavaScript)
  --workbench-width: 70%;
  --workbench-left: 30%;
  --workbench-inner-width: 70%;

  // Animation easing
  --ease-cubic: cubic-bezier(0.4, 0, 0.2, 1);
}
```

### Chat Container with Conditional Positioning

```scss
// components/chat/BaseChat.module.scss
.ChatContainer {
  position: relative;
  width: 100%;
  max-width: var(--chat-max-width);
  margin: 0 auto;
  transition: transform 0.3s var(--ease-cubic), opacity 0.3s var(--ease-cubic);
  will-change: transform, opacity;
}

.ChatContainer[data-chat-visible='false'] {
  // When workbench is open, slide chat to the left
  transform: translateX(-50%);
  opacity: 0;
}

.ChatContainer[data-chat-visible='true'] {
  transform: translateX(0);
  opacity: 1;
}
```

### Workbench Positioning

```scss
// components/workbench/Workbench.module.scss
.Workbench {
  position: fixed;
  top: var(--header-height);
  left: var(--workbench-left);
  width: var(--workbench-width);
  height: calc(100vh - var(--header-height));
  background: var(--background-depth-1);
  border-left: 1px solid var(--border-color);
  transition: all 0.3s var(--ease-cubic);
}

.Workbench[data-visible='false'] {
  transform: translateX(100%);
  opacity: 0;
  pointer-events: none;
}

.Workbench[data-visible='true'] {
  transform: translateX(0);
  opacity: 1;
  pointer-events: auto;
}
```

### JavaScript to Toggle Layout

```typescript
// lib/stores/layout.ts
import { atom } from 'nanostores';

export const layoutStore = atom<'chat-only' | 'split-view'>('chat-only');

export function showWorkbench() {
  layoutStore.set('split-view');

  // Update CSS custom properties
  document.documentElement.style.setProperty('--workbench-left', '30%');
  document.documentElement.style.setProperty('--workbench-width', '70%');
  document.documentElement.style.setProperty('--chat-max-width', '30%');
}

export function hideWorkbench() {
  layoutStore.set('chat-only');

  document.documentElement.style.setProperty('--workbench-left', '100%');
  document.documentElement.style.setProperty('--workbench-width', '0%');
  document.documentElement.style.setProperty('--chat-max-width', '58rem');
}
```

---

## 2. Framer Motion Animations

### Install Dependencies

```bash
npm install framer-motion
```

### Chat Intro Fadeout Animation

```typescript
// components/chat/Chat.tsx
import { useAnimate } from 'framer-motion';
import { useEffect } from 'react';

export function Chat() {
  const [animationScope, animate] = useAnimate();
  const chatStarted = useStore(chatStore.started);

  useEffect(() => {
    if (chatStarted) {
      // Animate out example prompts
      const examples = document.querySelector('.example-prompts');
      if (examples) {
        animate(
          examples,
          { opacity: 0, height: 0 },
          { duration: 0.1, ease: [0.4, 0, 0.2, 1] }
        );
      }

      // Animate out intro section
      const intro = document.querySelector('.intro-section');
      if (intro) {
        animate(
          intro,
          { opacity: 0, scale: 0.95 },
          { duration: 0.2, ease: [0.4, 0, 0.2, 1] }
        );
      }
    }
  }, [chatStarted, animate]);

  return (
    <div ref={animationScope}>
      {!chatStarted && (
        <>
          <div className="intro-section">
            <h1>Where ideas begin</h1>
          </div>
          <div className="example-prompts">
            {/* Example prompts */}
          </div>
        </>
      )}

      <Messages messages={messages} />
      <ChatInput />
    </div>
  );
}
```

### Workbench Slide-In Animation

```typescript
// components/workbench/Workbench.tsx
import { motion, AnimatePresence } from 'framer-motion';

export function Workbench({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="workbench"
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{
            duration: 0.3,
            ease: [0.4, 0, 0.2, 1]
          }}
        >
          <EditorPanel />
          <Preview />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

### Stagger Children Animation (Example Prompts)

```typescript
// components/chat/ExamplePrompts.tsx
import { motion } from 'framer-motion';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

export function ExamplePrompts({ prompts }: { prompts: string[] }) {
  return (
    <motion.div
      className="grid grid-cols-2 gap-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {prompts.map((prompt, index) => (
        <motion.button
          key={index}
          variants={itemVariants}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="p-4 rounded-lg border hover:border-accent"
        >
          {prompt}
        </motion.button>
      ))}
    </motion.div>
  );
}
```

---

## 3. Streaming Message Parser

### Parser Class Implementation

```typescript
// lib/runtime/message-parser.ts

interface ParserCallbacks {
  onArtifactOpen?: (data: { messageId: string; title: string; id: string }) => void;
  onArtifactClose?: (data: { messageId: string }) => void;
  onActionOpen?: (data: { messageId: string; actionId: string; type: string; filePath?: string }) => void;
  onActionClose?: (data: { messageId: string; actionId: string; content: string }) => void;
}

export class StreamingMessageParser {
  private callbacks: ParserCallbacks;
  private currentArtifactId: string | null = null;
  private currentActionId: string | null = null;
  private currentActionContent: string = '';

  constructor(callbacks: ParserCallbacks) {
    this.callbacks = callbacks;
  }

  parse(messageId: string, input: string): string {
    let output = '';
    let i = 0;

    while (i < input.length) {
      // Check for artifact opening tag
      if (input.slice(i).startsWith('<boltArtifact')) {
        const tagEnd = input.indexOf('>', i);
        const tag = input.slice(i, tagEnd + 1);

        const titleMatch = tag.match(/title="([^"]*)"/);
        const idMatch = tag.match(/id="([^"]*)"/);

        if (titleMatch && idMatch) {
          this.currentArtifactId = idMatch[1];

          this.callbacks.onArtifactOpen?.({
            messageId,
            title: titleMatch[1],
            id: idMatch[1],
          });

          output += `<div class="artifact" data-id="${idMatch[1]}">`;
        }

        i = tagEnd + 1;
        continue;
      }

      // Check for artifact closing tag
      if (input.slice(i).startsWith('</boltArtifact>')) {
        this.callbacks.onArtifactClose?.({ messageId });
        output += '</div>';
        this.currentArtifactId = null;
        i += '</boltArtifact>'.length;
        continue;
      }

      // Check for action opening tag
      if (input.slice(i).startsWith('<boltAction')) {
        const tagEnd = input.indexOf('>', i);
        const tag = input.slice(i, tagEnd + 1);

        const typeMatch = tag.match(/type="([^"]*)"/);
        const filePathMatch = tag.match(/filePath="([^"]*)"/);

        if (typeMatch) {
          this.currentActionId = `${messageId}-${Date.now()}`;
          this.currentActionContent = '';

          this.callbacks.onActionOpen?.({
            messageId,
            actionId: this.currentActionId,
            type: typeMatch[1],
            filePath: filePathMatch?.[1],
          });
        }

        i = tagEnd + 1;
        continue;
      }

      // Check for action closing tag
      if (input.slice(i).startsWith('</boltAction>')) {
        if (this.currentActionId) {
          this.callbacks.onActionClose?.({
            messageId,
            actionId: this.currentActionId,
            content: this.currentActionContent,
          });
        }

        this.currentActionId = null;
        this.currentActionContent = '';
        i += '</boltAction>'.length;
        continue;
      }

      // Regular content
      const char = input[i];

      if (this.currentActionId) {
        // Inside an action - accumulate content
        this.currentActionContent += char;
      } else {
        // Outside action - add to output
        output += char;
      }

      i++;
    }

    return output;
  }

  reset() {
    this.currentArtifactId = null;
    this.currentActionId = null;
    this.currentActionContent = '';
  }
}
```

### Parser Hook

```typescript
// lib/hooks/useMessageParser.ts
import { useMemo, useCallback, useState } from 'react';
import { StreamingMessageParser } from '../runtime/message-parser';
import { workbenchStore } from '../stores/workbench';

export function useMessageParser() {
  const [parsedMessages, setParsedMessages] = useState<Record<string, string>>({});

  const parser = useMemo(() => {
    return new StreamingMessageParser({
      onArtifactOpen: (data) => {
        // Show workbench when artifact appears
        workbenchStore.setVisible(true);
        workbenchStore.addArtifact(data);
      },

      onArtifactClose: (data) => {
        workbenchStore.closeArtifact(data.messageId);
      },

      onActionOpen: (data) => {
        workbenchStore.addAction({
          id: data.actionId,
          type: data.type as 'file' | 'shell',
          filePath: data.filePath,
          status: 'pending',
        });
      },

      onActionClose: (data) => {
        workbenchStore.updateAction(data.actionId, {
          content: data.content,
          status: 'running',
        });

        // Execute action
        workbenchStore.runAction(data.actionId);
      },
    });
  }, []);

  const parseMessage = useCallback((messageId: string, content: string) => {
    const parsed = parser.parse(messageId, content);

    setParsedMessages(prev => ({
      ...prev,
      [messageId]: parsed,
    }));

    return parsed;
  }, [parser]);

  return { parseMessage, parsedMessages };
}
```

### Usage in Chat Component

```typescript
// components/chat/Chat.tsx
import { useChat } from 'ai/react';
import { useMessageParser } from '~/lib/hooks/useMessageParser';

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
  });

  const { parseMessage, parsedMessages } = useMessageParser();

  // Parse messages as they stream in
  useEffect(() => {
    messages.forEach((message) => {
      if (message.role === 'assistant') {
        parseMessage(message.id, message.content);
      }
    });
  }, [messages, parseMessage]);

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          {message.role === 'user' ? (
            <UserMessage content={message.content} />
          ) : (
            <AssistantMessage
              content={parsedMessages[message.id] || message.content}
            />
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## 4. Workbench Store Architecture

### Store Implementation

```typescript
// lib/stores/workbench.ts
import { atom, map, computed } from 'nanostores';

interface Action {
  id: string;
  type: 'file' | 'shell';
  filePath?: string;
  content?: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
}

interface Artifact {
  id: string;
  title: string;
  closed: boolean;
  actions: Action[];
}

class WorkbenchStore {
  // Core state
  visible = atom(false);
  currentView = atom<'code' | 'preview'>('code');
  artifacts = map<Record<string, Artifact>>({});

  // File system
  files = map<Record<string, string>>({});
  selectedFile = atom<string | null>(null);
  unsavedFiles = atom<Set<string>>(new Set());

  // Computed state
  currentDocument = computed(
    [this.selectedFile, this.files],
    (filePath, files) => {
      if (!filePath) return null;
      return {
        filePath,
        content: files[filePath] || '',
      };
    }
  );

  hasUnsavedChanges = computed(
    this.unsavedFiles,
    (unsaved) => unsaved.size > 0
  );

  // Actions
  setVisible(visible: boolean) {
    this.visible.set(visible);
  }

  addArtifact(data: { messageId: string; title: string; id: string }) {
    this.artifacts.setKey(data.messageId, {
      id: data.id,
      title: data.title,
      closed: false,
      actions: [],
    });
  }

  closeArtifact(messageId: string) {
    const artifact = this.artifacts.get()[messageId];
    if (artifact) {
      this.artifacts.setKey(messageId, { ...artifact, closed: true });
    }
  }

  addAction(action: Action) {
    const artifacts = this.artifacts.get();

    // Find which artifact this action belongs to
    for (const [messageId, artifact] of Object.entries(artifacts)) {
      if (!artifact.closed) {
        this.artifacts.setKey(messageId, {
          ...artifact,
          actions: [...artifact.actions, action],
        });
        break;
      }
    }
  }

  updateAction(actionId: string, updates: Partial<Action>) {
    const artifacts = this.artifacts.get();

    for (const [messageId, artifact] of Object.entries(artifacts)) {
      const actionIndex = artifact.actions.findIndex(a => a.id === actionId);

      if (actionIndex !== -1) {
        const updatedActions = [...artifact.actions];
        updatedActions[actionIndex] = { ...updatedActions[actionIndex], ...updates };

        this.artifacts.setKey(messageId, {
          ...artifact,
          actions: updatedActions,
        });
        break;
      }
    }
  }

  async runAction(actionId: string) {
    this.updateAction(actionId, { status: 'running' });

    const artifacts = this.artifacts.get();
    let action: Action | null = null;

    // Find the action
    for (const artifact of Object.values(artifacts)) {
      const found = artifact.actions.find(a => a.id === actionId);
      if (found) {
        action = found;
        break;
      }
    }

    if (!action) return;

    try {
      if (action.type === 'file' && action.filePath && action.content) {
        // Write file
        this.files.setKey(action.filePath, action.content);

        // If this is the selected file, it becomes unsaved
        if (this.selectedFile.get() === action.filePath) {
          const unsaved = new Set(this.unsavedFiles.get());
          unsaved.add(action.filePath);
          this.unsavedFiles.set(unsaved);
        }
      } else if (action.type === 'shell' && action.content) {
        // Execute shell command (would need WebContainer or similar)
        console.log('Executing:', action.content);
      }

      this.updateAction(actionId, { status: 'complete' });
    } catch (error) {
      console.error('Action failed:', error);
      this.updateAction(actionId, { status: 'failed' });
    }
  }

  saveFile(filePath: string) {
    const unsaved = new Set(this.unsavedFiles.get());
    unsaved.delete(filePath);
    this.unsavedFiles.set(unsaved);
  }

  saveAllFiles() {
    this.unsavedFiles.set(new Set());
  }
}

export const workbenchStore = new WorkbenchStore();
```

### React Integration

```typescript
// components/workbench/Workbench.tsx
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';

export function Workbench() {
  const visible = useStore(workbenchStore.visible);
  const currentView = useStore(workbenchStore.currentView);
  const files = useStore(workbenchStore.files);
  const currentDocument = useStore(workbenchStore.currentDocument);

  if (!visible) return null;

  return (
    <div className="workbench" data-visible={visible}>
      <div className="view-selector">
        <button
          onClick={() => workbenchStore.currentView.set('code')}
          className={currentView === 'code' ? 'active' : ''}
        >
          Code
        </button>
        <button
          onClick={() => workbenchStore.currentView.set('preview')}
          className={currentView === 'preview' ? 'active' : ''}
        >
          Preview
        </button>
      </div>

      {currentView === 'code' ? (
        <CodeEditor document={currentDocument} />
      ) : (
        <Preview />
      )}
    </div>
  );
}
```

---

## 5. Dynamic Textarea Height

### Component Implementation

```typescript
// components/chat/ChatInput.tsx
import { useEffect, useRef, useState } from 'react';

const TEXTAREA_MIN_HEIGHT = 76;

export function ChatInput({
  onSubmit,
  chatStarted
}: {
  onSubmit: (message: string) => void;
  chatStarted: boolean;
}) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Dynamic max height based on chat state
  const maxHeight = chatStarted ? 400 : 200;

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to recalculate
    textarea.style.height = `${TEXTAREA_MIN_HEIGHT}px`;

    // Calculate new height
    const scrollHeight = textarea.scrollHeight;
    const newHeight = Math.min(Math.max(scrollHeight, TEXTAREA_MIN_HEIGHT), maxHeight);

    textarea.style.height = `${newHeight}px`;
  }, [input, maxHeight]);

  const handleSubmit = () => {
    if (!input.trim()) return;

    onSubmit(input);
    setInput('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = `${TEXTAREA_MIN_HEIGHT}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask Bavini to build anything..."
        className="w-full resize-none rounded-lg border p-4 pr-12"
        style={{
          minHeight: TEXTAREA_MIN_HEIGHT,
          maxHeight,
          overflowY: input.length > 0 ? 'auto' : 'hidden',
        }}
      />

      <button
        onClick={handleSubmit}
        disabled={!input.trim()}
        className="absolute right-2 bottom-2 p-2"
      >
        Send
      </button>
    </div>
  );
}
```

---

## 6. Progressive Enhancement Pattern

### Server-Rendered Fallback

```typescript
// components/chat/BaseChat.tsx
export function BaseChat() {
  return (
    <div className="chat-container">
      <div className="intro-section">
        <h1>Where ideas begin</h1>
        <p>Start chatting to build your project</p>
      </div>

      <form method="POST" action="/api/chat">
        <textarea
          name="message"
          placeholder="Describe your project..."
          className="chat-input"
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

### Client-Side Enhanced Version

```typescript
// routes/_index.tsx
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';

export default function Index() {
  return (
    <div className="app-container">
      <Header />

      {/* Progressive enhancement:
          - Server renders BaseChat immediately
          - Client hydrates to interactive Chat component
      */}
      <ClientOnly fallback={<BaseChat />}>
        {() => <Chat />}
      </ClientOnly>
    </div>
  );
}
```

---

## 7. Resizable Panel Layout

### Using react-resizable-panels

```bash
npm install react-resizable-panels
```

### Editor Panel Implementation

```typescript
// components/workbench/EditorPanel.tsx
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

export function EditorPanel() {
  return (
    <PanelGroup direction="vertical">
      {/* Code editor section */}
      <Panel defaultSize={75} minSize={20}>
        <PanelGroup direction="horizontal">
          {/* File tree */}
          <Panel defaultSize={20} minSize={10} collapsible>
            <FileTree />
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-accent" />

          {/* Editor */}
          <Panel defaultSize={80} minSize={20}>
            <CodeEditor />
          </Panel>
        </PanelGroup>
      </Panel>

      <PanelResizeHandle className="h-1 bg-border hover:bg-accent" />

      {/* Terminal section */}
      <Panel defaultSize={25} minSize={10} collapsible>
        <Terminal />
      </Panel>
    </PanelGroup>
  );
}
```

---

## 8. Sidebar Peek Behavior

### Mouse-Based Auto-Show/Hide

```typescript
// components/sidebar/Sidebar.tsx
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const SIDEBAR_WIDTH = 350;
const PEEK_THRESHOLD = 40;

export function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Open when mouse near left edge
      if (e.clientX < PEEK_THRESHOLD) {
        setIsOpen(true);
      }
      // Close when mouse far from sidebar
      else if (e.clientX > SIDEBAR_WIDTH + PEEK_THRESHOLD) {
        setIsOpen(false);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <motion.aside
      className="fixed top-0 left-0 h-full bg-background-depth-2 border-r"
      style={{ width: SIDEBAR_WIDTH }}
      initial={{ x: -150, opacity: 0 }}
      animate={{
        x: isOpen ? 0 : -150,
        opacity: isOpen ? 1 : 0,
      }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="p-4">
        <h2>Chat History</h2>
        {/* Chat list */}
      </div>
    </motion.aside>
  );
}
```

---

## 9. File Save Before Message Send

### Implementation Pattern

```typescript
// components/chat/Chat.tsx
import { workbenchStore } from '~/lib/stores/workbench';

export function Chat() {
  const { handleSubmit } = useChat({ api: '/api/chat' });
  const hasUnsavedChanges = useStore(workbenchStore.hasUnsavedChanges);

  const enhancedHandleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Save all files before sending message
    if (hasUnsavedChanges) {
      workbenchStore.saveAllFiles();

      // Optional: Show toast
      toast.success('Files saved automatically');
    }

    // Get file diff to include as context
    const files = workbenchStore.files.get();
    const fileDiff = Object.entries(files)
      .map(([path, content]) => `File: ${path}\n\`\`\`\n${content}\n\`\`\``)
      .join('\n\n');

    // Append file context to user message
    const messageWithContext = fileDiff
      ? `${fileDiff}\n\n${input}`
      : input;

    handleSubmit(e, { data: { message: messageWithContext } });
  };

  return (
    <form onSubmit={enhancedHandleSubmit}>
      {/* Chat UI */}
    </form>
  );
}
```

---

## 10. Theme Toggle

### Store Implementation

```typescript
// lib/stores/theme.ts
import { atom } from 'nanostores';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

export const themeStore = atom<Theme>(
  typeof window !== 'undefined'
    ? (localStorage.getItem(STORAGE_KEY) as Theme) || 'light'
    : 'light'
);

export function toggleTheme() {
  const current = themeStore.get();
  const next = current === 'light' ? 'dark' : 'light';

  themeStore.set(next);
  localStorage.setItem(STORAGE_KEY, next);
  document.documentElement.setAttribute('data-theme', next);
}

// Initialize on load
if (typeof window !== 'undefined') {
  document.documentElement.setAttribute('data-theme', themeStore.get());
}
```

### Component Usage

```typescript
// components/header/ThemeToggle.tsx
import { useStore } from '@nanostores/react';
import { themeStore, toggleTheme } from '~/lib/stores/theme';

export function ThemeToggle() {
  const theme = useStore(themeStore);

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg hover:bg-accent"
      aria-label="Toggle theme"
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}
```

---

## Summary Checklist

To implement Bolt.new-style animations and layout in BAVINI25:

- [ ] Install Framer Motion: `npm install framer-motion`
- [ ] Install Nanostores React: `npm install @nanostores/react nanostores`
- [ ] Add CSS custom properties for layout positioning
- [ ] Implement workbench store with file management
- [ ] Create streaming message parser with callbacks
- [ ] Add Framer Motion animations for intro fadeout
- [ ] Implement dynamic textarea height
- [ ] Add CSS transitions for chat slide animation
- [ ] Create progressive enhancement with ClientOnly
- [ ] Add file save before message send
- [ ] Implement resizable panels (optional)
- [ ] Add sidebar peek behavior (optional)

Most critical for the smooth UX:
1. CSS custom properties layout
2. Framer Motion for intro animations
3. Streaming parser with workbench integration
4. Dynamic layout transitions
