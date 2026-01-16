/**
 * Console Reporter - Formatage des résultats pour la console
 */

import type { AnalysisResult, AnalysisSummary, ASTIssue, Reporter, ReporterOptions, Severity } from '../types';

/*
 * ============================================================================
 * COLORS
 * ============================================================================
 */

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

const severityColors: Record<Severity, string> = {
  error: colors.red,
  warning: colors.yellow,
  info: colors.blue,
  hint: colors.dim,
};

const severityIcons: Record<Severity, string> = {
  error: '✖',
  warning: '⚠',
  info: 'ℹ',
  hint: '💡',
};

/*
 * ============================================================================
 * CONSOLE REPORTER
 * ============================================================================
 */

/**
 * Reporter pour la console
 */
export class ConsoleReporter implements Reporter {
  readonly name = 'console';

  private useColors: boolean;
  private defaultOptions: ReporterOptions = {
    includeMetrics: true,
    includeCode: false,
    groupByFile: true,
    groupByRule: false,
    sortBySeverity: true,
  };

  constructor(useColors = true) {
    this.useColors = useColors;
  }

  /**
   * Formater un résultat unique
   */
  formatResult(result: AnalysisResult, options?: Partial<ReporterOptions>): string {
    const opts = { ...this.defaultOptions, ...options };
    const lines: string[] = [];

    // Header fichier
    lines.push(this.formatFileHeader(result));

    if (result.parseErrors.length > 0) {
      lines.push(this.color(colors.red, '  Parse errors:'));

      for (const error of result.parseErrors) {
        lines.push(this.color(colors.red, `    ${error.message}`));
      }
    }

    if (result.issues.length === 0 && result.parseErrors.length === 0) {
      lines.push(this.color(colors.green, '  ✓ No issues found'));
    } else {
      // Trier les issues
      const sortedIssues = opts.sortBySeverity ? this.sortBySeverity(result.issues) : result.issues;

      for (const issue of sortedIssues) {
        lines.push(this.formatIssue(issue, opts.includeCode));
      }
    }

    // Métriques
    if (opts.includeMetrics) {
      lines.push('');
      lines.push(this.formatMetrics(result));
    }

    return lines.join('\n');
  }

  /**
   * Formater plusieurs résultats
   */
  formatResults(results: AnalysisResult[], options?: Partial<ReporterOptions>): string {
    const opts = { ...this.defaultOptions, ...options };
    const lines: string[] = [];

    if (opts.groupByRule) {
      return this.formatByRule(results, opts);
    }

    for (const result of results) {
      if (result.issues.length > 0 || result.parseErrors.length > 0) {
        lines.push(this.formatResult(result, opts));
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Formater le résumé
   */
  formatSummary(summary: AnalysisSummary): string {
    const lines: string[] = [];

    lines.push('');
    lines.push(this.color(colors.bold, '═══════════════════════════════════════════════════════════════'));
    lines.push(this.color(colors.bold, '                        ANALYSIS SUMMARY                        '));
    lines.push(this.color(colors.bold, '═══════════════════════════════════════════════════════════════'));
    lines.push('');

    // Fichiers
    lines.push(`${this.color(colors.cyan, 'Files analyzed:')} ${summary.totalFiles}`);

    if (summary.filesWithErrors > 0) {
      lines.push(`${this.color(colors.red, 'Files with errors:')} ${summary.filesWithErrors}`);
    }

    if (summary.filesWithWarnings > 0) {
      lines.push(`${this.color(colors.yellow, 'Files with warnings:')} ${summary.filesWithWarnings}`);
    }

    lines.push('');

    // Issues par sévérité
    lines.push(this.color(colors.bold, 'Issues by severity:'));

    const { error, warning, info, hint } = summary.issuesBySeverity;

    if (error > 0) {
      lines.push(`  ${this.color(colors.red, `${severityIcons.error} Errors:`)} ${error}`);
    }

    if (warning > 0) {
      lines.push(`  ${this.color(colors.yellow, `${severityIcons.warning} Warnings:`)} ${warning}`);
    }

    if (info > 0) {
      lines.push(`  ${this.color(colors.blue, `${severityIcons.info} Info:`)} ${info}`);
    }

    if (hint > 0) {
      lines.push(`  ${this.color(colors.dim, `${severityIcons.hint} Hints:`)} ${hint}`);
    }

    if (error + warning + info + hint === 0) {
      lines.push(`  ${this.color(colors.green, '✓ No issues found!')}`);
    }

    lines.push('');

    // Issues par catégorie
    lines.push(this.color(colors.bold, 'Issues by category:'));

    const { security, performance, maintainability, style } = summary.issuesByCategory;

    if (security > 0) {
      lines.push(`  ${this.color(colors.red, '🔒 Security:')} ${security}`);
    }

    if (performance > 0) {
      lines.push(`  ${this.color(colors.yellow, '⚡ Performance:')} ${performance}`);
    }

    if (maintainability > 0) {
      lines.push(`  ${this.color(colors.blue, '🔧 Maintainability:')} ${maintainability}`);
    }

    if (style > 0) {
      lines.push(`  ${this.color(colors.cyan, '✨ Style:')} ${style}`);
    }

    lines.push('');

    // Métriques agrégées
    lines.push(this.color(colors.bold, 'Aggregated metrics:'));
    lines.push(`  Lines of code: ${summary.aggregatedMetrics.totalLinesOfCode}`);
    lines.push(`  Average complexity: ${summary.aggregatedMetrics.averageComplexity}`);
    lines.push(`  Average maintainability: ${summary.aggregatedMetrics.averageMaintainability}/100`);

    if (summary.aggregatedMetrics.totalAnyCount > 0) {
      lines.push(`  ${this.color(colors.yellow, 'Any types:')} ${summary.aggregatedMetrics.totalAnyCount}`);
    }

    lines.push('');

    // Temps
    lines.push(`${this.color(colors.dim, 'Analysis time:')} ${summary.analysisTime}ms`);

    lines.push('');
    lines.push(this.color(colors.bold, '═══════════════════════════════════════════════════════════════'));

    return lines.join('\n');
  }

  /*
   * ============================================================================
   * PRIVATE HELPERS
   * ============================================================================
   */

  private formatFileHeader(result: AnalysisResult): string {
    const issueCount = result.issues.length;
    const errorCount = result.issues.filter((i) => i.severity === 'error').length;
    const warningCount = result.issues.filter((i) => i.severity === 'warning').length;

    let status: string;

    if (errorCount > 0) {
      status = this.color(colors.red, `${errorCount} error${errorCount > 1 ? 's' : ''}`);
    } else if (warningCount > 0) {
      status = this.color(colors.yellow, `${warningCount} warning${warningCount > 1 ? 's' : ''}`);
    } else if (issueCount > 0) {
      status = this.color(colors.blue, `${issueCount} issue${issueCount > 1 ? 's' : ''}`);
    } else {
      status = this.color(colors.green, 'OK');
    }

    return `\n${this.color(colors.bold, result.file)} [${status}]`;
  }

  private formatIssue(issue: ASTIssue, includeCode: boolean): string {
    const severityColor = severityColors[issue.severity];
    const icon = severityIcons[issue.severity];

    const location = `${issue.location.start.line}:${issue.location.start.column}`;
    const ruleId = this.color(colors.dim, `(${issue.rule})`);

    let line = `  ${this.color(severityColor, icon)} ${location} ${issue.message} ${ruleId}`;

    if (issue.suggestion) {
      line += `\n    ${this.color(colors.cyan, '→')} ${issue.suggestion}`;
    }

    if (includeCode && issue.code) {
      const codeLines = issue.code.split('\n').slice(0, 3); // Limit to 3 lines
      line += '\n' + codeLines.map((l) => `    ${this.color(colors.dim, l)}`).join('\n');
    }

    return line;
  }

  private formatMetrics(result: AnalysisResult): string {
    const { metrics } = result;
    const lines: string[] = [];

    lines.push(this.color(colors.dim, '  ─────────────────────────────────'));
    lines.push(
      `  ${this.color(colors.dim, 'LOC:')} ${metrics.linesOfCode} | ` +
        `${this.color(colors.dim, 'Complexity:')} ${metrics.cyclomaticComplexity} | ` +
        `${this.color(colors.dim, 'Maintainability:')} ${metrics.maintainabilityIndex}/100`,
    );

    if (metrics.anyCount > 0) {
      lines.push(`  ${this.color(colors.yellow, 'Any types:')} ${metrics.anyCount}`);
    }

    return lines.join('\n');
  }

  private formatByRule(results: AnalysisResult[], opts: ReporterOptions): string {
    const byRule = new Map<string, ASTIssue[]>();

    for (const result of results) {
      for (const issue of result.issues) {
        const existing = byRule.get(issue.rule) || [];
        existing.push(issue);
        byRule.set(issue.rule, existing);
      }
    }

    const lines: string[] = [];

    for (const [rule, issues] of byRule) {
      lines.push(`\n${this.color(colors.bold, rule)} (${issues.length} occurrences)`);

      for (const issue of issues) {
        lines.push(`  ${issue.location.file}:${issue.location.start.line} - ${issue.message}`);
      }
    }

    return lines.join('\n');
  }

  private sortBySeverity(issues: ASTIssue[]): ASTIssue[] {
    const order: Record<Severity, number> = { error: 0, warning: 1, info: 2, hint: 3 };
    return [...issues].sort((a, b) => order[a.severity] - order[b.severity]);
  }

  private color(color: string, text: string): string {
    if (!this.useColors) {
      return text;
    }

    return `${color}${text}${colors.reset}`;
  }
}

/*
 * ============================================================================
 * FACTORY
 * ============================================================================
 */

/**
 * Créer un reporter console
 */
export function createConsoleReporter(useColors = true): ConsoleReporter {
  return new ConsoleReporter(useColors);
}
