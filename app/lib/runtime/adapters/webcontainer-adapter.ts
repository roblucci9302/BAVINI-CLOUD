/**
 * =============================================================================
 * BAVINI CLOUD - WebContainer Runtime Adapter
 * =============================================================================
 * Wrapper autour de WebContainer (StackBlitz) qui implémente RuntimeAdapter.
 * Permet d'utiliser WebContainer via l'interface abstraite.
 * =============================================================================
 */

import type { WebContainer } from '@webcontainer/api';
import { BaseRuntimeAdapter } from '../adapter';
import type {
  FileMap,
  BundleResult,
  BuildOptions,
  TransformOptions,
  PreviewInfo,
  RuntimeStatus,
} from '../types';
import { getWebContainer, webcontainerStatusStore } from '~/lib/webcontainer';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('WebContainerAdapter');

/**
 * Adapteur pour WebContainer (StackBlitz).
 *
 * Cet adapteur wrappe le WebContainer existant pour qu'il soit
 * compatible avec l'interface RuntimeAdapter.
 *
 * Capacités:
 * - ✅ Terminal complet
 * - ✅ Shell (npm, node, etc.)
 * - ✅ Serveurs Node.js
 * - ✅ Fonctionne dans le browser (WASM)
 */
export class WebContainerAdapter extends BaseRuntimeAdapter {
  readonly name = 'WebContainer';
  readonly supportsTerminal = true;
  readonly supportsShell = true;
  readonly supportsNodeServer = true;
  readonly isBrowserOnly = true;
  readonly supportedFrameworks = [
    'react',
    'vue',
    'svelte',
    'next',
    'remix',
    'astro',
    'vite',
    'express',
    'fastify',
  ];

  private container: WebContainer | null = null;
  private currentPreview: PreviewInfo | null = null;
  private _status: RuntimeStatus = 'idle';

  get status(): RuntimeStatus {
    return this._status;
  }

  /**
   * Initialise le WebContainer.
   */
  async init(): Promise<void> {
    if (this.container) {
      logger.debug('WebContainer already initialized');
      return;
    }

    this._status = 'initializing';
    this.emitStatusChange(this._status);

    try {
      logger.info('Initializing WebContainer...');
      this.container = await getWebContainer();

      // Écouter les événements de port pour le preview
      this.container.on('port', (port, type, url) => {
        if (type === 'open') {
          this.currentPreview = {
            url,
            ready: true,
            updatedAt: Date.now(),
          };
          this.emitPreviewReady(this.currentPreview);
        } else if (type === 'close') {
          if (this.currentPreview?.url === url) {
            this.currentPreview = null;
          }
        }
      });

      this._status = 'ready';
      this.emitStatusChange(this._status);
      logger.info('WebContainer initialized successfully');
    } catch (error) {
      this._status = 'error';
      this.emitStatusChange(this._status);
      const message = error instanceof Error ? error.message : String(error);
      logger.error('WebContainer initialization failed:', message);
      throw error;
    }
  }

  /**
   * Nettoie les ressources.
   */
  async destroy(): Promise<void> {
    // WebContainer ne peut pas être détruit proprement
    // On reset juste les références
    this.container = null;
    this.currentPreview = null;
    this._status = 'idle';
    logger.info('WebContainerAdapter destroyed');
  }

  /**
   * Écrit plusieurs fichiers.
   */
  async writeFiles(files: FileMap): Promise<void> {
    if (!this.container) {
      throw new Error('WebContainer not initialized');
    }

    const entries = Array.from(files.entries());

    for (const [path, content] of entries) {
      await this.writeFile(path, content);
    }
  }

  /**
   * Écrit un fichier.
   */
  async writeFile(path: string, content: string): Promise<void> {
    if (!this.container) {
      throw new Error('WebContainer not initialized');
    }

    // Normaliser le chemin (enlever le / initial si présent)
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;

    // Créer les répertoires parents si nécessaire
    const parts = normalizedPath.split('/');
    if (parts.length > 1) {
      const dir = parts.slice(0, -1).join('/');
      await this.ensureDir(dir);
    }

    await this.container.fs.writeFile(normalizedPath, content);
  }

  /**
   * Lit un fichier.
   */
  async readFile(path: string): Promise<string | null> {
    if (!this.container) {
      throw new Error('WebContainer not initialized');
    }

    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;

    try {
      const content = await this.container.fs.readFile(normalizedPath, 'utf-8');
      return content;
    } catch {
      return null;
    }
  }

  /**
   * Supprime un fichier.
   */
  async deleteFile(path: string): Promise<void> {
    if (!this.container) {
      throw new Error('WebContainer not initialized');
    }

    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;

    try {
      await this.container.fs.rm(normalizedPath);
    } catch {
      // Ignorer si le fichier n'existe pas
    }
  }

  /**
   * Liste les fichiers d'un répertoire.
   */
  async readdir(path: string): Promise<string[]> {
    if (!this.container) {
      throw new Error('WebContainer not initialized');
    }

    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;

    try {
      const entries = await this.container.fs.readdir(normalizedPath);
      return entries;
    } catch {
      return [];
    }
  }

  /**
   * Build le projet.
   *
   * Note: WebContainer n'a pas de build intégré.
   * On exécute la commande de build (npm run build, etc.)
   * et on retourne un résultat simplifié.
   */
  async build(options: BuildOptions): Promise<BundleResult> {
    if (!this.container) {
      throw new Error('WebContainer not initialized');
    }

    this._status = 'building';
    this.emitStatusChange(this._status);

    const startTime = performance.now();

    try {
      // Exécuter le dev server si pas déjà lancé
      // Note: Dans WebContainer, le "build" est géré par Vite/webpack en temps réel
      // On simule un résultat pour maintenir l'interface

      const buildTime = performance.now() - startTime;

      this._status = 'ready';
      this.emitStatusChange(this._status);

      return {
        code: '', // WebContainer gère le code en interne
        css: '',
        errors: [],
        warnings: [],
        buildTime,
        hash: Date.now().toString(36),
      };
    } catch (error) {
      this._status = 'error';
      this.emitStatusChange(this._status);

      return {
        code: '',
        css: '',
        errors: [
          {
            message: error instanceof Error ? error.message : String(error),
          },
        ],
        warnings: [],
        buildTime: performance.now() - startTime,
        hash: '',
      };
    }
  }

  /**
   * Transforme du code.
   *
   * Note: WebContainer n'a pas de transform isolé.
   * On retourne le code tel quel (la transformation est faite par Vite).
   */
  async transform(code: string, _options: TransformOptions): Promise<string> {
    // WebContainer utilise Vite qui gère la transformation
    // On retourne le code tel quel
    return code;
  }

  /**
   * Obtient le preview actuel.
   */
  getPreview(): PreviewInfo | null {
    return this.currentPreview;
  }

  /**
   * Rafraîchit le preview.
   */
  async refreshPreview(): Promise<void> {
    // Le refresh est géré par l'iframe côté UI
    // On émet juste un événement
    if (this.currentPreview) {
      this.currentPreview.updatedAt = Date.now();
      this.emitPreviewReady(this.currentPreview);
    }
  }

  // ===========================================================================
  // MÉTHODES SPÉCIFIQUES À WEBCONTAINER
  // ===========================================================================

  /**
   * Obtient l'instance WebContainer brute.
   * Utile pour les fonctionnalités avancées (terminal, shell, etc.)
   */
  getContainer(): WebContainer | null {
    return this.container;
  }

  /**
   * Exécute une commande shell.
   */
  async spawn(
    command: string,
    args: string[] = [],
  ): Promise<{ exit: Promise<number>; output: ReadableStream<string> }> {
    if (!this.container) {
      throw new Error('WebContainer not initialized');
    }

    const process = await this.container.spawn(command, args);

    return {
      exit: process.exit,
      output: process.output,
    };
  }

  /**
   * Crée les répertoires parents si nécessaire.
   */
  private async ensureDir(path: string): Promise<void> {
    if (!this.container) return;

    const parts = path.split('/').filter(Boolean);
    let currentPath = '';

    for (const part of parts) {
      currentPath += (currentPath ? '/' : '') + part;
      try {
        await this.container.fs.mkdir(currentPath);
      } catch {
        // Le répertoire existe déjà, on continue
      }
    }
  }
}

/**
 * Crée une instance de WebContainerAdapter.
 */
export function createWebContainerAdapter(): WebContainerAdapter {
  return new WebContainerAdapter();
}
