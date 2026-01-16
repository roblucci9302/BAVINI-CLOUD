/**
 * Base Rule - Classe de base pour toutes les règles d'analyse AST
 */

import ts from 'typescript';
import type { ASTIssue, ASTLocation, RuleCategory, Severity, RuleConfig, ASTFix } from '../types';
import { TypeScriptParser } from '../parser';

/*
 * ============================================================================
 * RULE CONTEXT
 * ============================================================================
 */

/**
 * Contexte d'exécution d'une règle
 */
export interface RuleContext {
  /** Fichier source */
  sourceFile: ts.SourceFile;

  /** Programme TypeScript (optionnel, pour analyse de types) */
  program?: ts.Program;

  /** Type checker (optionnel, pour analyse de types) */
  checker?: ts.TypeChecker;

  /** Parser pour utilitaires */
  parser: TypeScriptParser;

  /** Reporter d'issues */
  report: (issue: Omit<ASTIssue, 'rule'>) => void;

  /** Options de configuration de la règle */
  options: Record<string, unknown>;
}

/*
 * ============================================================================
 * BASE RULE
 * ============================================================================
 */

/**
 * Classe de base pour les règles d'analyse
 */
export abstract class BaseRule {
  /*
   * ============================================================================
   * METADATA (à implémenter par les sous-classes)
   * ============================================================================
   */

  /** Identifiant unique de la règle (format: category/name) */
  abstract readonly id: string;

  /** Nom lisible de la règle */
  abstract readonly name: string;

  /** Description détaillée */
  abstract readonly description: string;

  /** Catégorie de la règle */
  abstract readonly category: RuleCategory;

  /** Sévérité par défaut */
  abstract readonly defaultSeverity: Severity;

  /*
   * ============================================================================
   * CONFIGURATION
   * ============================================================================
   */

  /** Configuration de la règle */
  protected config: RuleConfig = { enabled: true };

  /** Parser pour utilitaires */
  protected parser: TypeScriptParser = new TypeScriptParser();

  /**
   * Configurer la règle
   */
  configure(config: Partial<RuleConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Obtenir la sévérité effective
   */
  get severity(): Severity {
    return this.config.severity ?? this.defaultSeverity;
  }

  /**
   * Vérifier si la règle est activée
   */
  get enabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Obtenir les options de configuration
   */
  get options(): Record<string, unknown> {
    return this.config.options ?? {};
  }

  /*
   * ============================================================================
   * ANALYSE (à implémenter par les sous-classes)
   * ============================================================================
   */

  /**
   * Analyser un nœud AST
   * @param node - Nœud à analyser
   * @param context - Contexte d'exécution
   */
  abstract analyze(node: ts.Node, context: RuleContext): void;

  /*
   * ============================================================================
   * UTILITAIRES PROTÉGÉS
   * ============================================================================
   */

  /**
   * Vérifier si la règle doit s'exécuter
   */
  protected isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Obtenir la localisation d'un nœud
   */
  protected getLocation(node: ts.Node, sourceFile: ts.SourceFile): ASTLocation {
    return this.parser.getLocation(node, sourceFile);
  }

  /**
   * Obtenir le texte d'un nœud
   */
  protected getNodeText(node: ts.Node, sourceFile?: ts.SourceFile): string {
    return this.parser.getNodeText(node, sourceFile);
  }

  /**
   * Créer une issue
   */
  protected createIssue(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    message: string,
    options: Partial<{
      severity: Severity;
      suggestion: string;
      fixable: boolean;
      fix: ASTFix;
      code: string;
    }> = {},
  ): Omit<ASTIssue, 'rule'> {
    const location = this.getLocation(node, sourceFile);

    return {
      id: `${this.id}-${location.start.offset}`,
      message,
      severity: options.severity ?? this.severity,
      category: this.category,
      location,
      code: options.code ?? this.getNodeText(node, sourceFile),
      suggestion: options.suggestion,
      fixable: options.fixable ?? false,
      fix: options.fix,
    };
  }

  /**
   * Créer un fix de remplacement
   */
  protected createReplaceFix(node: ts.Node, replacement: string): ASTFix {
    return {
      range: [node.getStart(), node.getEnd()],
      replacement,
    };
  }

  /**
   * Créer un fix d'insertion avant
   */
  protected createInsertBeforeFix(node: ts.Node, text: string): ASTFix {
    const start = node.getStart();
    return {
      range: [start, start],
      replacement: text,
    };
  }

  /**
   * Créer un fix d'insertion après
   */
  protected createInsertAfterFix(node: ts.Node, text: string): ASTFix {
    const end = node.getEnd();
    return {
      range: [end, end],
      replacement: text,
    };
  }

  /**
   * Créer un fix de suppression
   */
  protected createDeleteFix(node: ts.Node): ASTFix {
    return {
      range: [node.getStart(), node.getEnd()],
      replacement: '',
    };
  }

  /*
   * ============================================================================
   * TYPE GUARDS UTILITAIRES
   * ============================================================================
   */

  /**
   * Vérifier si le nœud est dans un contexte JSX
   */
  protected isInJSXContext(node: ts.Node): boolean {
    let current: ts.Node | undefined = node;

    while (current) {
      if (ts.isJsxElement(current) || ts.isJsxFragment(current) || ts.isJsxSelfClosingElement(current)) {
        return true;
      }

      current = current.parent;
    }

    return false;
  }

  /**
   * Vérifier si le nœud est dans une fonction async
   */
  protected isInAsyncFunction(node: ts.Node): boolean {
    let current: ts.Node | undefined = node;

    while (current) {
      if (ts.isFunctionLike(current)) {
        const modifiers = ts.getModifiers(current as ts.FunctionLikeDeclaration);
        return modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
      }

      current = current.parent;
    }

    return false;
  }

  /**
   * Obtenir la fonction parente
   */
  protected getParentFunction(node: ts.Node): ts.FunctionLikeDeclaration | undefined {
    let current: ts.Node | undefined = node.parent;

    while (current) {
      if (ts.isFunctionLike(current)) {
        return current as ts.FunctionLikeDeclaration;
      }

      current = current.parent;
    }

    return undefined;
  }

  /**
   * Obtenir la classe parente
   */
  protected getParentClass(node: ts.Node): ts.ClassDeclaration | ts.ClassExpression | undefined {
    let current: ts.Node | undefined = node.parent;

    while (current) {
      if (ts.isClassDeclaration(current) || ts.isClassExpression(current)) {
        return current;
      }

      current = current.parent;
    }

    return undefined;
  }

  /**
   * Vérifier si le nœud est dans un try/catch
   */
  protected isInTryCatch(node: ts.Node): boolean {
    let current: ts.Node | undefined = node;

    while (current) {
      if (ts.isTryStatement(current)) {
        return true;
      }

      current = current.parent;
    }

    return false;
  }

  /**
   * Vérifier si le nœud est un appel de fonction avec un nom donné
   */
  protected isCallTo(node: ts.Node, ...names: string[]): node is ts.CallExpression {
    if (!ts.isCallExpression(node)) {
      return false;
    }

    const expression = node.expression;

    if (ts.isIdentifier(expression)) {
      return names.includes(expression.text);
    }

    if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.name)) {
      return names.includes(expression.name.text);
    }

    return false;
  }

  /**
   * Obtenir le nom complet d'une property access (a.b.c)
   */
  protected getPropertyAccessChain(node: ts.PropertyAccessExpression): string[] {
    const parts: string[] = [];

    let current: ts.Expression = node;

    while (ts.isPropertyAccessExpression(current)) {
      parts.unshift(current.name.text);
      current = current.expression;
    }

    if (ts.isIdentifier(current)) {
      parts.unshift(current.text);
    }

    return parts;
  }

  /*
   * ============================================================================
   * DOCUMENTATION
   * ============================================================================
   */

  /**
   * Obtenir la documentation de la règle
   */
  getDocumentation(): RuleDocumentation {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      category: this.category,
      defaultSeverity: this.defaultSeverity,
      options: this.getOptionsSchema(),
      examples: this.getExamples(),
    };
  }

  /**
   * Obtenir le schéma des options (à surcharger si besoin)
   */
  protected getOptionsSchema(): Record<string, OptionSchema> {
    return {};
  }

  /**
   * Obtenir des exemples (à surcharger si besoin)
   */
  protected getExamples(): RuleExample[] {
    return [];
  }
}

/*
 * ============================================================================
 * TYPES DE DOCUMENTATION
 * ============================================================================
 */

/**
 * Documentation d'une règle
 */
export interface RuleDocumentation {
  id: string;
  name: string;
  description: string;
  category: RuleCategory;
  defaultSeverity: Severity;
  options: Record<string, OptionSchema>;
  examples: RuleExample[];
}

/**
 * Schéma d'une option
 */
export interface OptionSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  default?: unknown;
  required?: boolean;
}

/**
 * Exemple d'utilisation d'une règle
 */
export interface RuleExample {
  description: string;
  code: string;
  isValid: boolean;
}
