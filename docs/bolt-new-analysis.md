# Bolt.new Architecture Analysis

## Executive Summary

Bolt.new is a full-stack AI coding assistant built with Remix, React, TypeScript, and deployed on Cloudflare. It features a sophisticated chat-to-code interface with real-time streaming, animated transitions, and an integrated development environment.

---

## 1. Overall Architecture

### Tech Stack
- **Framework**: Remix (React-based full-stack framework)
- **Runtime**: Cloudflare Workers
- **Styling**: UnoCSS + SCSS Modules
- **State Management**: Nanostores (lightweight reactive state)
- **Animations**: Framer Motion
- **AI Streaming**: Vercel AI SDK (`ai/react` - useChat hook)
- **Code Editor**: CodeMirror 6
- **Terminal**: Xterm.js

### Directory Structure
```
app/
├── components/
│   ├── chat/              # Chat UI components
│   │   ├── BaseChat.tsx
│   │   ├── Chat.client.tsx
│   │   ├── Messages.client.tsx
│   │   ├── Artifact.tsx
│   │   └── *.module.scss
│   ├── workbench/         # Code editor & preview
│   │   ├── Workbench.client.tsx
│   │   ├── EditorPanel.tsx
│   │   ├── Preview.tsx
│   │   └── terminal/
│   ├── editor/            # CodeMirror integration
│   └── sidebar/           # Navigation menu
├── lib/
│   ├── stores/            # State management
│   │   ├── chat.ts
│   │   ├── workbench.ts
│   │   ├── files.ts
│   │   └── theme.ts
│   ├── hooks/             # Custom hooks
│   │   ├── useMessageParser.ts
│   │   └── useChatHistory.ts
│   └── runtime/           # Message parsing
├── routes/                # Remix routes
│   ├── _index.tsx
│   └── chat.$id.tsx
└── styles/                # Global styles
```

---

## 2. Layout System and Positioning

### Root Layout (`app/routes/_index.tsx`)

```typescript
export default function Index() {
  return (
    <div className="flex flex-col h-full w-full">
      <Header />
      <ClientOnly fallback={<BaseChat />}>
        {() => <Chat />}
      </ClientOnly>
    </div>
  );
}
```

**Key Points:**
- Simple vertical flex layout
- Header stays fixed at top
- ClientOnly ensures progressive enhancement (BaseChat SSR fallback → Chat client hydration)
- Chat component internally manages workbench visibility

### CSS Variables for Layout

```scss
// From variables.scss
:root {
  --header-height: 54px;
  --chat-max-width: 58rem;
  --workbench-width: 70%;
  --workbench-left: 30%;
  --workbench-inner-width: 70%;
}
```

### Dynamic Layout Calculation

When chat is hidden (`data-chat-visible='false'`):
```scss
.BaseChat[data-chat-visible='false'] {
  --workbench-inner-width: 100%;
  --workbench-left: 0;

  .Chat {
    transform: translateX(-50%);
    opacity: 0;
  }
}
```

**This creates the key transition:**
- Chat starts centered at full width
- When workbench appears, chat slides left and workbench slides in from right
- CSS custom properties (`--workbench-left`) dynamically adjust positioning

---

## 3. Chat Input System and Transitions

### BaseChat Component Structure

```typescript
interface BaseChatProps {
  textareaRef?: (element: HTMLTextAreaElement) => void;
  messageRef?: (element: HTMLDivElement) => void;
  scrollRef?: (element: HTMLDivElement) => void;
  showChat?: boolean;
  chatStarted?: boolean;
  isStreaming?: boolean;
  enhancingPrompt?: boolean;
  promptEnhanced?: boolean;
  sendMessage?: (event: React.UIEvent, messageInput?: string) => void;
  handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  enhancePrompt?: () => void;
  handleStop?: () => void;
  importChat?: (description: string, messages: Message[]) => Promise<void>;
  exportChat?: () => void;
  messages?: Message[];
}

const TEXTAREA_MIN_HEIGHT = 76;
```

**Dynamic Textarea Height:**
```typescript
// From Chat.client.tsx
const textareaMaxHeight = chatStarted ? 400 : 200;

<textarea
  className={classNames(
    styles.textarea,
    'w-full pl-4 pt-4 pr-16 focus:outline-none resize-none'
  )}
  style={{
    minHeight: TEXTAREA_MIN_HEIGHT,
    maxHeight: textareaMaxHeight,
  }}
/>
```

### Chat Animation Sequence (Framer Motion)

From `Chat.client.tsx`:

```typescript
const [animationScope, animate] = useAnimate();

// When chat starts, hide intro elements
useEffect(() => {
  if (chatStarted) {
    const exampleMessages = document.querySelector('.examples');
    const intro = document.querySelector('.intro');

    // Animate out examples
    animate(
      exampleMessages,
      { opacity: 0, display: 'none' },
      { duration: 0.1, ease: cubicEasingFn }
    );

    // Animate out intro
    animate(
      intro,
      { opacity: 0, flex: 1 },
      { duration: 0.2, ease: cubicEasingFn }
    );
  }
}, [chatStarted]);
```

### State Flow

```typescript
// app/lib/stores/chat.ts
import { map } from 'nanostores';

export const chatStore = map({
  started: false,
  aborted: false,
  showChat: true,
});
```

**Transition Trigger:**
1. User types first message
2. `chatStore.started` → `true`
3. Animation sequence runs (fade out examples/intro)
4. `workbenchStore.showWorkbench` → `true`
5. CSS transitions apply (chat slides left, workbench appears)

### CSS Transition Implementation

```scss
// BaseChat.module.scss
.BaseChat[data-chat-visible='false'] {
  .Chat {
    // Cubic bezier easing from UnoCSS config
    --at-apply: bolt-ease-cubic-bezier;
    transition-property: transform, opacity;
    transition-duration: 0.3s;
    will-change: transform, opacity;
    transform: translateX(-50%);
    opacity: 0;
  }
}
```

**Custom Easing Function (uno.config.ts):**
```typescript
shortcuts: {
  'bolt-ease-cubic-bezier': 'transition-timing-function-[cubic-bezier(0.4,0,0.2,1)]'
}
```

---

## 4. Workbench System

### Workbench Component Architecture

```typescript
// Workbench.client.tsx
export const Workbench = memo(({ chatStarted, isStreaming }: WorkbenchProps) => {
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const selectedView = useStore(workbenchStore.currentView);
  const currentDocument = useStore(workbenchStore.currentDocument);
  const files = useStore(workbenchStore.files);
  const unsavedFiles = useStore(workbenchStore.unsavedFiles);
  const selectedFile = useStore(workbenchStore.selectedFile);

  if (!chatStarted) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: showWorkbench ? 1 : 0 }}
      transition={{ duration: 0.3, ease: cubicEasingFn }}
    >
      {/* Workbench content */}
    </motion.div>
  );
});
```

### Dual-Panel System (Code vs Preview)

```typescript
// Toggle between views
const ViewSelector = () => (
  <div className="flex items-center gap-1">
    <button
      className={classNames({ active: selectedView === 'code' })}
      onClick={() => workbenchStore.currentView.set('code')}
    >
      Code
    </button>
    <button
      className={classNames({ active: selectedView === 'preview' })}
      onClick={() => workbenchStore.currentView.set('preview')}
    >
      Preview
    </button>
  </div>
);
```

### EditorPanel Component

**Resizable Panels with `react-resizable-panels`:**

```typescript
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

export const EditorPanel = memo(({ /* props */ }) => {
  return (
    <PanelGroup direction="vertical">
      {/* Editor section */}
      <Panel defaultSize={showTerminal ? 75 : 100} minSize={20}>
        <PanelGroup direction="horizontal">
          {/* File tree sidebar */}
          <Panel defaultSize={20} minSize={10} collapsible>
            <FileTree files={files} selectedFile={selectedFile} />
          </Panel>

          <PanelResizeHandle />

          {/* Code editor */}
          <Panel defaultSize={80} minSize={20}>
            <CodeMirrorEditor
              editable={!isStreaming}
              doc={editorDocument}
              onChange={onEditorChange}
            />
          </Panel>
        </PanelGroup>
      </Panel>

      <PanelResizeHandle />

      {/* Terminal panel */}
      <Panel defaultSize={showTerminal ? 25 : 0} collapsible>
        <Terminal />
      </Panel>
    </PanelGroup>
  );
});
```

### WorkbenchStore Architecture

```typescript
// app/lib/stores/workbench.ts
class WorkbenchStore {
  #previewsStore = new PreviewsStore(webcontainer);
  #filesStore = new FilesStore(webcontainer);
  #editorStore = new EditorStore(this.#filesStore);
  #terminalStore = new TerminalStore(webcontainer);

  artifacts = map<Record<string, ArtifactState>>({});
  showWorkbench = atom<boolean>(false);
  currentView = atom<'code' | 'preview'>('code');
  unsavedFiles = atom<Set<string>>(new Set());

  // Computed stores
  previews = computed(this.#previewsStore.previews, (previews) => previews);
  files = computed(this.#filesStore.files, (files) => files);
  currentDocument = computed(
    [this.#editorStore.currentDocument, this.unsavedFiles],
    (doc, unsaved) => ({ ...doc, unsaved: unsaved.has(doc?.filePath) })
  );

  // Methods
  setCurrentDocumentContent(content: string) {
    this.#editorStore.setCurrentDocumentContent(content);
    const filePath = this.currentDocument.get()?.filePath;
    if (filePath) {
      this.unsavedFiles.set(new Set([...this.unsavedFiles.get(), filePath]));
    }
  }

  saveFile(filePath: string) {
    this.#filesStore.saveFile(filePath);
    const unsaved = new Set(this.unsavedFiles.get());
    unsaved.delete(filePath);
    this.unsavedFiles.set(unsaved);
  }

  addArtifact({ messageId, title, id }: ArtifactCallbackData) {
    const artifact = this.artifacts.get()[messageId];
    if (artifact) {
      return;
    }

    this.artifacts.setKey(messageId, {
      id,
      title,
      closed: false,
      runner: new ActionRunner(webcontainer),
    });
  }

  addAction(data: ActionCallbackData) {
    const { messageId, actionId, action } = data;
    const artifact = this.artifacts.get()[messageId];

    artifact.runner.addAction(action);
  }

  runAction(data: ActionCallbackData) {
    const artifact = this.artifacts.get()[data.messageId];
    artifact.runner.runAction(data.action);
  }
}

export const workbenchStore = new WorkbenchStore();
```

---

## 5. Streaming Mechanism

### Vercel AI SDK Integration

```typescript
// Chat.client.tsx
import { useChat } from 'ai/react';

const ChatImpl = () => {
  const {
    messages,
    isLoading,
    input,
    handleInputChange,
    handleSubmit,
    stop,
  } = useChat({
    api: '/api/chat',
    onError: (error) => {
      toast.error('Failed to send message');
    },
  });

  const enhancedHandleSubmit = async (e: React.FormEvent) => {
    // Save all files before sending
    workbenchStore.saveAllFiles();

    // Get file modifications
    const diff = await getFileDiff();

    // Prepend file context to user message
    const enhancedInput = diff ? `${diff}\n\n${input}` : input;

    handleSubmit(e, { data: { input: enhancedInput } });
  };
};
```

### Server-Side Streaming Handler

```typescript
// app/routes/api.chat.tsx (conceptual)
export async function action({ request }: ActionFunctionArgs) {
  const { messages } = await request.json();

  const stream = await streamText({
    model: anthropic('claude-sonnet-4'),
    messages,
    onChunk: (chunk) => {
      // Stream chunks to client
    },
  });

  return stream.toDataStreamResponse();
}
```

### Message Parser for Artifacts

```typescript
// app/lib/runtime/message-parser.ts
export class StreamingMessageParser {
  parse(messageId: string, input: string) {
    let output = '';

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      // Detect <boltArtifact> tags
      if (input.slice(i).startsWith('<boltArtifact')) {
        const { title, id } = this.#extractAttributes(input.slice(i));

        this.onArtifactOpen?.({ messageId, title, id });

        // Generate placeholder div
        output += `<div class="__boltArtifact__" data-title="${title}" data-id="${id}">`;

        i += input.slice(i).indexOf('>');
        continue;
      }

      // Detect <boltAction> tags
      if (input.slice(i).startsWith('<boltAction')) {
        const { type, filePath } = this.#extractAttributes(input.slice(i));

        this.onActionOpen?.({ messageId, actionId, type, filePath });

        // Skip tag
        i += input.slice(i).indexOf('>');
        continue;
      }

      // Detect closing tags
      if (input.slice(i).startsWith('</boltAction>')) {
        const content = this.#currentActionContent;

        this.onActionClose?.({ messageId, actionId, content });
        this.#currentActionContent = '';

        i += '</boltAction>'.length - 1;
        continue;
      }

      output += char;
    }

    return output;
  }
}
```

### Message Parser Hook

```typescript
// app/lib/hooks/useMessageParser.ts
export function useMessageParser() {
  const [parsedMessages, setParsedMessages] = useState<Record<number, string>>({});

  const messageParser = useMemo(() => {
    return new StreamingMessageParser({
      onArtifactOpen: (data) => {
        workbenchStore.showWorkbench.set(true);
        workbenchStore.addArtifact(data);
      },
      onArtifactClose: (data) => {
        workbenchStore.updateArtifact(data.messageId, { closed: true });
      },
      onActionOpen: (data) => {
        workbenchStore.addAction(data);
      },
      onActionClose: (data) => {
        workbenchStore.runAction(data);
      },
    });
  }, []);

  const parseMessages = useCallback((messages: Message[]) => {
    const newParsed: Record<number, string> = {};

    messages.forEach((message, index) => {
      if (message.role === 'assistant') {
        const parsed = messageParser.parse(message.id, message.content);
        newParsed[index] = (parsedMessages[index] || '') + parsed;
      }
    });

    setParsedMessages((prev) => ({ ...prev, ...newParsed }));
  }, [messageParser, parsedMessages]);

  return { parseMessages, parsedMessages };
}
```

### Real-Time Code Display

**As streaming happens:**

1. **Message arrives** → `useChat` hook receives chunks
2. **Parser processes** → `StreamingMessageParser` extracts `<boltArtifact>` and `<boltAction>` tags
3. **Store updates** → Callbacks trigger `workbenchStore.addAction()`
4. **Action runner executes** → Files are written to WebContainer
5. **Editor updates** → `filesStore` emits changes, editor re-renders
6. **Preview refreshes** → IFrame reloads with new code

```typescript
// Action execution flow
class ActionRunner {
  async runAction(action: Action) {
    if (action.type === 'file') {
      // Write to WebContainer filesystem
      await this.webcontainer.fs.writeFile(action.filePath, action.content);

      // Update files store
      workbenchStore.files.setKey(action.filePath, {
        type: 'file',
        content: action.content,
      });

      // If currently viewing this file, update editor
      if (workbenchStore.selectedFile.get() === action.filePath) {
        workbenchStore.setCurrentDocumentContent(action.content);
      }
    } else if (action.type === 'shell') {
      // Execute in terminal
      const process = await this.webcontainer.spawn('sh', ['-c', action.content]);
      process.output.pipeTo(terminalStream);
    }
  }
}
```

---

## 6. CSS Animations and Transitions

### Key Animation Types

#### 1. Chat Slide Animation

```scss
// BaseChat.module.scss
.BaseChat[data-chat-visible='false'] {
  --workbench-inner-width: 100%;
  --workbench-left: 0;

  .Chat {
    --at-apply: bolt-ease-cubic-bezier;
    transition-property: transform, opacity;
    transition-duration: 0.3s;
    will-change: transform, opacity;
    transform: translateX(-50%);
    opacity: 0;
  }
}
```

**Effect:**
- Chat slides 50% to the left
- Fades out to 0 opacity
- 0.3s duration with cubic-bezier easing

#### 2. Framer Motion Workbench Reveal

```typescript
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: showWorkbench ? 1 : 0 }}
  transition={{
    duration: 0.3,
    ease: [0.4, 0, 0.2, 1] // cubic-bezier
  }}
>
  <Workbench />
</motion.div>
```

#### 3. Example Prompts Fade

```scss
// animations.scss
.animated {
  animation-fill-mode: both;
  animation-duration: var(--animate-duration, 0.2s);
  animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}

.fadeInRight {
  animation-name: fadeInRight;
}

@keyframes fadeInRight {
  from {
    opacity: 0;
    transform: translate3d(100%, 0, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

.fadeOutRight {
  animation-name: fadeOutRight;
}

@keyframes fadeOutRight {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
    transform: translate3d(100%, 0, 0);
  }
}
```

#### 4. Dropdown Animations

```scss
.dropdown-animation {
  animation: fadeMoveDown 0.15s forwards;
  animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes fadeMoveDown {
  to {
    opacity: 1;
    transform: translateY(6px);
  }
}
```

### UnoCSS Transition Utilities

```typescript
// uno.config.ts
shortcuts: {
  'bolt-ease-cubic-bezier': 'transition-timing-function-[cubic-bezier(0.4,0,0.2,1)]',
  'transition-theme': 'transition-[color,border-color,background-color] duration-150',
}
```

---

## 7. Sidebar Implementation

### Peek Behavior with Mouse Tracking

```typescript
// Menu.client.tsx
const [open, setOpen] = useState(false);

const handleMouseMove = (e: MouseEvent) => {
  const threshold = 40;
  const menuWidth = 350;

  if (e.clientX < threshold) {
    // Near left edge → open
    setOpen(true);
  } else if (e.clientX > menuWidth + threshold) {
    // Far from menu → close
    setOpen(false);
  }
};

useEffect(() => {
  window.addEventListener('mousemove', handleMouseMove);
  return () => window.removeEventListener('mousemove', handleMouseMove);
}, []);

return (
  <motion.div
    className="fixed top-0 w-[350px] h-full z-sidebar"
    initial={{ left: -150, opacity: 0 }}
    animate={{
      left: open ? 0 : -150,
      opacity: open ? 1 : 0
    }}
    transition={{ duration: 0.2, ease: cubicEasingFn }}
  >
    {/* Sidebar content */}
  </motion.div>
);
```

---

## 8. Key Insights for Your Implementation

### 1. **Layout Strategy**
- Use CSS custom properties for dynamic positioning
- Single root layout with conditional rendering
- CSS transforms for smooth transitions

### 2. **State Management**
- Lightweight nanostores instead of Redux
- Computed stores for derived state
- Atoms for simple boolean flags

### 3. **Streaming Architecture**
- Vercel AI SDK handles connection/reconnection
- Custom parser extracts structured data from stream
- Callbacks trigger side effects (file writes, UI updates)

### 4. **Animation Approach**
- Framer Motion for component-level animations
- CSS transitions for layout shifts
- Cubic-bezier easing for professional feel
- `will-change` hints for performance

### 5. **Progressive Enhancement**
- SSR with BaseChat fallback
- Client-only hydration for interactive Chat
- Graceful degradation without JS

### 6. **Performance Optimizations**
- React.memo for expensive components
- useCallback for stable references
- Lazy loading with ClientOnly
- Hardware-accelerated transforms (translate3d)

---

## 9. Comparison to BAVINI25

### Similarities
- Both use React/TypeScript
- Both have chat + code editor layout
- Both handle streaming AI responses

### Differences

| Aspect | Bolt.new | BAVINI25 |
|--------|----------|----------|
| **Framework** | Remix | Vite + React Router |
| **Deployment** | Cloudflare Workers | Cloudflare Pages |
| **State** | Nanostores | Zustand |
| **Styling** | UnoCSS + SCSS | TailwindCSS |
| **Animations** | Framer Motion | CSS-only |
| **AI SDK** | Vercel AI SDK | Custom OpenAI/Anthropic integration |
| **Code Execution** | WebContainer (Node.js in browser) | External runtime? |
| **Layout Transition** | CSS custom properties + transforms | ? |

### Recommended Adoptions for BAVINI25

1. **CSS Custom Properties for Layout**
   ```scss
   :root {
     --chat-width: 50%;
     --editor-width: 50%;
   }

   [data-mode='chat-only'] {
     --chat-width: 100%;
     --editor-width: 0%;
   }
   ```

2. **Framer Motion for Smooth Transitions**
   ```bash
   npm install framer-motion
   ```

3. **Message Parser Pattern**
   - Extract structured data from streaming responses
   - Trigger side effects via callbacks
   - Separate parsing logic from UI components

4. **Workbench Store Architecture**
   - Central store for files, editor, terminal
   - Computed stores for derived state
   - Clean separation of concerns

5. **Progressive Enhancement**
   - Server-rendered fallback for chat
   - Client-side hydration for interactivity
   - Faster perceived performance

---

## 10. File Reference Summary

### Core Components
- `app/routes/_index.tsx` - Root layout
- `app/components/chat/BaseChat.tsx` - Chat UI (SSR)
- `app/components/chat/Chat.client.tsx` - Chat implementation (client)
- `app/components/workbench/Workbench.client.tsx` - Workbench container
- `app/components/workbench/EditorPanel.tsx` - Code editor panel
- `app/components/workbench/Preview.tsx` - Preview iframe

### State Management
- `app/lib/stores/chat.ts` - Chat state (started, aborted)
- `app/lib/stores/workbench.ts` - Workbench orchestration
- `app/lib/stores/files.ts` - File system state
- `app/lib/stores/theme.ts` - Theme switching

### Streaming & Parsing
- `app/lib/runtime/message-parser.ts` - StreamingMessageParser class
- `app/lib/hooks/useMessageParser.ts` - Parser hook with callbacks

### Styles
- `app/styles/index.scss` - Global styles entry
- `app/styles/variables.scss` - CSS custom properties
- `app/styles/animations.scss` - Keyframe animations
- `app/components/chat/BaseChat.module.scss` - Chat-specific styles
- `uno.config.ts` - UnoCSS configuration

---

## Conclusion

Bolt.new's architecture is characterized by:
- **Simplicity**: Minimal routing, single-page app feel
- **Performance**: Hardware-accelerated animations, memoization
- **Modularity**: Clear separation between chat, workbench, and state
- **Progressive**: Works without JS, enhanced with it
- **Reactive**: Nanostores provide efficient fine-grained reactivity

The key innovation is the **CSS custom property-based layout system** that enables smooth transitions between centered chat and split-view editor without complex JavaScript measurements or repositioning logic.
