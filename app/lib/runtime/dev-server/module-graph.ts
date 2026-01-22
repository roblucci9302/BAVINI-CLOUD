/**
 * =============================================================================
 * BAVINI Dev Server - Module Graph
 * =============================================================================
 * Tracks module dependencies for efficient HMR updates.
 * =============================================================================
 */

import type { ModuleNode, ModuleGraph as IModuleGraph } from './types';

/**
 * Create a new module node
 */
function createModuleNode(id: string, file: string, url: string): ModuleNode {
  return {
    id,
    file,
    url,
    type: getModuleType(file),
    importedModules: new Set(),
    importers: new Set(),
    acceptedHmrDeps: new Set(),
    isSelfAccepting: false,
    lastModified: Date.now(),
    meta: {},
  };
}

/**
 * Determine module type from file extension
 */
function getModuleType(file: string): ModuleNode['type'] {
  const ext = file.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
    case 'styl':
      return 'css';
    case 'json':
      return 'json';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
    case 'ico':
    case 'woff':
    case 'woff2':
    case 'ttf':
    case 'eot':
      return 'asset';
    default:
      return 'js';
  }
}

/**
 * Module Graph Implementation
 * Tracks all modules and their dependencies for HMR
 */
export class ModuleGraph implements IModuleGraph {
  /** Map from URL to module */
  private urlToModuleMap = new Map<string, ModuleNode>();
  /** Map from file path to modules */
  private fileToModulesMap = new Map<string, Set<ModuleNode>>();
  /** Map from ID to module */
  private idToModuleMap = new Map<string, ModuleNode>();

  /**
   * Get module by URL
   */
  getModuleByUrl(url: string): ModuleNode | undefined {
    return this.urlToModuleMap.get(this.normalizeUrl(url));
  }

  /**
   * Get module by ID (usually file path)
   */
  getModuleById(id: string): ModuleNode | undefined {
    return this.idToModuleMap.get(this.normalizeId(id));
  }

  /**
   * Get all modules for a file
   */
  getModulesByFile(file: string): Set<ModuleNode> {
    return this.fileToModulesMap.get(this.normalizeId(file)) || new Set();
  }

  /**
   * Ensure a module exists for the given URL
   */
  async ensureEntryFromUrl(url: string): Promise<ModuleNode> {
    const normalizedUrl = this.normalizeUrl(url);

    let mod = this.urlToModuleMap.get(normalizedUrl);
    if (mod) {
      return mod;
    }

    // Create new module
    const id = this.urlToId(normalizedUrl);
    mod = createModuleNode(id, id, normalizedUrl);

    this.urlToModuleMap.set(normalizedUrl, mod);
    this.idToModuleMap.set(id, mod);

    // Add to file map
    const fileModules = this.fileToModulesMap.get(id) || new Set();
    fileModules.add(mod);
    this.fileToModulesMap.set(id, fileModules);

    return mod;
  }

  /**
   * Update module information
   */
  updateModuleInfo(
    mod: ModuleNode,
    importedModules: Set<ModuleNode>,
    acceptedHmrDeps: Set<ModuleNode>,
    isSelfAccepting: boolean,
  ): void {
    // Remove old importer references
    for (const imported of mod.importedModules) {
      imported.importers.delete(mod);
    }

    // Set new imports
    mod.importedModules = importedModules;
    mod.acceptedHmrDeps = acceptedHmrDeps;
    mod.isSelfAccepting = isSelfAccepting;

    // Add new importer references
    for (const imported of importedModules) {
      imported.importers.add(mod);
    }
  }

  /**
   * Invalidate a module (mark for re-transform)
   */
  invalidateModule(mod: ModuleNode): void {
    mod.transformedCode = undefined;
    mod.sourceMap = undefined;
    mod.lastModified = Date.now();
  }

  /**
   * Get all modules affected by a file change
   * This walks up the import tree to find the HMR boundary
   */
  getModulesAffectedByFile(file: string): Set<ModuleNode> {
    const affected = new Set<ModuleNode>();
    const modules = this.getModulesByFile(file);

    for (const mod of modules) {
      this.collectAffectedModules(mod, affected, new Set());
    }

    return affected;
  }

  /**
   * Recursively collect affected modules
   */
  private collectAffectedModules(
    mod: ModuleNode,
    affected: Set<ModuleNode>,
    visited: Set<ModuleNode>,
  ): boolean {
    if (visited.has(mod)) {
      return false;
    }
    visited.add(mod);

    // If module accepts self updates, it's an HMR boundary
    if (mod.isSelfAccepting) {
      affected.add(mod);
      return true;
    }

    // Check if any importer accepts this module
    for (const importer of mod.importers) {
      if (importer.acceptedHmrDeps.has(mod)) {
        affected.add(importer);
        return true;
      }
    }

    // If no boundary found, propagate to importers
    let hasHmrBoundary = false;
    for (const importer of mod.importers) {
      if (this.collectAffectedModules(importer, affected, visited)) {
        hasHmrBoundary = true;
      }
    }

    // If no HMR boundary found anywhere, need full reload
    if (!hasHmrBoundary && mod.importers.size === 0) {
      affected.add(mod);
    }

    return hasHmrBoundary;
  }

  /**
   * Get HMR propagation path
   * Returns modules that need to be updated in order
   */
  getHMRPropagationPath(file: string): ModuleNode[] | null {
    const modules = this.getModulesByFile(file);
    if (modules.size === 0) {
      return null;
    }

    const boundaries: ModuleNode[] = [];
    const visited = new Set<ModuleNode>();

    for (const mod of modules) {
      const boundary = this.findHMRBoundary(mod, visited);
      if (boundary === null) {
        // No boundary found - needs full reload
        return null;
      }
      if (boundary) {
        boundaries.push(boundary);
      }
    }

    return boundaries;
  }

  /**
   * Find the HMR boundary for a module
   * Returns null if full reload needed, the boundary module, or undefined if already visited
   */
  private findHMRBoundary(
    mod: ModuleNode,
    visited: Set<ModuleNode>,
  ): ModuleNode | null | undefined {
    if (visited.has(mod)) {
      return undefined;
    }
    visited.add(mod);

    // CSS modules always self-accept
    if (mod.type === 'css') {
      return mod;
    }

    // Check if self-accepting
    if (mod.isSelfAccepting) {
      return mod;
    }

    // Check importers
    for (const importer of mod.importers) {
      // Check if importer accepts this module
      if (importer.acceptedHmrDeps.has(mod)) {
        return importer;
      }

      // Recurse up the tree
      const boundary = this.findHMRBoundary(importer, visited);
      if (boundary === null) {
        return null;
      }
      if (boundary) {
        return boundary;
      }
    }

    // No importers and not self-accepting - needs full reload
    if (mod.importers.size === 0) {
      return null;
    }

    return undefined;
  }

  /**
   * Check if a file change requires full reload
   */
  needsFullReload(file: string): boolean {
    return this.getHMRPropagationPath(file) === null;
  }

  /**
   * Clear the entire module graph
   */
  clear(): void {
    this.urlToModuleMap.clear();
    this.fileToModulesMap.clear();
    this.idToModuleMap.clear();
  }

  /**
   * Remove a module from the graph
   */
  removeModule(mod: ModuleNode): void {
    // Remove from maps
    this.urlToModuleMap.delete(mod.url);
    this.idToModuleMap.delete(mod.id);

    const fileModules = this.fileToModulesMap.get(mod.file);
    if (fileModules) {
      fileModules.delete(mod);
      if (fileModules.size === 0) {
        this.fileToModulesMap.delete(mod.file);
      }
    }

    // Remove references
    for (const imported of mod.importedModules) {
      imported.importers.delete(mod);
    }

    for (const importer of mod.importers) {
      importer.importedModules.delete(mod);
      importer.acceptedHmrDeps.delete(mod);
    }
  }

  /**
   * Get all modules in the graph
   */
  getAllModules(): ModuleNode[] {
    return Array.from(this.idToModuleMap.values());
  }

  /**
   * Get module count
   */
  get size(): number {
    return this.idToModuleMap.size;
  }

  /**
   * Normalize URL for consistent lookup
   */
  private normalizeUrl(url: string): string {
    // Remove query params and hash
    const cleanUrl = url.split('?')[0].split('#')[0];
    // Ensure leading slash
    return cleanUrl.startsWith('/') ? cleanUrl : '/' + cleanUrl;
  }

  /**
   * Normalize ID (file path)
   */
  private normalizeId(id: string): string {
    // Ensure leading slash for absolute paths
    return id.startsWith('/') ? id : '/' + id;
  }

  /**
   * Convert URL to module ID
   */
  private urlToId(url: string): string {
    // Remove leading slash for file path
    let id = url.startsWith('/') ? url : '/' + url;

    // Handle special prefixes
    if (id.startsWith('/@modules/')) {
      id = id.replace('/@modules/', '/node_modules/');
    }

    return id;
  }

  /**
   * Debug: print module graph
   */
  debugPrint(): void {
    console.log('=== Module Graph ===');
    for (const [id, mod] of this.idToModuleMap) {
      console.log(`Module: ${id}`);
      console.log(`  URL: ${mod.url}`);
      console.log(`  Type: ${mod.type}`);
      console.log(`  Self-accepting: ${mod.isSelfAccepting}`);
      console.log(`  Imports: ${Array.from(mod.importedModules).map(m => m.id).join(', ')}`);
      console.log(`  Importers: ${Array.from(mod.importers).map(m => m.id).join(', ')}`);
    }
  }
}

/**
 * Create a new module graph
 */
export function createModuleGraph(): ModuleGraph {
  return new ModuleGraph();
}

export default ModuleGraph;
