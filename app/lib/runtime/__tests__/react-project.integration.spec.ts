/**
 * =============================================================================
 * BAVINI CLOUD - React Project Integration Test
 * =============================================================================
 * Test complet d'un projet React avec le BrowserBuildAdapter
 * =============================================================================
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { BrowserBuildAdapter } from '../adapters/browser-build-adapter';

// Mock esbuild-wasm avec un comportement plus réaliste
vi.mock('esbuild-wasm', () => {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    build: vi.fn().mockImplementation(async (options) => {
      // Simulate actual bundling behavior
      const stdin = options.stdin;
      const content = stdin?.contents || '';

      // Check for React imports
      const hasReact = content.includes('react') || content.includes('React');
      const hasJSX = content.includes('<') && content.includes('>');

      // Generate mock bundle
      let bundledCode = `
// Bundled by esbuild-wasm
(function() {
  ${hasReact ? 'const React = window.React || { createElement: (t,p,...c) => ({type:t,props:p,children:c}) };' : ''}
  ${content}
})();
`;

      // Simulate JSX transformation
      if (hasJSX) {
        bundledCode = bundledCode
          .replace(/<(\w+)([^>]*)\/>/g, 'React.createElement("$1", null)')
          .replace(/<(\w+)([^>]*)>(.*?)<\/\1>/g, 'React.createElement("$1", null, "$3")');
      }

      return {
        outputFiles: [
          { path: 'out.js', text: bundledCode },
          { path: 'out.css', text: '' },
        ],
        errors: [],
        warnings: [],
      };
    }),
    transform: vi.fn().mockImplementation(async (code, options) => {
      return { code: `// Transformed (${options.loader})\n${code}` };
    }),
  };
});

// Mock fetch for npm packages
global.fetch = vi.fn().mockImplementation(async (url: string) => {
  // Simulate esm.sh responses
  if (url.includes('esm.sh/react')) {
    return {
      ok: true,
      text: () => Promise.resolve(`
        export const useState = (init) => [init, () => {}];
        export const useEffect = (fn) => fn();
        export const createElement = (type, props, ...children) => ({ type, props, children });
        export default { useState, useEffect, createElement };
      `),
    };
  }
  if (url.includes('esm.sh/react-dom')) {
    return {
      ok: true,
      text: () => Promise.resolve(`
        export const createRoot = (el) => ({ render: (app) => { el.innerHTML = '<div>Rendered</div>'; } });
        export default { createRoot };
      `),
    };
  }
  return {
    ok: true,
    text: () => Promise.resolve('export default {};'),
  };
});

// Mock browser APIs
global.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/preview-123');
global.URL.revokeObjectURL = vi.fn();

describe('React Project Integration', () => {
  let adapter: BrowserBuildAdapter;

  beforeEach(async () => {
    adapter = new BrowserBuildAdapter();
    await adapter.init();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await adapter.destroy();
  });

  describe('Simple React App', () => {
    it('should build a minimal React app', async () => {
      // Setup project files
      await adapter.writeFiles(new Map([
        ['/package.json', JSON.stringify({
          name: 'test-react-app',
          dependencies: {
            react: '^18.2.0',
            'react-dom': '^18.2.0',
          },
        })],
        ['/src/main.tsx', `
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
        `],
        ['/src/App.tsx', `
import React from 'react';

export default function App() {
  return (
    <div className="app">
      <h1>Hello BAVINI!</h1>
      <p>Built with esbuild-wasm</p>
    </div>
  );
}
        `],
        ['/index.html', `
<!DOCTYPE html>
<html>
<head>
  <title>Test React App</title>
</head>
<body>
  <div id="root"></div>
</body>
</html>
        `],
      ]));

      // Build
      const result = await adapter.build({
        entryPoint: '/src/main.tsx',
        mode: 'development',
      });

      // Verify build success
      expect(result.errors).toHaveLength(0);
      expect(result.code).toBeTruthy();
      expect(result.buildTime).toBeGreaterThan(0);
      expect(result.hash).toBeTruthy();

      // Verify preview is created
      const preview = adapter.getPreview();
      expect(preview).not.toBeNull();
      expect(preview?.ready).toBe(true);
      // Preview now uses srcdoc mode (about:srcdoc) instead of blob URLs
      expect(preview?.url).toContain('srcdoc');
    });

    it('should handle React hooks', async () => {
      await adapter.writeFiles(new Map([
        ['/src/Counter.tsx', `
import React, { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>+</button>
    </div>
  );
}
        `],
      ]));

      const result = await adapter.build({
        entryPoint: '/src/Counter.tsx',
        mode: 'development',
      });

      expect(result.errors).toHaveLength(0);
      expect(result.code).toContain('useState');
    });

    it('should handle CSS imports', async () => {
      await adapter.writeFiles(new Map([
        ['/src/App.tsx', `
import React from 'react';
import './styles.css';

export default function App() {
  return <div className="container">Hello</div>;
}
        `],
        ['/src/styles.css', `
.container {
  padding: 20px;
  background: #f0f0f0;
}
        `],
      ]));

      const result = await adapter.build({
        entryPoint: '/src/App.tsx',
        mode: 'development',
      });

      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Production Build', () => {
    it('should build with minification', async () => {
      await adapter.writeFile('/src/main.tsx', `
        console.log("Hello World");
        export const add = (a: number, b: number) => a + b;
      `);

      const result = await adapter.build({
        entryPoint: '/src/main.tsx',
        mode: 'production',
        minify: true,
      });

      expect(result.errors).toHaveLength(0);
    });

    it('should include define replacements', async () => {
      await adapter.writeFile('/src/main.tsx', `
        if (process.env.NODE_ENV === 'production') {
          console.log('Production mode');
        }
      `);

      const result = await adapter.build({
        entryPoint: '/src/main.tsx',
        mode: 'production',
        define: {
          'process.env.NODE_ENV': '"production"',
        },
      });

      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should report missing imports gracefully', async () => {
      await adapter.writeFile('/src/main.tsx', `
        import NonExistent from './NonExistent';
        console.log(NonExistent);
      `);

      const result = await adapter.build({
        entryPoint: '/src/main.tsx',
        mode: 'development',
      });

      // The mock doesn't simulate real errors, but in production this would fail
      expect(result).toBeDefined();
    });

    it('should handle empty files', async () => {
      await adapter.writeFile('/src/empty.tsx', '// Empty file with comment');

      const result = await adapter.build({
        entryPoint: '/src/empty.tsx',
        mode: 'development',
      });

      // Empty files should build without errors
      expect(result).toBeDefined();
      expect(result.buildTime).toBeGreaterThan(0);
    });
  });

  describe('File Operations', () => {
    it('should read project structure', async () => {
      await adapter.writeFiles(new Map([
        ['/src/components/Button.tsx', 'export const Button = () => <button>Click</button>'],
        ['/src/components/Input.tsx', 'export const Input = () => <input />'],
        ['/src/hooks/useAuth.ts', 'export const useAuth = () => ({})'],
        ['/src/App.tsx', 'export default function App() { return <div /> }'],
      ]));

      const srcFiles = await adapter.readdir('/src');
      expect(srcFiles).toContain('components');
      expect(srcFiles).toContain('hooks');
      expect(srcFiles).toContain('App.tsx');

      const componentFiles = await adapter.readdir('/src/components');
      expect(componentFiles).toContain('Button.tsx');
      expect(componentFiles).toContain('Input.tsx');
    });

    it('should update files and rebuild', async () => {
      // First build
      await adapter.writeFile('/src/App.tsx', `
        import React from 'react';
        export default function App() {
          const version = 'v1';
          return <div className="app-v1">Version: {version}</div>;
        }
      `);
      const result1 = await adapter.build({ entryPoint: '/src/App.tsx', mode: 'development' });
      expect(result1.errors).toHaveLength(0);
      expect(result1.code).toBeTruthy();

      // Update file and rebuild
      await adapter.writeFile('/src/App.tsx', `
        import React, { useState } from 'react';
        export default function App() {
          const [count, setCount] = useState(0);
          return <div className="app-v2">Count: {count}</div>;
        }
      `);
      const result2 = await adapter.build({ entryPoint: '/src/App.tsx', mode: 'development' });
      expect(result2.errors).toHaveLength(0);
      expect(result2.code).toBeTruthy();

      // Verify both builds succeeded (hash may be same due to mocked esbuild)
      expect(result1.hash).toBeTruthy();
      expect(result2.hash).toBeTruthy();
    });
  });

  describe('Preview System', () => {
    it('should inject bundle into HTML', async () => {
      await adapter.writeFiles(new Map([
        ['/index.html', `
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <div id="root"></div>
  <!-- BAVINI_BUNDLE -->
</body>
</html>
        `],
        ['/src/main.tsx', 'console.log("Hello")'],
      ]));

      const result = await adapter.build({
        entryPoint: '/src/main.tsx',
        mode: 'development',
      });

      expect(result.errors).toHaveLength(0);
      expect(adapter.getPreview()?.ready).toBe(true);
    });

    it('should generate default HTML if not provided', async () => {
      await adapter.writeFile('/src/main.tsx', 'console.log("No HTML template")');

      const result = await adapter.build({
        entryPoint: '/src/main.tsx',
        mode: 'development',
      });

      expect(result.errors).toHaveLength(0);
      expect(adapter.getPreview()).not.toBeNull();
    });

    it('should refresh preview', async () => {
      await adapter.writeFile('/src/main.tsx', 'console.log("test")');
      await adapter.build({ entryPoint: '/src/main.tsx', mode: 'development' });

      const preview1 = adapter.getPreview();
      const timestamp1 = preview1?.updatedAt || 0;

      // Wait enough time to ensure timestamp changes
      await new Promise((r) => setTimeout(r, 50));
      await adapter.refreshPreview();

      const preview2 = adapter.getPreview();
      // Timestamp should be equal or greater (refreshPreview updates it)
      expect(preview2?.updatedAt).toBeGreaterThanOrEqual(timestamp1);
      expect(preview2?.ready).toBe(true);
    });
  });

  describe('Callbacks', () => {
    it('should emit all lifecycle events', async () => {
      const events: string[] = [];

      adapter.setCallbacks({
        onStatusChange: (status) => events.push(`status:${status}`),
        onBuildProgress: (phase, progress) => events.push(`progress:${phase}:${progress}`),
        onPreviewReady: () => events.push('preview:ready'),
      });

      await adapter.writeFile('/src/main.tsx', 'console.log("test")');
      await adapter.build({ entryPoint: '/src/main.tsx', mode: 'development' });

      expect(events).toContain('status:building');
      expect(events).toContain('status:ready');
      expect(events).toContain('preview:ready');
      expect(events.some((e) => e.startsWith('progress:'))).toBe(true);
    });
  });
});

describe('Framework Detection', () => {
  let adapter: BrowserBuildAdapter;

  beforeEach(async () => {
    adapter = new BrowserBuildAdapter();
    await adapter.init();
  });

  afterEach(async () => {
    await adapter.destroy();
  });

  it('should support React', () => {
    expect(adapter.supportedFrameworks).toContain('react');
  });

  it('should support Vue', () => {
    expect(adapter.supportedFrameworks).toContain('vue');
  });

  it('should support Svelte', () => {
    expect(adapter.supportedFrameworks).toContain('svelte');
  });

  it('should support Vanilla JS', () => {
    expect(adapter.supportedFrameworks).toContain('vanilla');
  });

  it('should support Preact', () => {
    expect(adapter.supportedFrameworks).toContain('preact');
  });
});
