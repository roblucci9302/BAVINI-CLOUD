/**
 * Tests for Router Plugin
 *
 * Validates multi-page routing detection and generation capabilities.
 */

import { describe, it, expect } from 'vitest';
import {
  detectRoutingNeeds,
  detectRoutesFromFiles,
  generateReactRouterWrapper,
  isInternalRoute,
  transformLinksToRouterLinks,
  type RouteDefinition,
} from './router-plugin';

describe('Router Plugin', () => {
  describe('detectRoutesFromFiles', () => {
    it('should detect Next.js App Router pages', () => {
      const filesList = [
        '/src/app/page.tsx',
        '/src/app/about/page.tsx',
        '/src/app/products/page.tsx',
        '/src/app/products/[id]/page.tsx',
      ];
      const files = new Map<string, string>(
        filesList.map((f) => [f, 'export default function() {}'])
      );

      const routes = detectRoutesFromFiles(filesList, files);

      expect(routes).toHaveLength(4);
      expect(routes.find((r) => r.path === '/')).toBeDefined();
      expect(routes.find((r) => r.path === '/about')).toBeDefined();
      expect(routes.find((r) => r.path === '/products')).toBeDefined();
      expect(routes.find((r) => r.path === '/products/:id')).toBeDefined();
    });

    it('should detect Next.js App Router pages WITHOUT leading slash', () => {
      // This is how files are stored in browser build adapter
      const filesList = [
        'src/app/page.tsx',
        'src/app/about/page.tsx',
        'src/app/products/page.tsx',
        'src/app/products/[id]/page.tsx',
      ];
      const files = new Map<string, string>(
        filesList.map((f) => [f, 'export default function() {}'])
      );

      const routes = detectRoutesFromFiles(filesList, files);

      expect(routes).toHaveLength(4);
      expect(routes.find((r) => r.path === '/')).toBeDefined();
      expect(routes.find((r) => r.path === '/about')).toBeDefined();
      expect(routes.find((r) => r.path === '/products')).toBeDefined();
      expect(routes.find((r) => r.path === '/products/:id')).toBeDefined();
    });

    it('should detect Next.js Pages Router pages', () => {
      const filesList = [
        '/pages/index.tsx',
        '/pages/about.tsx',
        '/pages/contact.tsx',
      ];
      const files = new Map<string, string>(
        filesList.map((f) => [f, 'export default function() {}'])
      );

      const routes = detectRoutesFromFiles(filesList, files);

      expect(routes).toHaveLength(3);
      expect(routes.find((r) => r.path === '/')).toBeDefined();
      expect(routes.find((r) => r.path === '/about')).toBeDefined();
      expect(routes.find((r) => r.path === '/contact')).toBeDefined();
    });

    it('should exclude _app and _document files', () => {
      const filesList = [
        '/pages/index.tsx',
        '/pages/_app.tsx',
        '/pages/_document.tsx',
      ];
      const files = new Map<string, string>(
        filesList.map((f) => [f, 'export default function() {}'])
      );

      const routes = detectRoutesFromFiles(filesList, files);

      expect(routes).toHaveLength(1);
      expect(routes[0].path).toBe('/');
    });

    it('should exclude API routes', () => {
      const filesList = [
        '/pages/index.tsx',
        '/pages/api/users.ts',
        '/pages/api/posts.ts',
      ];
      const files = new Map<string, string>(
        filesList.map((f) => [f, 'export default function() {}'])
      );

      const routes = detectRoutesFromFiles(filesList, files);

      expect(routes).toHaveLength(1);
      expect(routes[0].path).toBe('/');
    });

    it('should convert dynamic segments [id] to :id', () => {
      const filesList = [
        '/src/app/users/[userId]/page.tsx',
        '/src/app/posts/[slug]/page.tsx',
      ];
      const files = new Map<string, string>(
        filesList.map((f) => [f, 'export default function() {}'])
      );

      const routes = detectRoutesFromFiles(filesList, files);

      expect(routes.find((r) => r.path === '/users/:userId')).toBeDefined();
      expect(routes.find((r) => r.path === '/posts/:slug')).toBeDefined();
    });

    it('should sort routes with index first, dynamic last', () => {
      const filesList = [
        '/src/app/about/page.tsx',
        '/src/app/products/[id]/page.tsx',
        '/src/app/page.tsx',
        '/src/app/contact/page.tsx',
      ];
      const files = new Map<string, string>(
        filesList.map((f) => [f, 'export default function() {}'])
      );

      const routes = detectRoutesFromFiles(filesList, files);

      expect(routes[0].path).toBe('/');
      expect(routes[routes.length - 1].path).toBe('/products/:id');
    });
  });

  describe('detectRoutingNeeds', () => {
    it('should detect React Router imports', () => {
      const files = new Map<string, string>([
        ['/src/App.tsx', "import { BrowserRouter } from 'react-router-dom';"],
      ]);

      const result = detectRoutingNeeds(files);

      expect(result.hasRouter).toBe(true);
      expect(result.routerType).toBe('react-router');
    });

    it('should detect TanStack Router imports', () => {
      const files = new Map<string, string>([
        [
          '/src/App.tsx',
          `import { createRouter } from '@tanstack/react-router';
           const router = createRouter({ routeTree });`,
        ],
      ]);

      const result = detectRoutingNeeds(files);

      expect(result.hasRouter).toBe(true);
      expect(result.routerType).toBe('tanstack-router');
    });

    it('should detect routing need from multiple pages', () => {
      const files = new Map<string, string>([
        ['/src/app/page.tsx', 'export default function Home() {}'],
        ['/src/app/about/page.tsx', 'export default function About() {}'],
        ['/src/app/contact/page.tsx', 'export default function Contact() {}'],
      ]);

      const result = detectRoutingNeeds(files);

      expect(result.hasRouter).toBe(true);
      expect(result.routerType).toBe('react-router');
      expect(result.detectedRoutes).toHaveLength(3);
    });

    it('should return no router for single page apps', () => {
      const files = new Map<string, string>([
        ['/src/App.tsx', 'export default function App() {}'],
      ]);

      const result = detectRoutingNeeds(files);

      expect(result.hasRouter).toBe(false);
      expect(result.routerType).toBe('none');
    });

    it('should detect routing from multiple Link components', () => {
      const files = new Map<string, string>([
        [
          '/src/App.tsx',
          `
          <Link href="/about">About</Link>
          <Link href="/products">Products</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/blog">Blog</Link>
        `,
        ],
      ]);

      const result = detectRoutingNeeds(files);

      expect(result.hasRouter).toBe(true);
    });
  });

  describe('isInternalRoute', () => {
    it('should return true for internal paths', () => {
      expect(isInternalRoute('/about')).toBe(true);
      expect(isInternalRoute('/products/123')).toBe(true);
      expect(isInternalRoute('about')).toBe(true);
    });

    it('should return false for external URLs', () => {
      expect(isInternalRoute('https://example.com')).toBe(false);
      expect(isInternalRoute('http://example.com')).toBe(false);
    });

    it('should return false for hash links', () => {
      expect(isInternalRoute('#section')).toBe(false);
    });

    it('should return false for mailto and tel', () => {
      expect(isInternalRoute('mailto:test@example.com')).toBe(false);
      expect(isInternalRoute('tel:+1234567890')).toBe(false);
    });

    it('should return false for empty href', () => {
      expect(isInternalRoute('')).toBe(false);
    });
  });

  describe('transformLinksToRouterLinks', () => {
    it('should transform internal <a> tags to <Link>', () => {
      const code = '<a href="/about">About</a>';
      const result = transformLinksToRouterLinks(code);

      expect(result).toBe('<Link to="/about">About</a>');
    });

    it('should preserve external links', () => {
      const code = '<a href="https://example.com">External</a>';
      const result = transformLinksToRouterLinks(code);

      expect(result).toBe('<a href="https://example.com">External</a>');
    });

    it('should preserve hash links', () => {
      const code = '<a href="#section">Section</a>';
      const result = transformLinksToRouterLinks(code);

      expect(result).toBe('<a href="#section">Section</a>');
    });

    it('should handle multiple internal links', () => {
      const code = `
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
      `;
      const result = transformLinksToRouterLinks(code);

      expect(result).toContain('<Link to="/about">');
      expect(result).toContain('<Link to="/contact">');
    });

    it('should preserve className and other attributes', () => {
      const code = '<a href="/about" className="nav-link">About</a>';
      const result = transformLinksToRouterLinks(code);

      expect(result).toContain('className="nav-link"');
      expect(result).toContain('to="/about"');
    });
  });

  describe('generateReactRouterWrapper', () => {
    it('should generate simple wrapper for empty routes', () => {
      const routes: RouteDefinition[] = [];
      const result = generateReactRouterWrapper(routes, '/src/App.tsx');

      expect(result).toContain('BrowserRouter');
      expect(result).not.toContain('<Route');
    });

    it('should generate routes for multiple pages', () => {
      const routes: RouteDefinition[] = [
        { path: '/', component: '/src/app/page.tsx', index: true },
        { path: '/about', component: '/src/app/about/page.tsx' },
        { path: '/contact', component: '/src/app/contact/page.tsx' },
      ];

      const result = generateReactRouterWrapper(routes, '/src/App.tsx');

      expect(result).toContain('BrowserRouter');
      expect(result).toContain('Routes');
      expect(result).toContain('Route');
      expect(result).toContain('path="/"');
      expect(result).toContain('path="/about"');
      expect(result).toContain('path="/contact"');
    });

    it('should generate imports for page components', () => {
      const routes: RouteDefinition[] = [
        { path: '/', component: '/src/app/page.tsx', index: true },
      ];

      const result = generateReactRouterWrapper(routes, '/src/App.tsx');

      expect(result).toContain("import");
      expect(result).toContain("/src/app/page");
    });
  });
});
