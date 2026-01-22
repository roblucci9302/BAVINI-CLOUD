/**
 * Unit tests for ModuleGraph
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ModuleGraph, createModuleGraph } from '../module-graph';

describe('ModuleGraph', () => {
  let graph: ModuleGraph;

  beforeEach(() => {
    graph = createModuleGraph();
  });

  describe('createModuleGraph', () => {
    it('should create empty module graph', () => {
      expect(graph.size).toBe(0);
      expect(graph.getAllModules()).toEqual([]);
    });
  });

  describe('ensureEntryFromUrl', () => {
    it('should create module from URL', async () => {
      const mod = await graph.ensureEntryFromUrl('/src/app.tsx');

      expect(mod.id).toBe('/src/app.tsx');
      expect(mod.url).toBe('/src/app.tsx');
      expect(mod.type).toBe('js');
    });

    it('should return existing module if already created', async () => {
      const mod1 = await graph.ensureEntryFromUrl('/src/app.tsx');
      const mod2 = await graph.ensureEntryFromUrl('/src/app.tsx');

      expect(mod1).toBe(mod2);
      expect(graph.size).toBe(1);
    });

    it('should normalize URLs', async () => {
      const mod1 = await graph.ensureEntryFromUrl('/src/app.tsx');
      const mod2 = await graph.ensureEntryFromUrl('src/app.tsx');

      expect(mod1).toBe(mod2);
    });

    it('should detect CSS module type', async () => {
      const mod = await graph.ensureEntryFromUrl('/styles/main.css');

      expect(mod.type).toBe('css');
    });

    it('should detect JSON module type', async () => {
      const mod = await graph.ensureEntryFromUrl('/data/config.json');

      expect(mod.type).toBe('json');
    });

    it('should detect asset module type', async () => {
      const mod = await graph.ensureEntryFromUrl('/images/logo.png');

      expect(mod.type).toBe('asset');
    });
  });

  describe('getModuleByUrl', () => {
    it('should return undefined for unknown URL', () => {
      const mod = graph.getModuleByUrl('/unknown.ts');

      expect(mod).toBeUndefined();
    });

    it('should return module by URL', async () => {
      const created = await graph.ensureEntryFromUrl('/src/app.tsx');
      const found = graph.getModuleByUrl('/src/app.tsx');

      expect(found).toBe(created);
    });
  });

  describe('getModuleById', () => {
    it('should return undefined for unknown ID', () => {
      const mod = graph.getModuleById('/unknown.ts');

      expect(mod).toBeUndefined();
    });

    it('should return module by ID', async () => {
      const created = await graph.ensureEntryFromUrl('/src/app.tsx');
      const found = graph.getModuleById('/src/app.tsx');

      expect(found).toBe(created);
    });
  });

  describe('getModulesByFile', () => {
    it('should return empty set for unknown file', () => {
      const modules = graph.getModulesByFile('/unknown.ts');

      expect(modules.size).toBe(0);
    });

    it('should return modules for file', async () => {
      const mod = await graph.ensureEntryFromUrl('/src/app.tsx');
      const modules = graph.getModulesByFile('/src/app.tsx');

      expect(modules.size).toBe(1);
      expect(modules.has(mod)).toBe(true);
    });
  });

  describe('updateModuleInfo', () => {
    it('should update module imports and importers', async () => {
      const app = await graph.ensureEntryFromUrl('/src/app.tsx');
      const utils = await graph.ensureEntryFromUrl('/src/utils.ts');
      const helper = await graph.ensureEntryFromUrl('/src/helper.ts');

      // app imports utils and helper
      graph.updateModuleInfo(app, new Set([utils, helper]), new Set(), true);

      expect(app.importedModules.size).toBe(2);
      expect(app.importedModules.has(utils)).toBe(true);
      expect(app.importedModules.has(helper)).toBe(true);

      // utils and helper should have app as importer
      expect(utils.importers.has(app)).toBe(true);
      expect(helper.importers.has(app)).toBe(true);
    });

    it('should set self-accepting flag', async () => {
      const mod = await graph.ensureEntryFromUrl('/src/app.tsx');

      graph.updateModuleInfo(mod, new Set(), new Set(), true);

      expect(mod.isSelfAccepting).toBe(true);
    });

    it('should clean up old imports when updated', async () => {
      const app = await graph.ensureEntryFromUrl('/src/app.tsx');
      const oldUtil = await graph.ensureEntryFromUrl('/src/oldUtil.ts');
      const newUtil = await graph.ensureEntryFromUrl('/src/newUtil.ts');

      // First update: app imports oldUtil
      graph.updateModuleInfo(app, new Set([oldUtil]), new Set(), false);
      expect(oldUtil.importers.has(app)).toBe(true);

      // Second update: app now imports newUtil instead
      graph.updateModuleInfo(app, new Set([newUtil]), new Set(), false);

      // Old import should be cleaned up
      expect(oldUtil.importers.has(app)).toBe(false);
      expect(newUtil.importers.has(app)).toBe(true);
    });
  });

  describe('invalidateModule', () => {
    it('should clear transformed code and update timestamp', async () => {
      const mod = await graph.ensureEntryFromUrl('/src/app.tsx');
      mod.transformedCode = 'transformed code';
      mod.sourceMap = 'sourcemap';
      const oldTimestamp = mod.lastModified;

      // Wait a bit to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      graph.invalidateModule(mod);

      expect(mod.transformedCode).toBeUndefined();
      expect(mod.sourceMap).toBeUndefined();
      expect(mod.lastModified).toBeGreaterThan(oldTimestamp);
    });
  });

  describe('getModulesAffectedByFile', () => {
    it('should return empty set for unknown file', () => {
      const affected = graph.getModulesAffectedByFile('/unknown.ts');

      expect(affected.size).toBe(0);
    });

    it('should return self-accepting module', async () => {
      const mod = await graph.ensureEntryFromUrl('/src/app.tsx');
      graph.updateModuleInfo(mod, new Set(), new Set(), true);

      const affected = graph.getModulesAffectedByFile('/src/app.tsx');

      expect(affected.size).toBe(1);
      expect(affected.has(mod)).toBe(true);
    });

    it('should propagate to importers when not self-accepting', async () => {
      const leaf = await graph.ensureEntryFromUrl('/src/leaf.ts');
      const parent = await graph.ensureEntryFromUrl('/src/parent.ts');

      graph.updateModuleInfo(leaf, new Set(), new Set(), false);
      graph.updateModuleInfo(parent, new Set([leaf]), new Set(), true);

      const affected = graph.getModulesAffectedByFile('/src/leaf.ts');

      expect(affected.has(parent)).toBe(true);
    });
  });

  describe('getHMRPropagationPath', () => {
    it('should return null for unknown file', () => {
      const path = graph.getHMRPropagationPath('/unknown.ts');

      expect(path).toBeNull();
    });

    it('should return self for self-accepting module', async () => {
      const mod = await graph.ensureEntryFromUrl('/src/app.tsx');
      graph.updateModuleInfo(mod, new Set(), new Set(), true);

      const path = graph.getHMRPropagationPath('/src/app.tsx');

      expect(path).not.toBeNull();
      expect(path).toContain(mod);
    });

    it('should return CSS module as boundary', async () => {
      const css = await graph.ensureEntryFromUrl('/styles/main.css');

      const path = graph.getHMRPropagationPath('/styles/main.css');

      expect(path).not.toBeNull();
      expect(path).toContain(css);
    });

    it('should return null when no boundary found', async () => {
      const mod = await graph.ensureEntryFromUrl('/src/orphan.ts');
      graph.updateModuleInfo(mod, new Set(), new Set(), false);

      const path = graph.getHMRPropagationPath('/src/orphan.ts');

      expect(path).toBeNull();
    });
  });

  describe('needsFullReload', () => {
    it('should return true when no HMR boundary', async () => {
      const mod = await graph.ensureEntryFromUrl('/src/config.ts');
      graph.updateModuleInfo(mod, new Set(), new Set(), false);

      const needsReload = graph.needsFullReload('/src/config.ts');

      expect(needsReload).toBe(true);
    });

    it('should return false when HMR boundary exists', async () => {
      const mod = await graph.ensureEntryFromUrl('/src/component.tsx');
      graph.updateModuleInfo(mod, new Set(), new Set(), true);

      const needsReload = graph.needsFullReload('/src/component.tsx');

      expect(needsReload).toBe(false);
    });
  });

  describe('removeModule', () => {
    it('should remove module from all maps', async () => {
      const mod = await graph.ensureEntryFromUrl('/src/app.tsx');

      graph.removeModule(mod);

      expect(graph.getModuleByUrl('/src/app.tsx')).toBeUndefined();
      expect(graph.getModuleById('/src/app.tsx')).toBeUndefined();
      expect(graph.size).toBe(0);
    });

    it('should clean up import relationships', async () => {
      const app = await graph.ensureEntryFromUrl('/src/app.tsx');
      const utils = await graph.ensureEntryFromUrl('/src/utils.ts');

      graph.updateModuleInfo(app, new Set([utils]), new Set(), false);

      graph.removeModule(app);

      expect(utils.importers.has(app)).toBe(false);
    });

    it('should clean up importer relationships', async () => {
      const app = await graph.ensureEntryFromUrl('/src/app.tsx');
      const utils = await graph.ensureEntryFromUrl('/src/utils.ts');

      graph.updateModuleInfo(app, new Set([utils]), new Set(), false);

      graph.removeModule(utils);

      expect(app.importedModules.has(utils)).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all modules', async () => {
      await graph.ensureEntryFromUrl('/src/app.tsx');
      await graph.ensureEntryFromUrl('/src/utils.ts');
      await graph.ensureEntryFromUrl('/styles/main.css');

      graph.clear();

      expect(graph.size).toBe(0);
      expect(graph.getAllModules()).toEqual([]);
    });
  });

  describe('getAllModules', () => {
    it('should return all modules', async () => {
      const app = await graph.ensureEntryFromUrl('/src/app.tsx');
      const utils = await graph.ensureEntryFromUrl('/src/utils.ts');

      const allModules = graph.getAllModules();

      expect(allModules).toContain(app);
      expect(allModules).toContain(utils);
      expect(allModules.length).toBe(2);
    });
  });
});
