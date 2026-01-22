/**
 * Unit tests for VirtualServer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualServer, createVirtualServer } from '../virtual-server';
import { createModuleGraph } from '../module-graph';
import type { ModuleGraph } from '../module-graph';
import type { VirtualRequest, VirtualResponse, Middleware } from '../types';

describe('VirtualServer', () => {
  let server: VirtualServer;
  let moduleGraph: ModuleGraph;
  let fileSystem: Map<string, string>;

  // Helper to create a valid VirtualRequest
  const createRequest = (pathname: string, method = 'GET'): VirtualRequest => ({
    method,
    url: `http://localhost:3000${pathname}`,
    pathname,
    query: new URLSearchParams(),
    headers: new Headers(),
  });

  beforeEach(() => {
    moduleGraph = createModuleGraph();
    fileSystem = new Map([
      ['/index.html', '<!DOCTYPE html><html><body>Hello</body></html>'],
      ['/src/app.tsx', 'export default function App() { return <div>App</div>; }'],
      ['/src/index.ts', 'import App from "./app"; console.log(App);'],
      ['/styles/main.css', 'body { margin: 0; }'],
      ['/data/config.json', '{"key": "value"}'],
    ]);
    server = createVirtualServer(moduleGraph, fileSystem);
  });

  describe('createVirtualServer', () => {
    it('should create virtual server instance', () => {
      expect(server).toBeInstanceOf(VirtualServer);
    });
  });

  describe('handleRequest', () => {

    it('should serve HTML file', async () => {
      const req = createRequest('/index.html');
      const res = await server.handleRequest(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/html');
      expect(res.body).toContain('Hello');
    });

    it('should serve CSS file', async () => {
      const req = createRequest('/styles/main.css');
      const res = await server.handleRequest(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/css');
    });

    it('should serve JSON file', async () => {
      const req = createRequest('/data/config.json');
      const res = await server.handleRequest(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/json');
    });

    it('should return 404 for unknown file', async () => {
      const req = createRequest('/unknown.txt');
      const res = await server.handleRequest(req);

      expect(res.status).toBe(404);
    });

    it('should handle OPTIONS request for CORS', async () => {
      const req = createRequest('/index.html', 'OPTIONS');
      const res = await server.handleRequest(req);

      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should add CORS headers to response', async () => {
      const req = createRequest('/index.html');
      const res = await server.handleRequest(req);

      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should try file extensions when not found', async () => {
      const req = createRequest('/src/index');
      const res = await server.handleRequest(req);

      expect(res.status).toBe(200);
    });

    it('should serve index files for directories', async () => {
      fileSystem.set('/src/index.tsx', 'export default () => null;');
      server = createVirtualServer(moduleGraph, fileSystem);

      const req = createRequest('/src/');
      const res = await server.handleRequest(req);

      expect(res.status).toBe(200);
    });
  });

  describe('built-in routes', () => {
    it('should serve /__ping endpoint', async () => {
      const req = createRequest('/__ping');
      const res = await server.handleRequest(req);

      expect(res.status).toBe(200);
      expect(res.body).toBe('pong');
    });

    it('should serve /__hmr endpoint', async () => {
      const req = createRequest('/__hmr');
      const res = await server.handleRequest(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/javascript');
    });

    it('should serve /__modules endpoint', async () => {
      // First add some modules
      await moduleGraph.ensureEntryFromUrl('/src/app.tsx');

      const req = createRequest('/__modules');
      const res = await server.handleRequest(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/json');

      const modules = JSON.parse(res.body as string);
      expect(Array.isArray(modules)).toBe(true);
    });
  });

  describe('custom routes', () => {
    it('should handle custom route', async () => {
      server.route('/api/test', async () => ({
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: '{"test": true}',
      }));

      const req: VirtualRequest = {
        method: 'GET',
        url: 'http://localhost:3000/api/test',
        pathname: '/api/test',
        headers: new Headers(),
        query: new URLSearchParams(),
      };

      const res = await server.handleRequest(req);

      expect(res.status).toBe(200);
      expect(res.body).toBe('{"test": true}');
    });
  });

  describe('middleware', () => {
    it('should run middleware in order', async () => {
      const order: number[] = [];

      const middleware1: Middleware = async (_req, next) => {
        order.push(1);
        const res = await next();
        order.push(4);
        return res;
      };

      const middleware2: Middleware = async (_req, next) => {
        order.push(2);
        const res = await next();
        order.push(3);
        return res;
      };

      server.use(middleware1);
      server.use(middleware2);

      const req: VirtualRequest = {
        method: 'GET',
        url: 'http://localhost:3000/index.html',
        pathname: '/index.html',
        headers: new Headers(),
        query: new URLSearchParams(),
      };

      await server.handleRequest(req);

      expect(order).toEqual([1, 2, 3, 4]);
    });

    it('should allow middleware to modify response', async () => {
      const middleware: Middleware = async (_req, next) => {
        const res = await next();
        if (res) {
          res.headers.set('X-Custom-Header', 'test');
        }
        return res;
      };

      server.use(middleware);

      const req: VirtualRequest = {
        method: 'GET',
        url: 'http://localhost:3000/index.html',
        pathname: '/index.html',
        headers: new Headers(),
        query: new URLSearchParams(),
      };

      const res = await server.handleRequest(req);

      expect(res.headers.get('X-Custom-Header')).toBe('test');
    });
  });

  describe('module transformation', () => {
    it('should transform JS files', async () => {
      server.setTransformer(async (url, code) => ({
        code: `// Transformed: ${url}\n${code}`,
      }));

      const req: VirtualRequest = {
        method: 'GET',
        url: 'http://localhost:3000/src/app.tsx',
        pathname: '/src/app.tsx',
        headers: new Headers(),
        query: new URLSearchParams(),
      };

      const res = await server.handleRequest(req);

      expect(res.body).toContain('// Transformed:');
    });

    it('should cache transformed modules', async () => {
      let transformCount = 0;

      server.setTransformer(async (_url, code) => {
        transformCount++;
        return { code };
      });

      const req: VirtualRequest = {
        method: 'GET',
        url: 'http://localhost:3000/src/app.tsx',
        pathname: '/src/app.tsx',
        headers: new Headers(),
        query: new URLSearchParams(),
      };

      await server.handleRequest(req);
      await server.handleRequest(req);

      expect(transformCount).toBe(1);
    });

    it('should not transform non-JS files', async () => {
      let transformCalled = false;

      server.setTransformer(async (_url, code) => {
        transformCalled = true;
        return { code };
      });

      const req: VirtualRequest = {
        method: 'GET',
        url: 'http://localhost:3000/styles/main.css',
        pathname: '/styles/main.css',
        headers: new Headers(),
        query: new URLSearchParams(),
      };

      await server.handleRequest(req);

      expect(transformCalled).toBe(false);
    });
  });

  describe('invalidateCache', () => {
    it('should invalidate cached transform', async () => {
      let transformCount = 0;

      server.setTransformer(async (_url, code) => {
        transformCount++;
        return { code };
      });

      const req: VirtualRequest = {
        method: 'GET',
        url: 'http://localhost:3000/src/app.tsx',
        pathname: '/src/app.tsx',
        headers: new Headers(),
        query: new URLSearchParams(),
      };

      await server.handleRequest(req);
      server.invalidateCache('/src/app.tsx');
      await server.handleRequest(req);

      expect(transformCount).toBe(2);
    });
  });

  describe('clearCache', () => {
    it('should clear all cached transforms', async () => {
      let transformCount = 0;

      server.setTransformer(async (_url, code) => {
        transformCount++;
        return { code };
      });

      const req1: VirtualRequest = {
        method: 'GET',
        url: 'http://localhost:3000/src/app.tsx',
        pathname: '/src/app.tsx',
        headers: new Headers(),
        query: new URLSearchParams(),
      };

      const req2: VirtualRequest = {
        method: 'GET',
        url: 'http://localhost:3000/src/index.ts',
        pathname: '/src/index.ts',
        headers: new Headers(),
        query: new URLSearchParams(),
      };

      await server.handleRequest(req1);
      await server.handleRequest(req2);

      server.clearCache();

      await server.handleRequest(req1);
      await server.handleRequest(req2);

      expect(transformCount).toBe(4);
    });
  });

  describe('getModuleUrl', () => {
    it('should return same URL for regular paths', () => {
      expect(server.getModuleUrl('/src/app.tsx')).toBe('/src/app.tsx');
    });

    it('should transform node_modules paths', () => {
      expect(server.getModuleUrl('/node_modules/react')).toBe('/@modules/react');
    });
  });

  describe('error handling', () => {
    it('should return 500 on transform error', async () => {
      server.setTransformer(async () => {
        throw new Error('Transform failed');
      });

      const req: VirtualRequest = {
        method: 'GET',
        url: 'http://localhost:3000/src/app.tsx',
        pathname: '/src/app.tsx',
        headers: new Headers(),
        query: new URLSearchParams(),
      };

      const res = await server.handleRequest(req);

      expect(res.status).toBe(500);
      expect(res.body).toContain('Transform failed');
    });
  });
});
