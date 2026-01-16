/**
 * AutoFixProcessor - Correcteur automatique de code en streaming
 *
 * Ce processeur analyse le code généré par le LLM en temps réel et
 * applique des corrections automatiques pour les erreurs communes.
 *
 * Workflow:
 * 1. Recevoir le stream de tokens du LLM
 * 2. Détecter les blocs de code complets
 * 3. Appliquer les règles de correction
 * 4. Émettre le code corrigé
 */

import type {
  FixRule,
  FixContext,
  FixResult,
  AutoFixOptions,
  AutoFixStats,
  CodeBlock,
  ParsedStream,
  CodeLanguage,
  AppliedFix,
  FixProgress,
  FixCategory,
} from './autofix-types';
import { DEFAULT_TIMEOUTS, FIX_CATEGORY_WEIGHTS } from './autofix-types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('AutoFixProcessor');

/*
 * =============================================================================
 * AutoFixProcessor
 * =============================================================================
 */

/**
 * Processeur AutoFix pour le streaming de code
 */
export class AutoFixProcessor {
  private rules: FixRule[] = [];
  private options: Required<AutoFixOptions>;
  private stats: AutoFixStats;
  private processedFiles: Map<string, string> = new Map();

  constructor(rules: FixRule[] = [], options: AutoFixOptions = {}) {
    this.rules = rules;
    this.options = {
      enabledRules: options.enabledRules ?? [],
      disabledRules: options.disabledRules ?? [],
      enabledCategories: options.enabledCategories ?? ['imports', 'typescript', 'accessibility', 'security', 'react'],
      strictMode: options.strictMode ?? false,
      maxFixesPerBlock: options.maxFixesPerBlock ?? 50,
      fixTimeout: options.fixTimeout ?? DEFAULT_TIMEOUTS.perRule,
      onProgress: options.onProgress ?? (() => {}),
      onFix: options.onFix ?? (() => {}),
    };
    this.stats = this.createEmptyStats();
    logger.debug('AutoFixProcessor initialized', { ruleCount: rules.length });
  }

  /**
   * Ajoute une règle de correction
   */
  addRule(rule: FixRule): void {
    this.rules.push(rule);
    logger.debug('Rule added', { ruleId: rule.id });
  }

  /**
   * Traite un stream de code en appliquant les corrections
   */
  async *processStream(inputStream: AsyncIterable<string>): AsyncGenerator<string, void, unknown> {
    let buffer = '';
    const startTime = Date.now();

    logger.info('Starting stream processing');

    for await (const chunk of inputStream) {
      buffer += chunk;

      // Parser le buffer pour extraire les blocs complets
      const parsed = this.parseBuffer(buffer);

      // Traiter les parties de texte (non-code) immédiatement
      for (const textPart of parsed.textParts) {
        yield textPart.content;
      }

      // Traiter les blocs de code complets
      for (const block of parsed.codeBlocks) {
        const fixedBlock = await this.processCodeBlock(block);
        yield this.reconstructBlock(block, fixedBlock);
        this.stats.blocksProcessed++;
      }

      // Garder le contenu restant dans le buffer
      buffer = parsed.remaining;

      // Mettre à jour la progression
      this.options.onProgress({
        phase: 'fixing',
        rulesChecked: this.rules.length * this.stats.blocksProcessed,
        fixesApplied: this.getTotalFixes(),
        elapsed: Date.now() - startTime,
      });
    }

    // Traiter le reste du buffer à la fin
    if (buffer.length > 0) {
      yield buffer;
    }

    this.stats.totalProcessingTime = Date.now() - startTime;
    this.stats.averageTimePerBlock =
      this.stats.blocksProcessed > 0 ? this.stats.totalProcessingTime / this.stats.blocksProcessed : 0;

    this.options.onProgress({
      phase: 'complete',
      rulesChecked: this.rules.length * this.stats.blocksProcessed,
      fixesApplied: this.getTotalFixes(),
      elapsed: this.stats.totalProcessingTime,
    });

    logger.info('Stream processing complete', {
      blocksProcessed: this.stats.blocksProcessed,
      totalFixes: this.getTotalFixes(),
      duration: this.stats.totalProcessingTime,
    });
  }

  /**
   * Traite un bloc de code unique (sans streaming)
   */
  async processCode(code: string, context?: Partial<FixContext>): Promise<FixResult> {
    const fullContext: FixContext = {
      language: this.detectLanguage(code, context?.filePath),
      processedFiles: this.processedFiles,
      ...context,
    };

    return this.applyFixes(code, fullContext);
  }

  /**
   * Retourne les statistiques de traitement
   */
  getStats(): AutoFixStats {
    return { ...this.stats };
  }

  /**
   * Réinitialise les statistiques
   */
  resetStats(): void {
    this.stats = this.createEmptyStats();
    this.processedFiles.clear();
  }

  /*
   * ===========================================================================
   * Private Methods - Parsing
   * ===========================================================================
   */

  /**
   * Parse le buffer pour extraire les blocs de code complets
   */
  private parseBuffer(buffer: string): ParsedStream {
    const codeBlocks: CodeBlock[] = [];
    const textParts: ParsedStream['textParts'] = [];
    let lastIndex = 0;

    // Regex pour détecter les blocs de code Markdown
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(buffer)) !== null) {
      // Ajouter le texte avant le bloc de code
      if (match.index > lastIndex) {
        textParts.push({
          content: buffer.slice(lastIndex, match.index),
          startIndex: lastIndex,
          endIndex: match.index,
        });
      }

      // Extraire le bloc de code
      const language = (match[1] || 'unknown') as CodeLanguage;
      const content = match[2];

      codeBlocks.push({
        content,
        language: this.normalizeLanguage(language),
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        markers: {
          start: '```' + (match[1] || ''),
          end: '```',
        },
      });

      lastIndex = match.index + match[0].length;
    }

    // Le reste est du contenu incomplet
    const remaining = buffer.slice(lastIndex);

    // Vérifier si le remaining contient un bloc de code incomplet
    const incompleteBlockStart = remaining.lastIndexOf('```');

    if (incompleteBlockStart !== -1) {
      // Il y a un bloc incomplet - tout garder dans remaining
      if (lastIndex < buffer.length - remaining.length + incompleteBlockStart) {
        textParts.push({
          content: remaining.slice(0, incompleteBlockStart),
          startIndex: lastIndex,
          endIndex: lastIndex + incompleteBlockStart,
        });
      }

      return {
        codeBlocks,
        textParts,
        remaining: remaining.slice(incompleteBlockStart),
      };
    }

    // Pas de bloc incomplet - ajouter le texte restant aux textParts
    if (remaining.length > 0) {
      textParts.push({
        content: remaining,
        startIndex: lastIndex,
        endIndex: buffer.length,
      });
    }

    return { codeBlocks, textParts, remaining: '' };
  }

  /**
   * Normalise le nom du langage
   */
  private normalizeLanguage(lang: string): CodeLanguage {
    const normalized = lang.toLowerCase();
    const mapping: Record<string, CodeLanguage> = {
      ts: 'typescript',
      typescript: 'typescript',
      tsx: 'tsx',
      js: 'javascript',
      javascript: 'javascript',
      jsx: 'jsx',
      css: 'css',
      html: 'html',
      json: 'json',
    };

    return mapping[normalized] || 'unknown';
  }

  /**
   * Détecte le langage à partir du code ou du chemin
   */
  private detectLanguage(code: string, filePath?: string): CodeLanguage {
    if (filePath) {
      const ext = filePath.split('.').pop()?.toLowerCase();
      const extMapping: Record<string, CodeLanguage> = {
        ts: 'typescript',
        tsx: 'tsx',
        js: 'javascript',
        jsx: 'jsx',
        css: 'css',
        html: 'html',
        json: 'json',
      };

      if (ext && ext in extMapping) {
        return extMapping[ext];
      }
    }

    // Détection par contenu
    if (code.includes('interface ') || code.includes(': string')) {
      return code.includes('React') || code.includes('jsx') ? 'tsx' : 'typescript';
    }

    if (code.includes('import React') || code.includes('useState')) {
      return 'jsx';
    }

    return 'unknown';
  }

  /*
   * ===========================================================================
   * Private Methods - Fixing
   * ===========================================================================
   */

  /**
   * Traite un bloc de code
   */
  private async processCodeBlock(block: CodeBlock): Promise<string> {
    const context: FixContext = {
      filePath: block.filePath,
      language: block.language,
      processedFiles: this.processedFiles,
    };

    const result = await this.applyFixes(block.content, context);

    // Stocker le fichier traité
    if (block.filePath) {
      this.processedFiles.set(block.filePath, result.code);
    }

    return result.code;
  }

  /**
   * Applique toutes les règles de correction au code
   */
  private async applyFixes(code: string, context: FixContext): Promise<FixResult> {
    let currentCode = code;
    const allFixes: AppliedFix[] = [];
    const allUnresolved: FixResult['unresolved'] = [];
    const allWarnings: string[] = [];
    let fixCount = 0;

    // Filtrer les règles actives
    const activeRules = this.getActiveRules();

    // Trier les règles par priorité (sécurité en premier)
    const sortedRules = this.sortRulesByPriority(activeRules);

    for (const rule of sortedRules) {
      if (fixCount >= this.options.maxFixesPerBlock) {
        allWarnings.push(`Maximum de ${this.options.maxFixesPerBlock} corrections atteint pour ce bloc`);
        break;
      }

      try {
        if (rule.canFix(currentCode, context)) {
          const result = await this.applyRuleWithTimeout(rule, currentCode, context);

          if (result.applied) {
            currentCode = result.code;
            allFixes.push(...result.fixes);
            fixCount += result.fixes.length;

            // Mettre à jour les stats
            this.updateStats(rule.category, result.fixes.length);

            // Callback pour chaque correction
            for (const fix of result.fixes) {
              this.options.onFix(fix);
            }
          }

          allUnresolved.push(...result.unresolved);
          allWarnings.push(...result.warnings);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
        allWarnings.push(`Règle ${rule.id}: ${errorMessage}`);
        logger.warn('Rule execution failed', { ruleId: rule.id, error: errorMessage });
      }
    }

    return {
      applied: allFixes.length > 0,
      code: currentCode,
      fixes: allFixes,
      unresolved: allUnresolved,
      warnings: allWarnings,
    };
  }

  /**
   * Applique une règle avec timeout
   */
  private async applyRuleWithTimeout(rule: FixRule, code: string, context: FixContext): Promise<FixResult> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout après ${this.options.fixTimeout}ms`));
      }, this.options.fixTimeout);

      rule
        .fix(code, context)
        .then((result) => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Retourne les règles actives selon la configuration
   */
  private getActiveRules(): FixRule[] {
    return this.rules.filter((rule) => {
      // Vérifier si la catégorie est activée
      if (!this.options.enabledCategories.includes(rule.category)) {
        return false;
      }

      // Vérifier si la règle est explicitement désactivée
      if (this.options.disabledRules.includes(rule.id)) {
        return false;
      }

      // Si enabledRules est défini, seules ces règles sont actives
      if (this.options.enabledRules.length > 0 && !this.options.enabledRules.includes(rule.id)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Trie les règles par priorité
   */
  private sortRulesByPriority(rules: FixRule[]): FixRule[] {
    return [...rules].sort((a, b) => {
      const weightA = FIX_CATEGORY_WEIGHTS[a.category] ?? 0;
      const weightB = FIX_CATEGORY_WEIGHTS[b.category] ?? 0;

      return weightB - weightA; // Plus haute priorité en premier
    });
  }

  /*
   * ===========================================================================
   * Private Methods - Helpers
   * ===========================================================================
   */

  /**
   * Reconstruit un bloc de code avec les marqueurs
   */
  private reconstructBlock(original: CodeBlock, fixedContent: string): string {
    return `${original.markers.start}\n${fixedContent}${original.markers.end}`;
  }

  /**
   * Crée des statistiques vides
   */
  private createEmptyStats(): AutoFixStats {
    return {
      blocksProcessed: 0,
      fixesByCategory: {
        imports: 0,
        typescript: 0,
        accessibility: 0,
        security: 0,
        style: 0,
        react: 0,
        performance: 0,
      },
      topRules: [],
      unresolvedByCategory: {
        imports: 0,
        typescript: 0,
        accessibility: 0,
        security: 0,
        style: 0,
        react: 0,
        performance: 0,
      },
      totalProcessingTime: 0,
      averageTimePerBlock: 0,
    };
  }

  /**
   * Met à jour les statistiques
   */
  private updateStats(category: FixCategory, count: number): void {
    this.stats.fixesByCategory[category] = (this.stats.fixesByCategory[category] || 0) + count;
  }

  /**
   * Retourne le nombre total de corrections
   */
  private getTotalFixes(): number {
    return Object.values(this.stats.fixesByCategory).reduce((a, b) => a + b, 0);
  }
}

/*
 * =============================================================================
 * Factory Function
 * =============================================================================
 */

/**
 * Crée un processeur AutoFix avec les règles par défaut
 */
export function createAutoFixProcessor(options?: AutoFixOptions): AutoFixProcessor {
  // Les règles seront ajoutées via les fixers individuels
  return new AutoFixProcessor([], options);
}
