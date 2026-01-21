/**
 * =============================================================================
 * BAVINI Runtime Engine - Module Resolver Tests
 * =============================================================================
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { ModuleResolver, createModuleResolver } from './module-resolver';
import { createUnifiedFS, resetSharedFS } from './unified-fs';
import { createProcessShim } from './node-polyfills';

describe('ModuleResolver', () => {
  let resolver: ModuleResolver;

  beforeEach(() => {
    resetSharedFS();
    const fs = createUnifiedFS();
    const process = createProcessShim(fs);
    resolver = createModuleResolver(fs, process);

    // Set up some test files
    fs.writeFileSync('/src/index.js', 'export const main = true;');
    fs.writeFileSync('/src/utils.ts', 'export const util = true;');
    fs.writeFileSync('/src/components/Button.tsx', 'export default function Button() {}');
    fs.writeFileSync('/node_modules/lodash/index.js', 'module.exports = {};');
    fs.writeFileSync('/node_modules/lodash/package.json', '{"name": "lodash", "main": "index.js"}');
    fs.writeFileSync('/node_modules/@scope/lib/index.mjs', 'export default {};');
    fs.writeFileSync('/node_modules/@scope/lib/package.json', '{"name": "@scope/lib", "module": "index.mjs"}');
  });

  afterEach(() => {
    resetSharedFS();
  });

  describe('Builtin Modules', () => {
    it('should resolve path module', () => {
      const result = resolver.resolve('path');

      expect(result.found).toBe(true);
      expect(result.isBuiltin).toBe(true);
    });

    it('should resolve fs module', () => {
      const result = resolver.resolve('fs');

      expect(result.found).toBe(true);
      expect(result.isBuiltin).toBe(true);
    });

    it('should resolve buffer module', () => {
      const result = resolver.resolve('buffer');

      expect(result.found).toBe(true);
      expect(result.isBuiltin).toBe(true);
    });

    it('should get builtin module content', () => {
      const pathModule = resolver.getBuiltin('path');

      expect(pathModule).not.toBeNull();
      expect(pathModule).toHaveProperty('join');
      expect(pathModule).toHaveProperty('dirname');
    });

    it('should list all builtin module names', () => {
      const names = resolver.getBuiltinNames();

      expect(names).toContain('path');
      expect(names).toContain('fs');
      expect(names).toContain('buffer');
      expect(names).toContain('process');
    });
  });

  describe('Relative Path Resolution', () => {
    it('should resolve relative path with extension', () => {
      const result = resolver.resolve('./utils.ts', '/src/index.js');

      expect(result.found).toBe(true);
      expect(result.path).toBe('/src/utils.ts');
      expect(result.isBuiltin).toBe(false);
    });

    it('should resolve relative path without extension', () => {
      const result = resolver.resolve('./utils', '/src/index.js');

      expect(result.found).toBe(true);
      expect(result.path).toBe('/src/utils.ts');
    });

    it('should resolve nested relative path', () => {
      const result = resolver.resolve('./components/Button', '/src/index.js');

      expect(result.found).toBe(true);
      expect(result.path).toBe('/src/components/Button.tsx');
    });

    it('should resolve parent directory path', () => {
      const result = resolver.resolve('../utils', '/src/components/Button.tsx');

      expect(result.found).toBe(true);
      expect(result.path).toBe('/src/utils.ts');
    });
  });

  describe('Absolute Path Resolution', () => {
    it('should resolve absolute path', () => {
      const result = resolver.resolve('/src/index.js');

      expect(result.found).toBe(true);
      expect(result.path).toBe('/src/index.js');
    });

    it('should resolve absolute path without extension', () => {
      const result = resolver.resolve('/src/utils');

      expect(result.found).toBe(true);
      expect(result.path).toBe('/src/utils.ts');
    });
  });

  describe('Node Modules Resolution', () => {
    it('should resolve npm package from node_modules', () => {
      const result = resolver.resolve('lodash', '/src/index.js');

      expect(result.found).toBe(true);
      expect(result.path).toBe('/node_modules/lodash/index.js');
      expect(result.isBuiltin).toBe(false);
    });

    it('should resolve scoped npm package', () => {
      const result = resolver.resolve('@scope/lib', '/src/index.js');

      expect(result.found).toBe(true);
      expect(result.path).toBe('/node_modules/@scope/lib/index.mjs');
    });
  });

  describe('External Package Resolution', () => {
    it('should mark unknown packages as external', () => {
      const result = resolver.resolve('unknown-package', '/src/index.js');

      expect(result.found).toBe(true);
      expect(result.isExternal).toBe(true);
      expect(result.path).toContain('esm.sh');
    });

    it('should not mark relative paths as external', () => {
      const result = resolver.resolve('./nonexistent', '/src/index.js');

      expect(result.found).toBe(false);
      expect(result.isExternal).toBeUndefined();
    });
  });

  describe('Module Caching', () => {
    it('should cache modules', () => {
      const module = { exports: { test: true }, loaded: true };
      resolver.setCached('/src/test.js', module);

      expect(resolver.isCached('/src/test.js')).toBe(true);
      expect(resolver.getCached('/src/test.js')).toBe(module);
    });

    it('should clear cache', () => {
      resolver.setCached('/src/test.js', { exports: {}, loaded: true });
      resolver.clearCache();

      expect(resolver.isCached('/src/test.js')).toBe(false);
    });
  });

  describe('Require Function', () => {
    it('should create require function for a file', () => {
      const require = resolver.createRequire('/src/index.js');

      expect(typeof require).toBe('function');
    });

    it('should require builtin modules', () => {
      const require = resolver.createRequire('/src/index.js');
      const pathModule = require('path');

      expect(pathModule).toHaveProperty('join');
    });

    it('should throw for external modules in sync require', () => {
      const require = resolver.createRequire('/src/index.js');

      expect(() => require('unknown-package')).toThrow('async import');
    });
  });
});
