/**
 * Chargeur de mémoire projet pour les agents BAVINI
 *
 * Implémente le chargement de BAVINI.md ou CLAUDE.md inspiré de Claude Code
 * pour fournir des instructions persistantes au niveau du projet.
 *
 * Recherche dans l'ordre:
 * 1. BAVINI.md (priorité)
 * 2. CLAUDE.md (fallback)
 * 3. .bavini/config.md
 * 4. .claude/config.md
 *
 * @module agents/utils/project-memory
 */

import type { ProjectMemory } from '../types';

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Options de chargement de la mémoire projet
 */
export interface ProjectMemoryOptions {
  /** Chemin racine du projet */
  projectRoot?: string;

  /** Noms de fichiers à rechercher (dans l'ordre de priorité) */
  fileNames?: string[];

  /** Parser personnalisé pour le contenu */
  customParser?: (content: string) => Partial<ProjectMemory>;

  /** Callback pour lire les fichiers (pour environnement navigateur) */
  fileReader?: (path: string) => Promise<string | null>;
}

/**
 * Résultat du chargement
 */
export interface ProjectMemoryLoadResult {
  /** Mémoire chargée (ou null si non trouvée) */
  memory: ProjectMemory | null;

  /** Source du fichier */
  source: string | null;

  /** Erreurs rencontrées */
  errors: string[];

  /** Fichiers recherchés */
  searchedPaths: string[];
}

/**
 * Section parsée du fichier
 */
interface ParsedSection {
  title: string;
  content: string;
  level: number;
}

/*
 * ============================================================================
 * CONSTANTES
 * ============================================================================
 */

/**
 * Noms de fichiers par défaut à rechercher
 */
export const DEFAULT_MEMORY_FILES = [
  'BAVINI.md',
  'CLAUDE.md',
  '.bavini/config.md',
  '.claude/config.md',
  '.bavini.md',
  '.claude.md',
];

/**
 * Mapping des titres de section vers les propriétés de ProjectMemory
 */
const SECTION_MAPPINGS: Record<string, keyof ProjectMemory> = {
  // Instructions
  instructions: 'instructions',
  règles: 'instructions',
  rules: 'instructions',
  directives: 'instructions',

  // Contexte
  contexte: 'context',
  context: 'context',
  description: 'context',
  'à propos': 'context',
  about: 'context',

  // Contraintes
  contraintes: 'constraints',
  constraints: 'constraints',
  restrictions: 'constraints',
  limitations: 'constraints',

  // Style de code
  style: 'codeStyle',
  'code style': 'codeStyle',
  'style de code': 'codeStyle',
  formatting: 'codeStyle',

  // Patterns
  patterns: 'patterns',
  conventions: 'patterns',
  'bonnes pratiques': 'patterns',
  'best practices': 'patterns',

  // Ignorer
  ignorer: 'ignore',
  ignore: 'ignore',
  exclure: 'ignore',
  exclude: 'ignore',
};

/*
 * ============================================================================
 * PARSER
 * ============================================================================
 */

/**
 * Parser pour le contenu markdown de la mémoire projet
 */
export class ProjectMemoryParser {
  /**
   * Parser le contenu markdown en ProjectMemory
   */
  parse(content: string): ProjectMemory {
    const sections = this.extractSections(content);
    const memory: ProjectMemory = {};

    for (const section of sections) {
      const normalizedTitle = section.title.toLowerCase().trim();
      const propertyKey = SECTION_MAPPINGS[normalizedTitle];

      if (propertyKey) {
        this.assignSection(memory, propertyKey, section.content);
      } else if (normalizedTitle === 'custom' || normalizedTitle === 'personnalisé') {
        // Section custom: parser comme JSON ou key-value
        memory.custom = this.parseCustomSection(section.content);
      }
    }

    // Si pas de sections reconnues, utiliser tout comme instructions
    if (Object.keys(memory).length === 0 && content.trim()) {
      memory.instructions = content.trim();
    }

    return memory;
  }

  /**
   * Extraire les sections du markdown
   */
  private extractSections(content: string): ParsedSection[] {
    const sections: ParsedSection[] = [];
    const lines = content.split('\n');

    let currentSection: ParsedSection | null = null;
    let contentLines: string[] = [];

    for (const line of lines) {
      // Détecter les titres markdown (# ## ###)
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headerMatch) {
        // Sauvegarder la section précédente
        if (currentSection) {
          currentSection.content = contentLines.join('\n').trim();
          sections.push(currentSection);
        }

        // Nouvelle section
        currentSection = {
          title: headerMatch[2],
          content: '',
          level: headerMatch[1].length,
        };
        contentLines = [];
      } else {
        contentLines.push(line);
      }
    }

    // Sauvegarder la dernière section
    if (currentSection) {
      currentSection.content = contentLines.join('\n').trim();
      sections.push(currentSection);
    } else if (contentLines.length > 0) {
      // Pas de sections, contenu brut
      sections.push({
        title: '',
        content: contentLines.join('\n').trim(),
        level: 0,
      });
    }

    return sections;
  }

  /**
   * Assigner une section à la propriété correspondante
   */
  private assignSection(memory: ProjectMemory, key: keyof ProjectMemory, content: string): void {
    switch (key) {
      case 'instructions':
      case 'context':
        (memory as Record<string, unknown>)[key] = content;
        break;

      case 'constraints':
      case 'patterns':
      case 'ignore':
        (memory as Record<string, unknown>)[key] = this.parseList(content);
        break;

      case 'codeStyle':
        memory.codeStyle = this.parseCodeStyle(content);
        break;
    }
  }

  /**
   * Parser une liste depuis le contenu
   */
  private parseList(content: string): string[] {
    const items: string[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      // Liste à puces (-, *, +)
      const bulletMatch = line.match(/^[\s]*[-*+]\s+(.+)$/);
      if (bulletMatch) {
        items.push(bulletMatch[1].trim());
        continue;
      }

      // Liste numérotée
      const numberedMatch = line.match(/^[\s]*\d+[.)]\s+(.+)$/);
      if (numberedMatch) {
        items.push(numberedMatch[1].trim());
        continue;
      }

      // Ligne non vide sans préfixe
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        items.push(trimmed);
      }
    }

    return items;
  }

  /**
   * Parser les préférences de style de code
   */
  private parseCodeStyle(content: string): ProjectMemory['codeStyle'] {
    const style: ProjectMemory['codeStyle'] = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const lower = line.toLowerCase();

      // Indentation
      if (lower.includes('tab')) {
        style.indentation = 'tabs';
      } else if (lower.includes('space') || lower.includes('espace')) {
        style.indentation = 'spaces';

        // Essayer d'extraire la taille
        const sizeMatch = lower.match(/(\d+)\s*(spaces?|espaces?)/);
        if (sizeMatch) {
          style.indentSize = parseInt(sizeMatch[1], 10);
        }
      }

      // Quotes
      if (lower.includes('single') || lower.includes('simple')) {
        style.quotes = 'single';
      } else if (lower.includes('double')) {
        style.quotes = 'double';
      }

      // Semicolons
      if (lower.includes('semicolon') || lower.includes('point-virgule')) {
        if (lower.includes('no') || lower.includes('pas') || lower.includes('sans')) {
          style.semicolons = false;
        } else {
          style.semicolons = true;
        }
      }
    }

    return style;
  }

  /**
   * Parser une section custom
   */
  private parseCustomSection(content: string): Record<string, unknown> {
    // Essayer de parser comme JSON
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }

      // Essayer le contenu direct comme JSON
      if (content.trim().startsWith('{')) {
        return JSON.parse(content.trim());
      }
    } catch {
      // Pas du JSON valide, parser comme key-value
    }

    // Parser comme key-value
    const result: Record<string, unknown> = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const kvMatch = line.match(/^[\s]*[-*]?\s*([^:]+):\s*(.+)$/);
      if (kvMatch) {
        const key = kvMatch[1].trim().toLowerCase().replace(/\s+/g, '_');
        let value: unknown = kvMatch[2].trim();

        // Convertir les booléens
        if (value === 'true' || value === 'oui' || value === 'yes') {
          value = true;
        } else if (value === 'false' || value === 'non' || value === 'no') {
          value = false;
        } else if (!isNaN(Number(value))) {
          value = Number(value);
        }

        result[key] = value;
      }
    }

    return result;
  }
}

/*
 * ============================================================================
 * CHARGEUR
 * ============================================================================
 */

/**
 * Chargeur de mémoire projet
 */
export class ProjectMemoryLoader {
  private options: Required<ProjectMemoryOptions>;
  private parser: ProjectMemoryParser;
  private cache: Map<string, ProjectMemory> = new Map();

  constructor(options: ProjectMemoryOptions = {}) {
    this.options = {
      projectRoot: options.projectRoot || '',
      fileNames: options.fileNames || DEFAULT_MEMORY_FILES,
      customParser: options.customParser || ((content) => new ProjectMemoryParser().parse(content)),
      fileReader: options.fileReader || this.defaultFileReader.bind(this),
    };
    this.parser = new ProjectMemoryParser();
  }

  /**
   * Lecteur de fichier par défaut (Node.js)
   */
  private async defaultFileReader(path: string): Promise<string | null> {
    // En environnement navigateur, retourner null
    // Le vrai lecteur sera fourni via fileReader option
    if (typeof window !== 'undefined') {
      console.warn('[ProjectMemory] No file reader configured for browser environment');
      return null;
    }

    try {
      // Dynamic import pour Node.js
      const fs = await import('fs/promises');
      return await fs.readFile(path, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Charger la mémoire projet
   */
  async load(): Promise<ProjectMemoryLoadResult> {
    const result: ProjectMemoryLoadResult = {
      memory: null,
      source: null,
      errors: [],
      searchedPaths: [],
    };

    const root = this.options.projectRoot;

    for (const fileName of this.options.fileNames) {
      const path = root ? `${root}/${fileName}` : fileName;
      result.searchedPaths.push(path);

      try {
        const content = await this.options.fileReader(path);

        if (content !== null) {
          const memory = this.options.customParser(content);

          result.memory = {
            ...memory,
            source: path,
            loadedAt: new Date(),
          };
          result.source = path;

          // Mettre en cache
          this.cache.set(path, result.memory);

          return result;
        }
      } catch (error) {
        result.errors.push(`Error reading ${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return result;
  }

  /**
   * Charger depuis un contenu fourni
   */
  loadFromContent(content: string, source: string = 'provided'): ProjectMemory {
    const memory = this.parser.parse(content);
    return {
      ...memory,
      source,
      loadedAt: new Date(),
    };
  }

  /**
   * Obtenir depuis le cache
   */
  getFromCache(path: string): ProjectMemory | undefined {
    return this.cache.get(path);
  }

  /**
   * Vider le cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Formater la mémoire projet pour inclusion dans le prompt
   */
  formatForPrompt(memory: ProjectMemory): string {
    const parts: string[] = ['<project-memory>'];

    if (memory.source) {
      parts.push(`Source: ${memory.source}`);
    }

    if (memory.context) {
      parts.push('\n## Context');
      parts.push(memory.context);
    }

    if (memory.instructions) {
      parts.push('\n## Instructions');
      parts.push(memory.instructions);
    }

    if (memory.constraints && memory.constraints.length > 0) {
      parts.push('\n## Constraints');
      for (const constraint of memory.constraints) {
        parts.push(`- ${constraint}`);
      }
    }

    if (memory.patterns && memory.patterns.length > 0) {
      parts.push('\n## Patterns to Follow');
      for (const pattern of memory.patterns) {
        parts.push(`- ${pattern}`);
      }
    }

    if (memory.codeStyle) {
      parts.push('\n## Code Style');
      if (memory.codeStyle.indentation) {
        parts.push(
          `- Indentation: ${memory.codeStyle.indentation}${memory.codeStyle.indentSize ? ` (${memory.codeStyle.indentSize})` : ''}`,
        );
      }
      if (memory.codeStyle.quotes) {
        parts.push(`- Quotes: ${memory.codeStyle.quotes}`);
      }
      if (memory.codeStyle.semicolons !== undefined) {
        parts.push(`- Semicolons: ${memory.codeStyle.semicolons ? 'yes' : 'no'}`);
      }
    }

    if (memory.ignore && memory.ignore.length > 0) {
      parts.push('\n## Ignore');
      for (const item of memory.ignore) {
        parts.push(`- ${item}`);
      }
    }

    if (memory.custom && Object.keys(memory.custom).length > 0) {
      parts.push('\n## Custom Settings');
      parts.push('```json');
      parts.push(JSON.stringify(memory.custom, null, 2));
      parts.push('```');
    }

    parts.push('\n</project-memory>');

    return parts.join('\n');
  }
}

/*
 * ============================================================================
 * FONCTIONS UTILITAIRES
 * ============================================================================
 */

/**
 * Instance par défaut du loader
 */
let defaultLoader: ProjectMemoryLoader | null = null;

/**
 * Obtenir le loader par défaut
 */
export function getProjectMemoryLoader(): ProjectMemoryLoader {
  if (!defaultLoader) {
    defaultLoader = new ProjectMemoryLoader();
  }
  return defaultLoader;
}

/**
 * Créer un nouveau loader
 */
export function createProjectMemoryLoader(options?: ProjectMemoryOptions): ProjectMemoryLoader {
  return new ProjectMemoryLoader(options);
}

/**
 * Réinitialiser le loader par défaut
 */
export function resetProjectMemoryLoader(): void {
  defaultLoader = null;
}

/**
 * Charger la mémoire projet (raccourci)
 */
export async function loadProjectMemory(
  projectRoot?: string,
  fileReader?: (path: string) => Promise<string | null>,
): Promise<ProjectMemory | null> {
  const loader = new ProjectMemoryLoader({ projectRoot, fileReader });
  const result = await loader.load();
  return result.memory;
}

/**
 * Parser du contenu de mémoire projet (raccourci)
 */
export function parseProjectMemory(content: string): ProjectMemory {
  const parser = new ProjectMemoryParser();
  return parser.parse(content);
}
