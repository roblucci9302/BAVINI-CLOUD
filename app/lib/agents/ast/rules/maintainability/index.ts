/**
 * Maintainability Rules - Règles de maintenabilité pour l'analyse AST
 */

import ts from 'typescript';
import { BaseRule, type RuleContext, type RuleExample, type OptionSchema } from '../base-rule';

/*
 * ============================================================================
 * NO ANY RULE
 * ============================================================================
 */

/**
 * Interdire l'utilisation du type 'any'
 */
export class NoAnyRule extends BaseRule {
  readonly id = 'maintainability/no-any';
  readonly name = 'No any Type';
  readonly description = "Interdit l'utilisation du type any qui désactive la vérification de types";
  readonly category = 'maintainability' as const;
  readonly defaultSeverity = 'warning' as const;

  analyze(node: ts.Node, context: RuleContext): void {
    if (!this.isEnabled()) {
      return;
    }

    // Check for 'any' keyword
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      const parent = node.parent;

      // Determine context for better message
      let contextMsg = '';

      if (ts.isParameter(parent)) {
        contextMsg = ' dans le paramètre';
      } else if (ts.isVariableDeclaration(parent)) {
        contextMsg = ' dans la variable';
      } else if (ts.isPropertySignature(parent) || ts.isPropertyDeclaration(parent)) {
        contextMsg = ' dans la propriété';
      } else if (ts.isFunctionDeclaration(parent) || ts.isMethodDeclaration(parent)) {
        contextMsg = ' comme type de retour';
      }

      context.report(
        this.createIssue(
          node,
          context.sourceFile,
          `Évitez d'utiliser le type "any"${contextMsg}. Il désactive la vérification de types.`,
          {
            fixable: true,
            fix: this.createReplaceFix(node, 'unknown'),
            suggestion: 'Utilisez "unknown" pour un typage sûr, ou définissez un type spécifique.',
          },
        ),
      );
    }

    // Check for type assertions to any: as any
    if (ts.isAsExpression(node)) {
      const type = node.type;

      if (type.kind === ts.SyntaxKind.AnyKeyword) {
        context.report(
          this.createIssue(
            node,
            context.sourceFile,
            'Évitez les assertions de type "as any". Elles contournent la sécurité des types.',
            {
              severity: 'error',
              suggestion: 'Utilisez "as unknown" puis un type guard, ou corrigez le type sous-jacent.',
            },
          ),
        );
      }
    }

    // Check for type references that might be 'any'
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && node.typeName.text === 'any') {
      context.report(
        this.createIssue(node, context.sourceFile, 'Évitez d\'utiliser "any" comme type.', {
          fixable: true,
          fix: this.createReplaceFix(node, 'unknown'),
        }),
      );
    }
  }

  protected getExamples(): RuleExample[] {
    return [
      { description: 'any explicite', code: 'let x: any = 1', isValid: false },
      { description: 'as any', code: 'value as any', isValid: false },
      { description: 'Paramètre any', code: 'function f(x: any) {}', isValid: false },
      { description: 'unknown est OK', code: 'let x: unknown = 1', isValid: true },
      { description: 'Type spécifique est OK', code: 'let x: string = "hello"', isValid: true },
    ];
  }
}

/*
 * ============================================================================
 * MAX COMPLEXITY RULE
 * ============================================================================
 */

/**
 * Limiter la complexité cyclomatique des fonctions
 */
export class MaxComplexityRule extends BaseRule {
  readonly id = 'maintainability/max-complexity';
  readonly name = 'Max Cyclomatic Complexity';
  readonly description = 'Limite la complexité cyclomatique des fonctions';
  readonly category = 'maintainability' as const;
  readonly defaultSeverity = 'warning' as const;

  private get maxComplexity(): number {
    return (this.options.maxComplexity as number) ?? 10;
  }

  analyze(node: ts.Node, context: RuleContext): void {
    if (!this.isEnabled()) {
      return;
    }

    // Analyze function complexity
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node)
    ) {
      // Skip if function body is empty or simple
      const body = (node as ts.FunctionLikeDeclaration).body;

      if (!body) {
        return;
      }

      const complexity = this.calculateComplexity(node);
      const name = this.getFunctionName(node);

      if (complexity > this.maxComplexity) {
        const severityLevel = complexity > this.maxComplexity * 2 ? 'error' : this.severity;

        context.report(
          this.createIssue(
            node,
            context.sourceFile,
            `La fonction '${name}' a une complexité cyclomatique de ${complexity} (max: ${this.maxComplexity}).`,
            {
              severity: severityLevel,
              suggestion: 'Décomposez cette fonction en sous-fonctions plus petites et ciblées.',
            },
          ),
        );
      }
    }
  }

  private calculateComplexity(node: ts.Node): number {
    let complexity = 1; // Base complexity

    const countBranches = (n: ts.Node): void => {
      switch (n.kind) {
        case ts.SyntaxKind.IfStatement:
          complexity++;

          // Count else if as separate branch
          const ifStmt = n as ts.IfStatement;

          if (ifStmt.elseStatement && ts.isIfStatement(ifStmt.elseStatement)) {
            // Don't double-count, the nested if will be visited
          }

          break;

        case ts.SyntaxKind.ConditionalExpression: // ternary
        case ts.SyntaxKind.CaseClause:
        case ts.SyntaxKind.CatchClause:
        case ts.SyntaxKind.ForStatement:
        case ts.SyntaxKind.ForInStatement:
        case ts.SyntaxKind.ForOfStatement:
        case ts.SyntaxKind.WhileStatement:
        case ts.SyntaxKind.DoStatement:
          complexity++;
          break;

        case ts.SyntaxKind.BinaryExpression:
          const binary = n as ts.BinaryExpression;

          if (
            binary.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
            binary.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
            binary.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
          ) {
            complexity++;
          }

          break;
      }

      ts.forEachChild(n, countBranches);
    };

    countBranches(node);

    return complexity;
  }

  private getFunctionName(node: ts.Node): string {
    if (ts.isFunctionDeclaration(node) && node.name) {
      return node.name.text;
    }

    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
      return node.name.text;
    }

    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      const parent = node.parent;

      if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
        return parent.name.text;
      }

      if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
        return parent.name.text;
      }
    }

    return '<anonymous>';
  }

  protected getOptionsSchema(): Record<string, OptionSchema> {
    return {
      maxComplexity: {
        type: 'number',
        description: 'Complexité cyclomatique maximale autorisée',
        default: 10,
      },
    };
  }

  protected getExamples(): RuleExample[] {
    return [
      { description: 'Fonction simple', code: 'function f() { return 1; }', isValid: true },
      {
        description: 'Fonction avec if/else',
        code: 'function f(x) { if (x) { return 1; } else { return 2; } }',
        isValid: true,
      },
    ];
  }
}

/*
 * ============================================================================
 * IMPORT ORDER RULE
 * ============================================================================
 */

/**
 * Vérifier l'ordre des imports
 */
export class ImportOrderRule extends BaseRule {
  readonly id = 'maintainability/import-order';
  readonly name = 'Import Order';
  readonly description = 'Vérifie que les imports sont organisés de manière cohérente';
  readonly category = 'maintainability' as const;
  readonly defaultSeverity = 'info' as const;

  // Import groups in order
  private readonly importGroups = [
    {
      name: 'builtin',
      pattern:
        /^(node:|fs|path|util|crypto|http|https|stream|os|child_process|events|buffer|url|querystring|assert|tty|readline|net|dns|domain|cluster|dgram|vm|punycode|repl|zlib|v8|perf_hooks|async_hooks|trace_events|inspector|worker_threads|wasi)/,
    },
    { name: 'external', pattern: /^[^./~@]|^@[^/]+\/[^/]+/ },
    { name: 'internal', pattern: /^~\// },
    { name: 'parent', pattern: /^\.\.\// },
    { name: 'sibling', pattern: /^\.\/(?!index)/ },
    { name: 'index', pattern: /^\.\/index$|^\.$/ },
  ];

  analyze(node: ts.Node, context: RuleContext): void {
    if (!this.isEnabled()) {
      return;
    }

    // Only analyze at source file level
    if (!ts.isSourceFile(node)) {
      return;
    }

    const imports = this.collectImports(node);

    if (imports.length < 2) {
      return;
    }

    let lastGroup = -1;
    let lastSpecifier = '';

    for (const imp of imports) {
      const group = this.getImportGroup(imp.specifier);

      // Check group order
      if (group < lastGroup) {
        context.report(
          this.createIssue(
            imp.node,
            context.sourceFile,
            `Import de '${imp.specifier}' devrait être avant les imports de groupe ${this.importGroups[lastGroup]?.name || 'unknown'}.`,
            {
              suggestion: 'Organisez les imports: builtin → external → internal → parent → sibling → index',
            },
          ),
        );
      }

      // Check alphabetical order within group
      if (group === lastGroup && imp.specifier.toLowerCase() < lastSpecifier.toLowerCase()) {
        context.report(
          this.createIssue(
            imp.node,
            context.sourceFile,
            `Import de '${imp.specifier}' devrait être avant '${lastSpecifier}' (ordre alphabétique).`,
            {
              severity: 'hint',
            },
          ),
        );
      }

      lastGroup = group;
      lastSpecifier = imp.specifier;
    }
  }

  private collectImports(sourceFile: ts.SourceFile): Array<{ node: ts.ImportDeclaration; specifier: string }> {
    const imports: Array<{ node: ts.ImportDeclaration; specifier: string }> = [];

    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement)) {
        const moduleSpecifier = statement.moduleSpecifier;

        if (ts.isStringLiteral(moduleSpecifier)) {
          imports.push({
            node: statement,
            specifier: moduleSpecifier.text,
          });
        }
      }
    }

    return imports;
  }

  private getImportGroup(specifier: string): number {
    for (let i = 0; i < this.importGroups.length; i++) {
      if (this.importGroups[i].pattern.test(specifier)) {
        return i;
      }
    }
    return 1; // Default to external
  }

  protected getExamples(): RuleExample[] {
    return [
      {
        description: 'Ordre correct',
        code: 'import fs from "fs";\nimport React from "react";\nimport { util } from "~/utils";',
        isValid: true,
      },
      { description: 'Ordre incorrect', code: 'import { util } from "~/utils";\nimport fs from "fs";', isValid: false },
    ];
  }
}

/*
 * ============================================================================
 * NAMING CONVENTIONS RULE
 * ============================================================================
 */

/**
 * Vérifier les conventions de nommage
 */
export class NamingConventionsRule extends BaseRule {
  readonly id = 'maintainability/naming-conventions';
  readonly name = 'Naming Conventions';
  readonly description = 'Vérifie les conventions de nommage TypeScript/JavaScript';
  readonly category = 'maintainability' as const;
  readonly defaultSeverity = 'info' as const;

  // Regex patterns for conventions
  private readonly patterns = {
    camelCase: /^[a-z][a-zA-Z0-9]*$/,
    PascalCase: /^[A-Z][a-zA-Z0-9]*$/,
    UPPER_CASE: /^[A-Z][A-Z0-9_]*$/,
    _privatePrefix: /^_[a-z][a-zA-Z0-9]*$/,
  };

  analyze(node: ts.Node, context: RuleContext): void {
    if (!this.isEnabled()) {
      return;
    }

    // Classes should be PascalCase
    if (ts.isClassDeclaration(node) && node.name) {
      if (!this.patterns.PascalCase.test(node.name.text)) {
        context.report(
          this.createIssue(
            node.name,
            context.sourceFile,
            `Le nom de classe '${node.name.text}' devrait être en PascalCase.`,
            {
              suggestion: `Renommez en '${this.toPascalCase(node.name.text)}'`,
            },
          ),
        );
      }
    }

    // Interfaces should be PascalCase (without I prefix by default)
    if (ts.isInterfaceDeclaration(node)) {
      const name = node.name.text;

      if (!this.patterns.PascalCase.test(name)) {
        context.report(
          this.createIssue(
            node.name,
            context.sourceFile,
            `Le nom d'interface '${name}' devrait être en PascalCase.`,
            {},
          ),
        );
      }

      // Check for Hungarian notation (IFoo)
      if (name.startsWith('I') && name.length > 1 && name[1] === name[1].toUpperCase()) {
        context.report(
          this.createIssue(
            node.name,
            context.sourceFile,
            `Évitez le préfixe 'I' pour les interfaces. Utilisez '${name.slice(1)}' directement.`,
            {
              severity: 'hint',
            },
          ),
        );
      }
    }

    // Type aliases should be PascalCase
    if (ts.isTypeAliasDeclaration(node)) {
      if (!this.patterns.PascalCase.test(node.name.text)) {
        context.report(
          this.createIssue(
            node.name,
            context.sourceFile,
            `Le type '${node.name.text}' devrait être en PascalCase.`,
            {},
          ),
        );
      }
    }

    // Enums should be PascalCase
    if (ts.isEnumDeclaration(node)) {
      if (!this.patterns.PascalCase.test(node.name.text)) {
        context.report(
          this.createIssue(node.name, context.sourceFile, `L'enum '${node.name.text}' devrait être en PascalCase.`, {}),
        );
      }

      // Enum members should be PascalCase or UPPER_CASE
      for (const member of node.members) {
        if (ts.isIdentifier(member.name)) {
          const memberName = member.name.text;

          if (!this.patterns.PascalCase.test(memberName) && !this.patterns.UPPER_CASE.test(memberName)) {
            context.report(
              this.createIssue(
                member.name,
                context.sourceFile,
                `Le membre d'enum '${memberName}' devrait être en PascalCase ou UPPER_CASE.`,
                {},
              ),
            );
          }
        }
      }
    }

    // Functions should be camelCase
    if (ts.isFunctionDeclaration(node) && node.name) {
      if (!this.patterns.camelCase.test(node.name.text)) {
        context.report(
          this.createIssue(
            node.name,
            context.sourceFile,
            `La fonction '${node.name.text}' devrait être en camelCase.`,
            {},
          ),
        );
      }
    }

    // Constants (const at module level) can be UPPER_CASE
    if (ts.isVariableStatement(node)) {
      const isConst = node.declarationList.flags & ts.NodeFlags.Const;
      const isModuleLevel = ts.isSourceFile(node.parent);

      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const name = decl.name.text;

          // Check for single-letter names (except loop counters)
          if (name.length === 1 && !['i', 'j', 'k', 'n', 'x', 'y', 'z', '_'].includes(name)) {
            context.report(
              this.createIssue(
                decl.name,
                context.sourceFile,
                `Évitez les noms de variable à une lettre '${name}'. Utilisez un nom descriptif.`,
                {
                  severity: 'hint',
                },
              ),
            );
          }

          // Module-level const can be UPPER_CASE or camelCase
          if (isConst && isModuleLevel) {
            if (
              !this.patterns.camelCase.test(name) &&
              !this.patterns.UPPER_CASE.test(name) &&
              !this.patterns.PascalCase.test(name)
            ) {
              context.report(
                this.createIssue(
                  decl.name,
                  context.sourceFile,
                  `La constante '${name}' devrait être en camelCase ou UPPER_CASE.`,
                  {},
                ),
              );
            }
          }
        }
      }
    }

    // React components (function starting with uppercase returning JSX)
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && this.isReactComponent(node, context)) {
      let name: string | undefined;

      if (ts.isFunctionDeclaration(node) && node.name) {
        name = node.name.text;
      } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        name = node.name.text;
      }

      if (name && !this.patterns.PascalCase.test(name)) {
        context.report(
          this.createIssue(node, context.sourceFile, `Le composant React '${name}' devrait être en PascalCase.`, {
            severity: 'warning',
          }),
        );
      }
    }
  }

  private isReactComponent(node: ts.Node, context: RuleContext): boolean {
    // Simple heuristic: check if function returns JSX
    const text = this.getNodeText(node, context.sourceFile);
    return /<[A-Za-z]/.test(text) || /React\.createElement/.test(text);
  }

  private toPascalCase(str: string): string {
    return str.replace(/[-_](.)/g, (_, c) => c.toUpperCase()).replace(/^(.)/, (_, c) => c.toUpperCase());
  }

  protected getExamples(): RuleExample[] {
    return [
      { description: 'Classe PascalCase', code: 'class MyClass {}', isValid: true },
      { description: 'Classe mauvais format', code: 'class myClass {}', isValid: false },
      { description: 'Interface sans préfixe I', code: 'interface User {}', isValid: true },
      { description: 'Interface avec préfixe I', code: 'interface IUser {}', isValid: false },
      { description: 'Fonction camelCase', code: 'function doSomething() {}', isValid: true },
      { description: 'Constante UPPER_CASE', code: 'const MAX_SIZE = 100', isValid: true },
    ];
  }
}

/*
 * ============================================================================
 * MAX FILE LENGTH RULE
 * ============================================================================
 */

/**
 * Limiter la longueur des fichiers
 */
export class MaxFileLengthRule extends BaseRule {
  readonly id = 'maintainability/max-file-length';
  readonly name = 'Max File Length';
  readonly description = 'Limite le nombre de lignes par fichier';
  readonly category = 'maintainability' as const;
  readonly defaultSeverity = 'warning' as const;

  private get maxLines(): number {
    return (this.options.maxLines as number) ?? 500;
  }

  analyze(node: ts.Node, context: RuleContext): void {
    if (!this.isEnabled()) {
      return;
    }

    // Only analyze at source file level
    if (!ts.isSourceFile(node)) {
      return;
    }

    const lineCount = context.sourceFile.getLineStarts().length;

    if (lineCount > this.maxLines) {
      // Create issue at first line
      context.report({
        id: `${this.id}-${context.sourceFile.fileName}`,
        message: `Le fichier contient ${lineCount} lignes (max: ${this.maxLines}). Considérez le découper.`,
        severity: lineCount > this.maxLines * 1.5 ? 'error' : this.severity,
        category: this.category,
        location: {
          file: context.sourceFile.fileName,
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 1, offset: 0 },
        },
        suggestion: 'Extrayez les classes, fonctions ou constantes dans des fichiers séparés.',
        fixable: false,
      });
    }
  }

  protected getOptionsSchema(): Record<string, OptionSchema> {
    return {
      maxLines: {
        type: 'number',
        description: 'Nombre maximum de lignes par fichier',
        default: 500,
      },
    };
  }
}

/*
 * ============================================================================
 * EXPORTS
 * ============================================================================
 */

export const MAINTAINABILITY_RULES = [
  NoAnyRule,
  MaxComplexityRule,
  ImportOrderRule,
  NamingConventionsRule,
  MaxFileLengthRule,
];
