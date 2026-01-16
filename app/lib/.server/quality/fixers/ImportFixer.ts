/**
 * ImportFixer - Correction automatique des imports
 *
 * Détecte et corrige:
 * - Imports manquants pour React hooks
 * - Imports manquants pour composants shadcn/ui
 * - Imports manquants pour Lucide icons
 * - Imports mal formatés
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
 * Définitions des imports shadcn/ui
 */
const SHADCN_IMPORTS: ImportDefinition[] = [
  {
    pattern: /<Button\b/,
    importStatement: "import { Button } from '@/components/ui/button';",
    source: '@/components/ui/button',
    names: ['Button'],
  },
  {
    pattern: /<Card\b|<CardHeader\b|<CardContent\b|<CardFooter\b|<CardTitle\b|<CardDescription\b/,
    importStatement:
      "import { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription } from '@/components/ui/card';",
    source: '@/components/ui/card',
    names: ['Card', 'CardHeader', 'CardContent', 'CardFooter', 'CardTitle', 'CardDescription'],
  },
  {
    pattern: /<Input\b/,
    importStatement: "import { Input } from '@/components/ui/input';",
    source: '@/components/ui/input',
    names: ['Input'],
  },
  {
    pattern: /<Label\b/,
    importStatement: "import { Label } from '@/components/ui/label';",
    source: '@/components/ui/label',
    names: ['Label'],
  },
  {
    pattern: /<Dialog\b|<DialogTrigger\b|<DialogContent\b|<DialogHeader\b|<DialogTitle\b/,
    importStatement:
      "import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';",
    source: '@/components/ui/dialog',
    names: ['Dialog', 'DialogTrigger', 'DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription'],
  },
  {
    pattern: /<Select\b|<SelectTrigger\b|<SelectContent\b|<SelectItem\b|<SelectValue\b/,
    importStatement:
      "import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';",
    source: '@/components/ui/select',
    names: ['Select', 'SelectTrigger', 'SelectContent', 'SelectItem', 'SelectValue'],
  },
  {
    pattern: /<Tabs\b|<TabsList\b|<TabsTrigger\b|<TabsContent\b/,
    importStatement: "import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';",
    source: '@/components/ui/tabs',
    names: ['Tabs', 'TabsList', 'TabsTrigger', 'TabsContent'],
  },
  {
    pattern: /<Form\b|<FormField\b|<FormItem\b|<FormLabel\b|<FormControl\b|<FormMessage\b/,
    importStatement:
      "import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';",
    source: '@/components/ui/form',
    names: ['Form', 'FormField', 'FormItem', 'FormLabel', 'FormControl', 'FormMessage'],
  },
  {
    pattern: /<Avatar\b|<AvatarImage\b|<AvatarFallback\b/,
    importStatement: "import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';",
    source: '@/components/ui/avatar',
    names: ['Avatar', 'AvatarImage', 'AvatarFallback'],
  },
  {
    pattern: /<Switch\b/,
    importStatement: "import { Switch } from '@/components/ui/switch';",
    source: '@/components/ui/switch',
    names: ['Switch'],
  },
  {
    pattern: /<Checkbox\b/,
    importStatement: "import { Checkbox } from '@/components/ui/checkbox';",
    source: '@/components/ui/checkbox',
    names: ['Checkbox'],
  },
  {
    pattern: /<Textarea\b/,
    importStatement: "import { Textarea } from '@/components/ui/textarea';",
    source: '@/components/ui/textarea',
    names: ['Textarea'],
  },
  {
    pattern: /<Badge\b/,
    importStatement: "import { Badge } from '@/components/ui/badge';",
    source: '@/components/ui/badge',
    names: ['Badge'],
  },
  {
    pattern: /<Separator\b/,
    importStatement: "import { Separator } from '@/components/ui/separator';",
    source: '@/components/ui/separator',
    names: ['Separator'],
  },
  {
    pattern: /<ScrollArea\b/,
    importStatement: "import { ScrollArea } from '@/components/ui/scroll-area';",
    source: '@/components/ui/scroll-area',
    names: ['ScrollArea'],
  },
  {
    pattern: /<Skeleton\b/,
    importStatement: "import { Skeleton } from '@/components/ui/skeleton';",
    source: '@/components/ui/skeleton',
    names: ['Skeleton'],
  },
  {
    pattern: /<Toast\b|useToast\b/,
    importStatement: "import { useToast } from '@/components/ui/use-toast';",
    source: '@/components/ui/use-toast',
    names: ['useToast'],
  },
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
  readonly description = 'Ajoute les imports manquants pour React, shadcn/ui et Lucide';
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

    // Vérifier les composants shadcn/ui
    for (const def of SHADCN_IMPORTS) {
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
