/**
 * ImportFixer - Correction automatique des imports
 *
 * Détecte et corrige:
 * - Imports manquants pour React hooks
 * - Imports manquants pour Lucide icons
 * - Imports mal formatés
 *
 * NOTE: BAVINI utilise HTML natif + Tailwind CSS (pas de bibliothèques UI externes)
 */

import type { FixRule, FixContext, FixResult, AppliedFix } from '../autofix-types';

/*
 * =============================================================================
 * Types
 * =============================================================================
 */

interface ImportDefinition {
  /** Pattern regex pour détecter l'utilisation */
  pattern: RegExp;

  /** Statement d'import à ajouter */
  importStatement: string;

  /** Source du package */
  source: string;

  /** Noms des exports */
  names: string[];
}

/*
 * =============================================================================
 * Import Definitions
 * =============================================================================
 */

/**
 * Définitions des imports React
 */
const REACT_IMPORTS: ImportDefinition[] = [
  {
    pattern: /\buseState\b/,
    importStatement: "import { useState } from 'react';",
    source: 'react',
    names: ['useState'],
  },
  {
    pattern: /\buseEffect\b/,
    importStatement: "import { useEffect } from 'react';",
    source: 'react',
    names: ['useEffect'],
  },
  {
    pattern: /\buseCallback\b/,
    importStatement: "import { useCallback } from 'react';",
    source: 'react',
    names: ['useCallback'],
  },
  {
    pattern: /\buseMemo\b/,
    importStatement: "import { useMemo } from 'react';",
    source: 'react',
    names: ['useMemo'],
  },
  {
    pattern: /\buseRef\b/,
    importStatement: "import { useRef } from 'react';",
    source: 'react',
    names: ['useRef'],
  },
  {
    pattern: /\buseContext\b/,
    importStatement: "import { useContext } from 'react';",
    source: 'react',
    names: ['useContext'],
  },
  {
    pattern: /\buseReducer\b/,
    importStatement: "import { useReducer } from 'react';",
    source: 'react',
    names: ['useReducer'],
  },
  {
    pattern: /\bReact\.Fragment\b|<Fragment>|<>[\s\S]*<\/>/,
    importStatement: "import { Fragment } from 'react';",
    source: 'react',
    names: ['Fragment'],
  },
];

/**
 * Définitions des imports UI externes (désactivé)
 * NOTE: Shadcn/Radix UI ne sont PAS supportés - utiliser HTML natif + Tailwind CSS
 * BAVINI utilise son propre Design System sans dépendances UI externes
 */
const EXTERNAL_UI_IMPORTS: ImportDefinition[] = [
  // BAVINI Design System: HTML natif + Tailwind CSS uniquement
  // Pas de Shadcn, Radix, Headless UI, etc.
];

/**
 * Icônes Lucide communes
 */
const LUCIDE_ICONS = [
  'Plus',
  'Minus',
  'X',
  'Check',
  'ChevronDown',
  'ChevronUp',
  'ChevronLeft',
  'ChevronRight',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Search',
  'Menu',
  'Home',
  'User',
  'Settings',
  'Mail',
  'Phone',
  'Calendar',
  'Clock',
  'Edit',
  'Trash',
  'Trash2',
  'Copy',
  'Download',
  'Upload',
  'Eye',
  'EyeOff',
  'Lock',
  'Unlock',
  'Star',
  'Heart',
  'Share',
  'Send',
  'Save',
  'Loader',
  'Loader2',
  'AlertCircle',
  'AlertTriangle',
  'Info',
  'HelpCircle',
  'ExternalLink',
  'Link',
  'Image',
  'File',
  'Folder',
  'Filter',
  'SortAsc',
  'SortDesc',
  'MoreHorizontal',
  'MoreVertical',
  'LogIn',
  'LogOut',
  'Sun',
  'Moon',
  'Github',
  'Twitter',
  'Linkedin',
];

/*
 * =============================================================================
 * ImportFixer
 * =============================================================================
 */

/**
 * Règle de correction des imports
 */
export class ImportFixer implements FixRule {
  readonly id = 'import-fixer';
  readonly name = 'Import Fixer';
  readonly description = 'Ajoute les imports manquants pour React et Lucide';
  readonly category = 'imports' as const;
  readonly severity = 'warning' as const;

  /**
   * Vérifie si le code a des imports manquants
   */
  canFix(code: string, context?: FixContext): boolean {
    // Ne traiter que les fichiers TypeScript/JavaScript/React
    const validLanguages = ['typescript', 'javascript', 'tsx', 'jsx'];

    if (context?.language && !validLanguages.includes(context.language)) {
      return false;
    }

    // Vérifier s'il y a des utilisations sans imports
    const missingImports = this.detectMissingImports(code);

    return missingImports.length > 0;
  }

  /**
   * Corrige les imports manquants
   */
  async fix(code: string, context?: FixContext): Promise<FixResult> {
    const fixes: AppliedFix[] = [];
    const warnings: string[] = [];
    let fixedCode = code;

    // Détecter les imports manquants
    const missingImports = this.detectMissingImports(code);

    if (missingImports.length === 0) {
      return {
        applied: false,
        code,
        fixes: [],
        unresolved: [],
        warnings: [],
      };
    }

    // Grouper les imports par source
    const groupedImports = this.groupImportsBySource(missingImports);

    // Générer les statements d'import
    const importStatements = this.generateImportStatements(groupedImports);

    // Trouver le bon endroit pour insérer les imports
    const insertPosition = this.findImportInsertPosition(code);

    // Insérer les imports
    fixedCode =
      code.slice(0, insertPosition) + importStatements + (insertPosition > 0 ? '\n' : '') + code.slice(insertPosition);

    // Créer les informations de correction
    for (const [source, names] of Object.entries(groupedImports)) {
      fixes.push({
        ruleId: this.id,
        description: `Ajout de l'import pour ${names.join(', ')} depuis '${source}'`,
        after: this.generateSingleImport(source, names),
      });
    }

    return {
      applied: true,
      code: fixedCode,
      fixes,
      unresolved: [],
      warnings,
    };
  }

  /*
   * ===========================================================================
   * Private Methods
   * ===========================================================================
   */

  /**
   * Détecte les imports manquants dans le code
   */
  private detectMissingImports(code: string): Array<{ source: string; names: string[] }> {
    const missing: Array<{ source: string; names: string[] }> = [];
    const existingImports = this.extractExistingImports(code);

    // Vérifier les hooks React
    for (const def of REACT_IMPORTS) {
      if (def.pattern.test(code)) {
        const missingNames = def.names.filter((name) => !this.isImported(name, 'react', existingImports));

        if (missingNames.length > 0) {
          missing.push({ source: def.source, names: missingNames });
        }
      }
    }

    // Vérifier les composants UI externes (désactivé - BAVINI utilise HTML natif)
    for (const def of EXTERNAL_UI_IMPORTS) {
      if (def.pattern.test(code)) {
        const missingNames = def.names.filter(
          (name) => this.isUsedInCode(code, name) && !this.isImported(name, def.source, existingImports),
        );

        if (missingNames.length > 0) {
          missing.push({ source: def.source, names: missingNames });
        }
      }
    }

    // Vérifier les icônes Lucide
    const lucideMissing = this.detectMissingLucideIcons(code, existingImports);

    if (lucideMissing.length > 0) {
      missing.push({ source: 'lucide-react', names: lucideMissing });
    }

    return missing;
  }

  /**
   * Vérifie si un composant/hook est utilisé dans le code
   */
  private isUsedInCode(code: string, name: string): boolean {
    // Vérifier l'utilisation en JSX (<Name ...) ou en appel de fonction (name(...))
    const jsxPattern = new RegExp(`<${name}\\b`);
    const callPattern = new RegExp(`\\b${name}\\s*\\(`);

    return jsxPattern.test(code) || callPattern.test(code);
  }

  /**
   * Détecte les icônes Lucide manquantes
   */
  private detectMissingLucideIcons(code: string, existingImports: Map<string, Set<string>>): string[] {
    const missing: string[] = [];

    for (const icon of LUCIDE_ICONS) {
      // Vérifier si l'icône est utilisée
      const pattern = new RegExp(`<${icon}\\b`);

      if (pattern.test(code)) {
        if (!this.isImported(icon, 'lucide-react', existingImports)) {
          missing.push(icon);
        }
      }
    }

    return missing;
  }

  /**
   * Extrait les imports existants du code
   */
  private extractExistingImports(code: string): Map<string, Set<string>> {
    const imports = new Map<string, Set<string>>();

    // Regex pour les imports
    const importRegex = /import\s+(?:(?:\*\s+as\s+(\w+))|(?:\{([^}]+)\})|(\w+))\s+from\s+['"]([^'"]+)['"]/g;

    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(code)) !== null) {
      const source = match[4];
      const names = new Set<string>();

      if (match[1]) {
        // import * as name
        names.add(match[1]);
      } else if (match[2]) {
        // import { a, b, c }
        const namedImports = match[2].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]);

        for (const name of namedImports) {
          if (name) {
            names.add(name);
          }
        }
      } else if (match[3]) {
        // import default
        names.add(match[3]);
      }

      if (imports.has(source)) {
        for (const name of names) {
          imports.get(source)!.add(name);
        }
      } else {
        imports.set(source, names);
      }
    }

    return imports;
  }

  /**
   * Vérifie si un nom est déjà importé
   */
  private isImported(name: string, source: string, existingImports: Map<string, Set<string>>): boolean {
    const sourceImports = existingImports.get(source);
    return sourceImports?.has(name) ?? false;
  }

  /**
   * Groupe les imports par source
   */
  private groupImportsBySource(imports: Array<{ source: string; names: string[] }>): Record<string, string[]> {
    const grouped: Record<string, string[]> = {};

    for (const { source, names } of imports) {
      if (!grouped[source]) {
        grouped[source] = [];
      }

      for (const name of names) {
        if (!grouped[source].includes(name)) {
          grouped[source].push(name);
        }
      }
    }

    return grouped;
  }

  /**
   * Génère les statements d'import
   */
  private generateImportStatements(grouped: Record<string, string[]>): string {
    const statements: string[] = [];

    // Ordre: react, puis packages externes, puis local
    const sources = Object.keys(grouped).sort((a, b) => {
      if (a === 'react') {
        return -1;
      }

      if (b === 'react') {
        return 1;
      }

      if (a.startsWith('@/') && !b.startsWith('@/')) {
        return 1;
      }

      if (!a.startsWith('@/') && b.startsWith('@/')) {
        return -1;
      }

      return a.localeCompare(b);
    });

    for (const source of sources) {
      statements.push(this.generateSingleImport(source, grouped[source]));
    }

    return statements.join('\n') + '\n';
  }

  /**
   * Génère un statement d'import unique
   */
  private generateSingleImport(source: string, names: string[]): string {
    const sortedNames = [...names].sort();
    return `import { ${sortedNames.join(', ')} } from '${source}';`;
  }

  /**
   * Trouve la position pour insérer les imports
   */
  private findImportInsertPosition(code: string): number {
    // Chercher la fin du dernier import existant
    const importRegex = /^import\s+.*?['"][^'"]+['"];?\s*$/gm;
    let lastImportEnd = 0;
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(code)) !== null) {
      lastImportEnd = match.index + match[0].length;
    }

    if (lastImportEnd > 0) {
      // Trouver la fin de la ligne
      const nextNewline = code.indexOf('\n', lastImportEnd);
      return nextNewline !== -1 ? nextNewline + 1 : lastImportEnd;
    }

    // Pas d'imports existants - insérer au début (après les commentaires)
    const firstCodeLine = code.search(/^(?!\s*(?:\/\/|\/\*|\*)).*\S/m);

    return firstCodeLine !== -1 ? firstCodeLine : 0;
  }
}

/*
 * =============================================================================
 * Export
 * =============================================================================
 */

export function createImportFixer(): ImportFixer {
  return new ImportFixer();
}
