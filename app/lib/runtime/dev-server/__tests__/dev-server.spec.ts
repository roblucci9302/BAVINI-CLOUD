/**
 * Unit tests for DevServer
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DevServer, createDevServer } from '../dev-server';
import type { DevServerPlugin, VirtualRequest } from '../types';

describe('DevServer', () => {
  let server: DevServer;
  let fileSystem: Map<string, string>;

  beforeEach(() => {
    fileSystem = new Map([
      ['/index.html', '<!DOCTYPE html><html><body><div id="root"></div></body></html>'],
      ['/src/app.tsx', 'export default function App() { return <div>App</div>; }'],
      ['/src/utils.ts', 'export const add = (a: number, b: number) => a + b;'],
      ['/styles/main.css', 'body { margin: 0; }'],
    ]);
    server = createDevServer(fileSystem);
  });

  describe('createDevServer', () => {
    it('should create dev server instance', () => {
      expect(server).toBeInstanceOf(DevServer);
    });

    it('should accept custom config', () => {
      const customServer = createDevServer(fileSystem, {
        port: 5000,
        hmr: false,
      });

      expect(customServer.config.port).toBe(5000);
      expect(customServer.config.hmr).toBe(false);
    });
  });

  describe('listen and close', () => {
    it('should start server', async () => {
      await server.listen();
      // Server should be started (can handle requests)
      const req: VirtualRequest = {
        method: 'GET',
        url: 'http://localhost:3000/index.html',
        pathname: '/index.html',
        headers: new Headers(),
        query: new URLSearchParams(),
      };

      const res = await server.handleRequest(req);
      expect(res.status).toBe(200);
    });

    it('should close server', async () => {
      await server.listen();
      await server.close();

      // Module graph should be cleared
      expect(server.moduleGraph.size).toBe(0);
    });

    it('should not start twice', async () => {
      await server.listen();
      await server.listen(); // Should not throw
    });
  });

  describe('plugins', () => {
    it('should add plugin', () => {
      const plugin: DevServerPlugin = {
        name: 'test-plugin',
      };

      server.addPlugin(plugin);

      // Plugin should be added (no public way to verify, but should not throw)
    });

    it('should call configureServer hook', async () => {
      const configureServer = vi.fn();
      const plugin: DevServerPlugin = {
        name: 'test-plugin',
        configureServer,
      };

      server.addPlugin(plugin);
      await server.listen();

      expect(configureServer).toHaveBeenCalledWith(server);
    });

    it('should call transform hook', async () => {
      const transform = vi.fn().mockReturnValue({ code: 'transformed' });
      const plugin: DevServerPlugin = {
        name: 'test-plugin',
        transform,
      };

      server.addPlugin(plugin);
      await server.listen();

      const result = await server.transformRequest('/src/app.tsx');

      expect(transform).toHaveBeenCalled();
    });

    it('should chain plugin transforms', async () => {
      const plugin1: DevServerPlugin = {
        name: 'plugin-1',
        transform: (code) => ({ code: code + '\n// plugin1' }),
      };

      const plugin2: DevServerPlugin = {
        name: 'plugin-2',
        transform: (code) => ({ code: code + '\n// plugin2' }),
      };

      server.addPlugin(plugin1);
      server.addPlugin(plugin2);
      await server.listen();

      const result = await server.transformRequest('/src/app.tsx');

      expect(result?.code).toContain('// plugin1');
      expect(result?.code).toContain('// plugin2');
    });
  });

  describe('middleware', () => {
    it('should add middleware', async () => {
      const middleware = vi.fn(async (_req, next) => next());

      server.use(middleware);
      await server.listen();

      const req: VirtualRequest = {
        method: 'GET',
        url: 'http://localhost:3000/index.html',
        pathname: '/index.html',
        headers: new Headers(),
        query: new URLSearchParams(),
      };

      await server.handleRequest(req);

      expect(middleware).toHaveBeenCalled();
    });
  });

  describe('route', () => {
    it('should add custom route', async () => {
      server.route('/api/test', async () => ({
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        body: 'test response',
      }));

      await server.listen();

      const req: VirtualRequest = {
        method: 'GET',
        url: 'http://localhost:3000/api/test',
        pathname: '/api/test',
        headers: new Headers(),
        query: new URLSearchParams(),
      };

      const res = await server.handleRequest(req);

      expect(res.status).toBe(200);
      expect(res.body).toBe('test response');
    });
  });

  describe('handleFileChange', () => {
    it('should handle file change event', async () => {
      await server.listen();

      // This should not throw
      await server.handleFileChange({
        type: 'change',
        path: '/src/app.tsx',
        timestamp: Date.now(),
      });
    });

    it('should call watch callbacks', async () => {
      const callback = vi.fn();
      server.onFileChange(callback);

      await server.listen();
      await server.handleFileChange({
        type: 'change',
        path: '/src/app.tsx',
        timestamp: Date.now(),
      });

      // Wait for async callback notification
      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalled();
      });
    });

    it('should unsubscribe watch callback', async () => {
      const callback = vi.fn();
      const unsubscribe = server.onFileChange(callback);

      unsubscribe();

      await server.listen();
      await server.handleFileChange({
        type: 'change',
        path: '/src/app.tsx',
        timestamp: Date.now(),
      });

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('writeFile', () => {
    it('should write new file', async () => {
      await server.listen();

      server.writeFile('/src/new.ts', 'console.log("new");');

      const req: VirtualRequest = {
        method: 'GET',
        url: 'http://localhost:3000/src/new.ts',
        pathname: '/src/new.ts',
        headers: new Headers(),
        query: new URLSearchParams(),
      };

      const res = await server.handleRequest(req);

      expect(res.status).toBe(200);
    });

    it('should update existing file', async () => {
      await server.listen();

      server.writeFile('/src/app.tsx', 'export default () => <p>Updated</p>;');

      const req: VirtualRequest = {
        method: 'GET',
        url: 'http://localhost:3000/src/app.tsx',
        pathname: '/src/app.tsx',
        headers: new Headers(),
        query: new URLSearchParams(),
      };

      const res = await server.handleRequest(req);

      expect(res.body).toContain('Updated');
    });

    it('should trigger file change event', async () => {
      const callback = vi.fn();
      server.onFileChange(callback);

      await server.listen();
      server.writeFile('/src/app.tsx', 'updated');

      // Wait for async handleFileChange to complete
      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'change',
            path: '/src/app.tsx',
          }),
        );
      });
    });
  });

  describe('deleteFile', () => {
    it('should delete file', async () => {
      await server.listen();

      server.deleteFile('/src/utils.ts');

      const req: VirtualRequest = {
        method: 'GET',
        url: 'http://localhost:3000/src/utils.ts',
        pathname: '/src/utils.ts',
        headers: new Headers(),
        query: new URLSearchParams(),
      };

      const res = await server.handleRequest(req);

      expect(res.status).toBe(404);
    });

    it('should trigger file change event', async () => {
      const callback = vi.fn();
      server.onFileChange(callback);

      await server.listen();
      server.deleteFile('/src/utils.ts');

      // Wait for async handleFileChange to complete
      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'unlink',
            path: '/src/utils.ts',
          }),
        );
      });
    });

    it('should not throw for non-existent file', async () => {
      await server.listen();

      // Should not throw
      server.deleteFile('/src/nonexistent.ts');
    });
  });

  describe('transformRequest', () => {
    it('should transform existing file', async () => {
      await server.listen();

      const result = await server.transformRequest('/src/app.tsx');

      expect(result).not.toBeNull();
      expect(result?.code).toBeDefined();
    });

    it('should return null for non-existent file', async () => {
      await server.listen();

      const result = await server.transformRequest('/nonexistent.ts');

      expect(result).toBeNull();
    });
  });

  describe('restart', () => {
    it('should restart server', async () => {
      await server.listen();

      await server.restart();

      // Server should still work after restart
      const req: VirtualRequest = {
        method: 'GET',
        url: 'http://localhost:3000/index.html',
        pathname: '/index.html',
        headers: new Headers(),
        query: new URLSearchParams(),
      };

      const res = await server.handleRequest(req);
      expect(res.status).toBe(200);
    });
  });

  describe('getModuleUrl', () => {
    it('should return module URL', () => {
      const url = server.getModuleUrl('/src/app.tsx');

      expect(url).toBe('/src/app.tsx');
    });
  });

  describe('getHMRClientCode', () => {
    it('should return HMR client code', () => {
      const code = server.getHMRClientCode();

      expect(code).toBeDefined();
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(0);
    });
  });

  describe('HMR integration', () => {
    it('should inject HMR preamble for JS modules', async () => {
      await server.listen();

      const result = await server.transformRequest('/src/app.tsx');

      expect(result?.code).toContain('import.meta.hot');
    });

    it('should not inject HMR for non-JS modules', async () => {
      await server.listen();

      const req: VirtualRequest = {
        method: 'GET',
        url: 'http://localhost:3000/styles/main.css',
        pathname: '/styles/main.css',
        headers: new Headers(),
        query: new URLSearchParams(),
      };

      const res = await server.handleRequest(req);

      expect(res.body).not.toContain('import.meta.hot');
    });

    it('should not double-inject HMR preamble', async () => {
      // File already has HMR handling
      fileSystem.set(
        '/src/hmr-component.tsx',
        `
        if (import.meta.hot) {
          import.meta.hot.accept();
        }
        export default function() {}
      `,
      );

      server = createDevServer(fileSystem);
      await server.listen();

      const result = await server.transformRequest('/src/hmr-component.tsx');

      // Should contain import.meta.hot only once (from original code)
      const matches = (result?.code.match(/import\.meta\.hot/g) || []).length;
      expect(matches).toBeLessThanOrEqual(2); // Original check + our injection check
    });
  });
});
