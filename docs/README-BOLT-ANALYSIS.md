# Bolt.new Analysis Documentation

This directory contains a comprehensive analysis of the Bolt.new source code from GitHub, focusing on architecture, animations, and implementation patterns.

## Documents Overview

### 1. **bolt-new-analysis.md** - Comprehensive Architecture Analysis
**Best for:** Understanding the overall system

**Contents:**
- Complete technology stack breakdown
- Directory structure and file organization
- Layout system and CSS custom properties
- Chat input system and state management
- Workbench architecture (code editor, preview, terminal)
- Streaming mechanism with message parsing
- CSS animations and transitions
- Complete code flow from user input to code display

**When to read:** Start here to understand the big picture

---

### 2. **bolt-implementation-guide.md** - Ready-to-Use Code Snippets
**Best for:** Implementing specific features

**Contents:**
- Copy-paste code snippets for:
  - CSS custom properties layout system
  - Framer Motion animations
  - Streaming message parser
  - Workbench store architecture
  - Dynamic textarea height
  - Progressive enhancement pattern
  - Resizable panel layout
  - Sidebar peek behavior
  - File save before message send
  - Theme toggle

**When to read:** When you're ready to code and need working examples

---

### 3. **bavini-vs-bolt-comparison.md** - Detailed Comparison & Recommendations
**Best for:** Planning your implementation roadmap

**Contents:**
- Side-by-side comparison of Bolt.new vs BAVINI25
- Feature gap analysis
- 3-week implementation roadmap
- Migration strategies (incremental vs big bang)
- Code comparison examples
- Performance considerations
- Success metrics
- Top 3 priorities for quick wins

**When to read:** When planning what to implement and in what order

---

### 4. **bolt-code-snippets.md** - Actual Source Code from GitHub
**Best for:** Reference and deep dives

**Contents:**
- Exact code from Bolt.new repository:
  - BaseChat.module.scss (animations)
  - animations.scss (keyframes)
  - Chat store (Nanostores)
  - Theme store (with persistence)
  - EditorPanel (resizable panels)
  - Preview component (IFrame)
  - Sidebar (peek animation)
  - UnoCSS configuration
  - StreamingMessageParser class
  - Workbench store structure

**When to read:** When you need to see the actual implementation details

---

## Quick Start Guide

### If you have 15 minutes:
Read the **Executive Summary** and **Key Insights** sections of `bolt-new-analysis.md`

### If you have 1 hour:
1. Read `bolt-new-analysis.md` (30 min)
2. Skim `bavini-vs-bolt-comparison.md` focusing on "Top 3 Priorities" (15 min)
3. Browse `bolt-implementation-guide.md` for specific snippets (15 min)

### If you have a full day:
1. Read all four documents in order
2. Experiment with code snippets in a sandbox
3. Plan your implementation roadmap
4. Start Phase 1 from the implementation guide

---

## Key Findings Summary

### What Makes Bolt.new Smooth

1. **CSS Custom Properties for Layout**
   - Dynamic positioning with CSS variables
   - No JavaScript measurements needed
   - Smooth transitions with CSS

2. **Framer Motion for Animations**
   - Component-level animations
   - Stagger effects for multiple elements
   - Declarative API

3. **Streaming Message Parser**
   - Real-time artifact extraction
   - Callbacks trigger workbench updates
   - Incremental parsing during streaming

4. **Nanostores State Management**
   - Tiny bundle size (~1KB)
   - Atomic updates
   - Computed stores for derived state

5. **Progressive Enhancement**
   - SSR fallback for initial load
   - Client-side hydration for interactivity
   - Fast perceived performance

---

## Top 3 Priorities for BAVINI25

Based on effort vs impact analysis:

### 1. Add Framer Motion + CSS Variable Layout (1 week)
**Impact:** ⭐⭐⭐⭐⭐
**Effort:** ⭐⭐⭐

**Why:** This gives you the smooth animations and layout transitions that make Bolt.new feel polished.

**Start here:**
```bash
npm install framer-motion
```

Then implement the CSS variable layout system from `bolt-implementation-guide.md` Section 1.

---

### 2. Implement Streaming Message Parser (3-4 days)
**Impact:** ⭐⭐⭐⭐⭐
**Effort:** ⭐⭐

**Why:** Enables real-time code display and artifact detection during streaming.

**Start here:**
Read `bolt-implementation-guide.md` Section 3 and implement the `StreamingMessageParser` class.

---

### 3. Switch to Vercel AI SDK (1-2 days)
**Impact:** ⭐⭐⭐⭐
**Effort:** ⭐

**Why:** Simplifies streaming, adds error handling, and provides better DX.

**Start here:**
```bash
npm install ai
```

Then migrate from direct OpenAI/Anthropic calls to the `useChat` hook.

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1)
- Install dependencies (Framer Motion, Nanostores, AI SDK)
- Add CSS variables system
- Create basic stores

**Goal:** Infrastructure ready for animations and streaming

---

### Phase 2: Layout & Animations (Week 1-2)
- Implement CSS variable-based layout
- Add chat slide animation
- Add workbench reveal animation
- Add intro fadeout

**Goal:** Smooth transitions between chat and split view

---

### Phase 3: Streaming Parser (Week 2)
- Create `StreamingMessageParser` class
- Add `useMessageParser` hook
- Integrate with chat component

**Goal:** Real-time artifact detection and code display

---

### Phase 4: Workbench Integration (Week 2-3)
- Create workbench store
- Add file management
- Add unsaved changes tracking
- Add auto-save before send

**Goal:** Complete workbench functionality

---

### Phase 5: Polish & UX (Week 3)
- Add theme toggle
- Add example prompts
- Add loading states
- Add error handling

**Goal:** Production-ready UX

---

## Code Examples

### Minimal Animation (5 minutes)

```tsx
import { motion } from 'framer-motion';

<motion.div
  initial={{ opacity: 0, x: 100 }}
  animate={{ opacity: 1, x: 0 }}
  transition={{ duration: 0.3 }}
>
  <Workbench />
</motion.div>
```

### CSS Variable Layout (15 minutes)

```scss
:root {
  --chat-width: 100%;
  --workbench-left: 100%;
}

[data-layout='split'] {
  --chat-width: 30%;
  --workbench-left: 30%;
}

.chat { width: var(--chat-width); transition: all 0.3s; }
.workbench { left: var(--workbench-left); transition: all 0.3s; }
```

### Nanostores Migration (10 minutes)

```typescript
// Before (Zustand)
const useStore = create((set) => ({
  started: false,
  start: () => set({ started: true }),
}));

// After (Nanostores)
import { atom } from 'nanostores';
export const started = atom(false);

// Usage
import { useStore } from '@nanostores/react';
const isStarted = useStore(started);
started.set(true);
```

---

## Visual Reference

### Layout Transition Flow

```
┌─────────────────────────────────────┐
│                                     │
│         Centered Chat               │
│         (100% width)                │
│                                     │
└─────────────────────────────────────┘

          ↓ chatStarted = true ↓

┌──────────────┬──────────────────────┐
│              │                      │
│ Chat (30%)   │ Workbench (70%)      │
│              │ Code + Preview       │
│              │                      │
└──────────────┴──────────────────────┘
```

### Animation Sequence

1. User sends first message
2. `chatStore.started` → `true`
3. Intro section fades out (0.2s)
4. Chat slides left (0.3s)
5. Workbench slides in from right (0.3s)
6. Split view stable

---

## Common Questions

### Q: Should I use Remix or stick with Vite?
**A:** Stick with Vite. Better DX, faster builds, less refactoring needed.

### Q: Should I switch to Nanostores?
**A:** Yes, for new state. Smaller bundle, better performance, easier API.

### Q: Do I need WebContainer?
**A:** Only if running Node.js in browser. Overkill for frontend-only code.

### Q: Should I use UnoCSS or Tailwind?
**A:** Keep Tailwind. You already have it, and it's more popular.

### Q: What's the minimal implementation?
**A:** Just add Framer Motion animations. 80% of the visual impact, 20% of the work.

---

## Resources

### Bolt.new
- **GitHub:** https://github.com/stackblitz/bolt.new
- **Demo:** https://bolt.new

### Libraries Used
- **Framer Motion:** https://www.framer.com/motion/
- **Nanostores:** https://github.com/nanostores/nanostores
- **Vercel AI SDK:** https://sdk.vercel.ai/docs
- **React Resizable Panels:** https://github.com/bvaughn/react-resizable-panels
- **UnoCSS:** https://unocss.dev/

### Tutorials
- Framer Motion Tutorial: https://www.framer.com/motion/introduction/
- Nanostores Guide: https://github.com/nanostores/nanostores#guide
- Vercel AI SDK Quickstart: https://sdk.vercel.ai/docs/getting-started

---

## Next Steps

1. **Read** `bolt-new-analysis.md` for complete understanding
2. **Review** `bavini-vs-bolt-comparison.md` for implementation plan
3. **Reference** `bolt-implementation-guide.md` while coding
4. **Check** `bolt-code-snippets.md` for exact implementation details
5. **Implement** Phase 1 this week
6. **Test** animations for 60fps smoothness
7. **Iterate** based on user feedback

---

## Feedback & Questions

If you have questions or need clarification on any part of this analysis:

1. Re-read the relevant document section
2. Check the code snippets for working examples
3. Refer to the original Bolt.new repository
4. Experiment in a CodeSandbox first

---

## Document Maintenance

These documents were generated by analyzing the Bolt.new GitHub repository on 2025-12-29. The analysis is based on the main branch at that time.

If Bolt.new is updated significantly, consider:
- Re-running the analysis
- Updating code snippets
- Checking for new features or patterns

---

**Happy coding! 🚀**

The most important thing is to start small, test often, and iterate based on real user feedback. You don't need to implement everything at once—focus on the features that provide the most value to your users first.
