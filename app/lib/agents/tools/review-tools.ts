/**
 * Outils de review de code pour le Reviewer Agent
 * Analyse de qualité, sécurité, et bonnes pratiques
 */

import type { ToolDefinition } from '../types';

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Type d'analyse de code
 */
export type AnalysisType = 'quality' | 'security' | 'performance' | 'best_practices' | 'all';

/**
 * Sévérité d'un problème
 */
export type IssueSeverity = 'high' | 'medium' | 'low' | 'info';

/**
 * Type de problème
 */
export type IssueType = 'security' | 'quality' | 'performance' | 'style' | 'bug' | 'smell';

/**
 * Problème détecté dans le code
 */
export interface CodeIssue {
  severity: IssueSeverity;
  type: IssueType;
  file: string;
  line?: number;
  column?: number;
  message: string;
  suggestion?: string;
  code?: string;
  rule?: string;
}

/**
 * Résultat d'analyse de code
 */
export interface AnalysisResult {
  file: string;
  language: string;
  linesAnalyzed: number;
  issues: CodeIssue[];
  metrics: {
    complexity?: number;
    linesOfCode?: number;
    duplicateLines?: number;
    commentRatio?: number;
  };
  score: {
    overall: number;
    quality: number;
    security: number;
    performance: number;
    maintainability: number;
  };
}

/**
 * Résultat de review de changements
 */
export interface ChangeReviewResult {
  filesChanged: number;
  additions: number;
  deletions: number;
  issues: CodeIssue[];
  riskLevel: 'high' | 'medium' | 'low';
  summary: string;
  recommendations: string[];
}

/**
 * Résultat de calcul de complexité
 */
export interface ComplexityResult {
  file: string;
  functions: Array<{
    name: string;
    line: number;
    complexity: number;
    isComplex: boolean;
  }>;
  averageComplexity: number;
  maxComplexity: number;
  totalFunctions: number;
}

/**
 * Code smell détecté
 */
export interface CodeSmell {
  type: string;
  file: string;
  line: number;
  description: string;
  severity: IssueSeverity;
  refactoringAdvice: string;
}

/**
 * Interface pour l'analyseur de code
 */
export interface CodeAnalyzer {
  analyzeCode(content: string, options?: { type?: AnalysisType; language?: string }): Promise<AnalysisResult>;
  reviewChanges(before: string, after: string): Promise<ChangeReviewResult>;
  calculateComplexity(content: string): Promise<ComplexityResult>;
  checkStyle(content: string, rules?: Record<string, unknown>): Promise<CodeIssue[]>;
  detectCodeSmells(content: string): Promise<CodeSmell[]>;
}

/*
 * ============================================================================
 * OUTILS DE REVIEW
 * ============================================================================
 */

/**
 * Outil : Analyser du code
 */
export const AnalyzeCodeTool: ToolDefinition = {
  name: 'analyze_code',
  description: `Analyser un fichier ou extrait de code pour en évaluer la qualité.
Types d'analyse: quality, security, performance, best_practices, all.
Retourne un score et une liste de problèmes détectés.`,
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'Contenu du code à analyser',
      },
      file: {
        type: 'string',
        description: 'Chemin du fichier (pour le contexte)',
      },
      analysisType: {
        type: 'string',
        enum: ['quality', 'security', 'performance', 'best_practices', 'all'],
        description: "Type d'analyse à effectuer (défaut: all)",
      },
      language: {
        type: 'string',
        description: 'Langage de programmation (auto-détecté si non spécifié)',
      },
    },
    required: ['content'],
  },
};

/**
 * Outil : Review de changements
 */
export const ReviewChangesTool: ToolDefinition = {
  name: 'review_changes',
  description: `Analyser les changements entre deux versions de code.
Compare le code avant/après et identifie les problèmes potentiels.
Évalue le niveau de risque des changements.`,
  inputSchema: {
    type: 'object',
    properties: {
      before: {
        type: 'string',
        description: 'Code avant modification',
      },
      after: {
        type: 'string',
        description: 'Code après modification',
      },
      file: {
        type: 'string',
        description: 'Chemin du fichier (pour le contexte)',
      },
    },
    required: ['before', 'after'],
  },
};

/**
 * Outil : Calculer la complexité cyclomatique
 */
export const CalculateComplexityTool: ToolDefinition = {
  name: 'calculate_complexity',
  description: `Calculer la complexité cyclomatique du code.
Identifie les fonctions trop complexes (> 10) qui devraient être refactorisées.
Retourne la complexité par fonction et les métriques globales.`,
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'Contenu du code à analyser',
      },
      file: {
        type: 'string',
        description: 'Chemin du fichier (pour le rapport)',
      },
      threshold: {
        type: 'number',
        description: 'Seuil de complexité (défaut: 10)',
      },
    },
    required: ['content'],
  },
};

/**
 * Outil : Vérifier le style du code
 */
export const CheckStyleTool: ToolDefinition = {
  name: 'check_style',
  description: `Vérifier la conformité du code aux conventions de style.
Détecte les problèmes de formatage, nommage, et conventions.
Peut utiliser des règles personnalisées.`,
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'Contenu du code à vérifier',
      },
      file: {
        type: 'string',
        description: 'Chemin du fichier (pour le contexte)',
      },
      rules: {
        type: 'object',
        description: 'Règles de style personnalisées',
      },
    },
    required: ['content'],
  },
};

/**
 * Outil : Détecter les code smells
 */
export const DetectCodeSmellsTool: ToolDefinition = {
  name: 'detect_code_smells',
  description: `Détecter les "code smells" courants dans le code.
Identifie: duplication, fonctions longues, classes géantes, couplage fort, etc.
Suggère des refactorisations appropriées.`,
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'Contenu du code à analyser',
      },
      file: {
        type: 'string',
        description: 'Chemin du fichier (pour le rapport)',
      },
      smellTypes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Types de smells à détecter (tous par défaut)',
      },
    },
    required: ['content'],
  },
};

/**
 * Liste de tous les outils de review
 */
export const REVIEW_TOOLS: ToolDefinition[] = [
  AnalyzeCodeTool,
  ReviewChangesTool,
  CalculateComplexityTool,
  CheckStyleTool,
  DetectCodeSmellsTool,
];

/*
 * ============================================================================
 * HANDLERS DE REVIEW
 * ============================================================================
 */

/**
 * Créer les handlers pour les outils de review
 */
export function createReviewToolHandlers(
  analyzer: CodeAnalyzer,
): Record<string, (input: Record<string, unknown>) => Promise<unknown>> {
  return {
    analyze_code: async (input: Record<string, unknown>) => {
      const content = input.content as string;
      const analysisType = (input.analysisType as AnalysisType) || 'all';
      const language = input.language as string | undefined;
      const file = (input.file as string) || 'unknown';

      const result = await analyzer.analyzeCode(content, { type: analysisType, language });

      return { ...result, file };
    },

    review_changes: async (input: Record<string, unknown>) => {
      const before = input.before as string;
      const after = input.after as string;

      return analyzer.reviewChanges(before, after);
    },

    calculate_complexity: async (input: Record<string, unknown>) => {
      const content = input.content as string;
      const file = (input.file as string) || 'unknown';
      const threshold = (input.threshold as number) || 10;

      const result = await analyzer.calculateComplexity(content);

      // Marquer les fonctions complexes selon le seuil
      return {
        ...result,
        file,
        functions: result.functions.map((f) => ({
          ...f,
          isComplex: f.complexity > threshold,
        })),
      };
    },

    check_style: async (input: Record<string, unknown>) => {
      const content = input.content as string;
      const rules = input.rules as Record<string, unknown> | undefined;

      return analyzer.checkStyle(content, rules);
    },

    detect_code_smells: async (input: Record<string, unknown>) => {
      const content = input.content as string;

      return analyzer.detectCodeSmells(content);
    },
  };
}

/*
 * ============================================================================
 * MOCK ANALYZER
 * ============================================================================
 */

/**
 * Créer un analyseur de code mock pour les tests
 */
export function createMockAnalyzer(
  options: {
    analysisResult?: Partial<AnalysisResult>;
    changeReviewResult?: Partial<ChangeReviewResult>;
    complexityResult?: Partial<ComplexityResult>;
    styleIssues?: CodeIssue[];
    codeSmells?: CodeSmell[];
  } = {},
): CodeAnalyzer {
  return {
    async analyzeCode(content: string, opts?: { type?: AnalysisType; language?: string }): Promise<AnalysisResult> {
      const lines = content.split('\n').length;
      const language = opts?.language || detectLanguage(content);

      return {
        file: 'unknown',
        language,
        linesAnalyzed: lines,
        issues: options.analysisResult?.issues || [],
        metrics: {
          linesOfCode: lines,
          complexity: 5,
          duplicateLines: 0,
          commentRatio: 0.1,
          ...options.analysisResult?.metrics,
        },
        score: {
          overall: 85,
          quality: 80,
          security: 90,
          performance: 85,
          maintainability: 85,
          ...options.analysisResult?.score,
        },
      };
    },

    async reviewChanges(before: string, after: string): Promise<ChangeReviewResult> {
      const beforeLines = before.split('\n').length;
      const afterLines = after.split('\n').length;
      const additions = Math.max(0, afterLines - beforeLines);
      const deletions = Math.max(0, beforeLines - afterLines);

      return {
        filesChanged: 1,
        additions,
        deletions,
        issues: options.changeReviewResult?.issues || [],
        riskLevel: options.changeReviewResult?.riskLevel || 'low',
        summary: options.changeReviewResult?.summary || 'Changes analyzed successfully',
        recommendations: options.changeReviewResult?.recommendations || [],
      };
    },

    async calculateComplexity(content: string): Promise<ComplexityResult> {
      // Simple mock: count if/for/while statements as complexity
      const functionMatches = content.match(/function\s+(\w+)|(\w+)\s*=\s*(?:async\s*)?\(/g) || [];
      const functions = functionMatches.map((match, index) => {
        const name = match
          .replace(/function\s+/, '')
          .replace(/\s*=.*/, '')
          .trim();
        return {
          name: name || `anonymous_${index}`,
          line: index * 10 + 1,
          complexity: options.complexityResult?.functions?.[index]?.complexity || 3,
          isComplex: false,
        };
      });

      return {
        file: 'unknown',
        functions: options.complexityResult?.functions || functions,
        averageComplexity: options.complexityResult?.averageComplexity || 3,
        maxComplexity: options.complexityResult?.maxComplexity || 5,
        totalFunctions: functions.length,
      };
    },

    async checkStyle(content: string, _rules?: Record<string, unknown>): Promise<CodeIssue[]> {
      if (options.styleIssues) {
        return options.styleIssues;
      }

      const issues: CodeIssue[] = [];

      // Check for very long lines
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (line.length > 120) {
          issues.push({
            severity: 'low',
            type: 'style',
            file: 'unknown',
            line: index + 1,
            message: `Line exceeds 120 characters (${line.length})`,
            suggestion: 'Break the line into multiple lines',
          });
        }
      });

      return issues;
    },

    async detectCodeSmells(content: string): Promise<CodeSmell[]> {
      if (options.codeSmells) {
        return options.codeSmells;
      }

      const smells: CodeSmell[] = [];
      const lines = content.split('\n');

      // Check for very long functions (naive check)
      let functionStart = -1;
      let functionName = '';
      let braceCount = 0;

      lines.forEach((line, index) => {
        const funcMatch = line.match(/function\s+(\w+)|(\w+)\s*=\s*(?:async\s*)?\(/);

        if (funcMatch && line.includes('{')) {
          functionStart = index;
          functionName = funcMatch[1] || funcMatch[2] || 'anonymous';
          braceCount = 1;
        } else if (functionStart >= 0) {
          braceCount += (line.match(/{/g) || []).length;
          braceCount -= (line.match(/}/g) || []).length;

          if (braceCount === 0) {
            const functionLength = index - functionStart + 1;

            if (functionLength > 50) {
              smells.push({
                type: 'long_function',
                file: 'unknown',
                line: functionStart + 1,
                description: `Function "${functionName}" is ${functionLength} lines long`,
                severity: 'medium',
                refactoringAdvice: 'Consider breaking this function into smaller, more focused functions',
              });
            }

            functionStart = -1;
          }
        }
      });

      return smells;
    },
  };
}

/**
 * Détecter le langage de programmation
 */
function detectLanguage(content: string): string {
  if (content.includes('import React') || content.includes('from "react"')) {
    return 'tsx';
  }

  if (content.includes('interface ') || content.includes(': string') || content.includes(': number')) {
    return 'typescript';
  }

  if (content.includes('const ') || content.includes('let ') || content.includes('function ')) {
    return 'javascript';
  }

  if (content.includes('def ') || (content.includes('import ') && content.includes(':'))) {
    return 'python';
  }

  return 'unknown';
}
