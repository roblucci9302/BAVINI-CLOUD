/**
 * Performance Rules - Règles de performance pour l'analyse AST
 */

import ts from 'typescript';
import { BaseRule, type RuleContext, type RuleExample, type OptionSchema } from '../base-rule';

/*
 * ============================================================================
 * NO SYNC OPERATIONS RULE
 * ============================================================================
 */

/**
 * Éviter les opérations synchrones bloquantes
 */
export class NoSyncOperationsRule extends BaseRule {
  readonly id = 'performance/no-sync-operations';
  readonly name = 'No Synchronous Operations';
  readonly description = "Évite les opérations de fichiers et processus synchrones qui bloquent l'event loop";
  readonly category = 'performance' as const;
  readonly defaultSeverity = 'warning' as const;

  private syncMethods = new Set([
    // File system
    'readFileSync',
    'writeFileSync',
    'appendFileSync',
    'existsSync',
    'statSync',
    'lstatSync',
    'fstatSync',
    'mkdirSync',
    'rmdirSync',
    'readdirSync',
    'unlinkSync',
    'copyFileSync',
    'renameSync',
    'chmodSync',
    'chownSync',
    'accessSync',
    'openSync',
    'closeSync',
    'readSync',
    'writeSync',
    'truncateSync',

    // Child process
    'execSync',
    'execFileSync',
    'spawnSync',

    // Crypto
    'randomFillSync',
    'pbkdf2Sync',
    'scryptSync',
  ]);

  analyze(node: ts.Node, context: RuleContext): void {
    if (!this.isEnabled()) {
      return;
    }

    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      let methodName: string | undefined;

      if (ts.isPropertyAccessExpression(expression)) {
        methodName = expression.name.text;
      } else if (ts.isIdentifier(expression)) {
        methodName = expression.text;
      }

      if (methodName && this.syncMethods.has(methodName)) {
        const asyncVersion = methodName.replace('Sync', '');

        context.report(
          this.createIssue(node, context.sourceFile, `L'opération synchrone '${methodName}' bloque l'event loop.`, {
            suggestion: `Utilisez la version asynchrone: await ${asyncVersion}() avec les promises fs.`,
          }),
        );
      }
    }
  }

  protected getExamples(): RuleExample[] {
    return [
      { description: 'readFileSync bloque', code: 'fs.readFileSync("file.txt")', isValid: false },
      { description: 'execSync bloque', code: 'execSync("command")', isValid: false },
      { description: 'readFile async est OK', code: 'await fs.readFile("file.txt")', isValid: true },
    ];
  }
}

/*
 * ============================================================================
 * MEMO DEPENDENCIES RULE
 * ============================================================================
 */

/**
 * Vérifier les dépendances de useMemo et useCallback
 */
export class MemoDependenciesRule extends BaseRule {
  readonly id = 'performance/memo-dependencies';
  readonly name = 'Memo Dependencies';
  readonly description = 'Vérifie les dépendances de useMemo, useCallback et useEffect';
  readonly category = 'performance' as const;
  readonly defaultSeverity = 'warning' as const;

  private memoHooks = new Set(['useMemo', 'useCallback', 'useEffect', 'useLayoutEffect']);

  analyze(node: ts.Node, context: RuleContext): void {
    if (!this.isEnabled()) {
      return;
    }

    if (!ts.isCallExpression(node)) {
      return;
    }

    const expression = node.expression;
    let hookName: string | undefined;

    if (ts.isIdentifier(expression)) {
      hookName = expression.text;
    }

    if (!hookName || !this.memoHooks.has(hookName)) {
      return;
    }

    const args = node.arguments;

    // Check if dependencies array is provided
    if (args.length < 2) {
      if (hookName === 'useEffect' || hookName === 'useLayoutEffect') {
        context.report(
          this.createIssue(
            node,
            context.sourceFile,
            `${hookName} sans tableau de dépendances s'exécutera à chaque rendu.`,
            {
              suggestion: 'Ajoutez un tableau de dépendances, ou [] pour exécuter une seule fois.',
            },
          ),
        );
      }

      return;
    }

    const depsArg = args[1];

    // Check for empty dependencies with callback using variables
    if (ts.isArrayLiteralExpression(depsArg) && depsArg.elements.length === 0) {
      const callback = args[0];

      if (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) {
        const usedVariables = this.findUsedVariables(callback, context);

        // Filter out known safe globals
        const safeGlobals = new Set([
          'console',
          'window',
          'document',
          'Math',
          'JSON',
          'Date',
          'Array',
          'Object',
          'String',
          'Number',
          'Boolean',
          'Promise',
          'Set',
          'Map',
        ]);
        const externalVars = usedVariables.filter((v) => !safeGlobals.has(v));

        if (externalVars.length > 0) {
          context.report(
            this.createIssue(
              node,
              context.sourceFile,
              `${hookName} avec dépendances vides utilise des variables externes: ${externalVars.slice(0, 3).join(', ')}${externalVars.length > 3 ? '...' : ''}`,
              {
                severity: 'info',
                suggestion: `Considérez ajouter ces variables au tableau de dépendances: [${externalVars.join(', ')}]`,
              },
            ),
          );
        }
      }
    }

    // Check for object/array literals in dependencies (always new reference)
    if (ts.isArrayLiteralExpression(depsArg)) {
      for (const element of depsArg.elements) {
        if (ts.isObjectLiteralExpression(element)) {
          context.report(
            this.createIssue(
              element,
              context.sourceFile,
              'Objet littéral dans les dépendances crée une nouvelle référence à chaque rendu.',
              {
                suggestion: "Utilisez useMemo pour l'objet, ou déstructurez les propriétés individuelles.",
              },
            ),
          );
        }

        if (ts.isArrayLiteralExpression(element)) {
          context.report(
            this.createIssue(
              element,
              context.sourceFile,
              'Tableau littéral dans les dépendances crée une nouvelle référence à chaque rendu.',
              {
                suggestion: 'Utilisez useMemo pour le tableau, ou listez les éléments individuellement.',
              },
            ),
          );
        }

        // Check for inline arrow functions
        if (ts.isArrowFunction(element) || ts.isFunctionExpression(element)) {
          context.report(
            this.createIssue(
              element,
              context.sourceFile,
              'Fonction inline dans les dépendances crée une nouvelle référence à chaque rendu.',
              {
                suggestion: 'Utilisez useCallback pour mémoriser la fonction.',
              },
            ),
          );
        }
      }
    }
  }

  private findUsedVariables(node: ts.Node, context: RuleContext): string[] {
    const variables: string[] = [];
    const localVars = new Set<string>();

    // Collect local variable declarations
    const collectLocals = (n: ts.Node): void => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) {
        localVars.add(n.name.text);
      }

      if (ts.isParameter(n) && ts.isIdentifier(n.name)) {
        localVars.add(n.name.text);
      }

      ts.forEachChild(n, collectLocals);
    };

    // Collect used identifiers
    const collectUsed = (n: ts.Node): void => {
      if (ts.isIdentifier(n)) {
        const name = n.text;
        const parent = n.parent;

        // Skip if it's a property access name (obj.prop -> skip 'prop')
        if (ts.isPropertyAccessExpression(parent) && parent.name === n) {
          return;
        }

        // Skip if it's a declaration
        if (ts.isVariableDeclaration(parent) && parent.name === n) {
          return;
        }

        // Skip if it's a parameter
        if (ts.isParameter(parent) && parent.name === n) {
          return;
        }

        // Skip if it's a type reference
        if (ts.isTypeReferenceNode(parent)) {
          return;
        }

        if (!localVars.has(name) && !variables.includes(name)) {
          variables.push(name);
        }
      }

      ts.forEachChild(n, collectUsed);
    };

    collectLocals(node);
    collectUsed(node);

    return variables;
  }

  protected getExamples(): RuleExample[] {
    return [
      { description: 'useEffect sans dépendances', code: 'useEffect(() => { doSomething(); })', isValid: false },
      { description: 'Objet dans dépendances', code: 'useMemo(() => calc, [{ a: 1 }])', isValid: false },
      { description: 'Dépendances correctes', code: 'useMemo(() => a + b, [a, b])', isValid: true },
    ];
  }
}

/*
 * ============================================================================
 * BUNDLE SIZE RULE
 * ============================================================================
 */

/**
 * Détecter les imports qui augmentent la taille du bundle
 */
export class BundleSizeRule extends BaseRule {
  readonly id = 'performance/bundle-size';
  readonly name = 'Bundle Size';
  readonly description = 'Détecte les imports qui peuvent augmenter significativement la taille du bundle';
  readonly category = 'performance' as const;
  readonly defaultSeverity = 'info' as const;

  // Large packages that should be tree-shaken or avoided
  private largePackages: Record<string, { suggestion: string; severity: 'error' | 'warning' | 'info' }> = {
    lodash: {
      suggestion:
        'Utilisez lodash-es avec tree-shaking ou importez les fonctions individuellement: import debounce from "lodash/debounce"',
      severity: 'warning',
    },
    moment: {
      suggestion: 'Utilisez date-fns ou dayjs qui sont plus légers et supportent le tree-shaking.',
      severity: 'warning',
    },
    jquery: {
      suggestion: "jQuery n'est plus nécessaire avec les APIs DOM modernes. Utilisez document.querySelector et fetch.",
      severity: 'info',
    },
    underscore: {
      suggestion: 'Underscore est obsolète. Utilisez les méthodes natives ES6+ ou lodash-es.',
      severity: 'info',
    },
  };

  // Patterns for imports that should be avoided
  private badImportPatterns = [
    {
      pattern: /^@material-ui\/core$/,
      message: 'Import tout MUI',
      suggestion: 'Importez les composants individuellement: @material-ui/core/Button',
    },
    {
      pattern: /^@mui\/material$/,
      message: 'Import tout MUI v5',
      suggestion: 'Importez les composants individuellement: @mui/material/Button',
    },
    {
      pattern: /^antd$/,
      message: 'Import tout Ant Design',
      suggestion: 'Utilisez babel-plugin-import pour le tree-shaking automatique',
    },
    {
      pattern: /^rxjs$/,
      message: 'Import tout RxJS',
      suggestion: 'Importez les opérateurs individuellement: rxjs/operators',
    },
  ];

  analyze(node: ts.Node, context: RuleContext): void {
    if (!this.isEnabled()) {
      return;
    }

    if (!ts.isImportDeclaration(node)) {
      return;
    }

    const moduleSpecifier = node.moduleSpecifier;

    if (!ts.isStringLiteral(moduleSpecifier)) {
      return;
    }

    const moduleName = moduleSpecifier.text;

    // Check for large packages
    const largePackage = this.largePackages[moduleName];

    if (largePackage) {
      // Check if it's a full import (import X from 'package')
      const clause = node.importClause;

      if (clause && (clause.name || (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)))) {
        context.report(
          this.createIssue(
            node,
            context.sourceFile,
            `Import complet de '${moduleName}' augmente significativement la taille du bundle.`,
            {
              severity: largePackage.severity,
              suggestion: largePackage.suggestion,
            },
          ),
        );
      }
    }

    // Check for bad import patterns
    for (const { pattern, message, suggestion } of this.badImportPatterns) {
      if (pattern.test(moduleName)) {
        const clause = node.importClause;

        // Check for namespace imports or full imports
        if (clause && clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
          context.report(this.createIssue(node, context.sourceFile, `${message}: '${moduleName}'`, { suggestion }));
        }

        // Check for import * as X
        if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          const imports = clause.namedBindings.elements;

          if (imports.length > 10) {
            context.report(
              this.createIssue(
                node,
                context.sourceFile,
                `Import de ${imports.length} éléments depuis '${moduleName}' - considérez regrouper ou lazy load.`,
                {
                  severity: 'info',
                  suggestion: 'Utilisez le code splitting ou des imports dynamiques pour les gros modules.',
                },
              ),
            );
          }
        }
      }
    }

    /*
     * Check for dynamic imports that could be static
     * (Not applicable to import declarations, but we can add later for call expressions)
     */
  }

  protected getExamples(): RuleExample[] {
    return [
      { description: 'Import lodash complet', code: 'import _ from "lodash"', isValid: false },
      { description: 'Import moment', code: 'import moment from "moment"', isValid: false },
      { description: 'Import lodash fonction', code: 'import debounce from "lodash/debounce"', isValid: true },
      { description: 'Import date-fns', code: 'import { format } from "date-fns"', isValid: true },
    ];
  }
}

/*
 * ============================================================================
 * AVOID RE-RENDERS RULE
 * ============================================================================
 */

/**
 * Détecter les patterns causant des re-renders React inutiles
 */
export class AvoidReRendersRule extends BaseRule {
  readonly id = 'performance/avoid-re-renders';
  readonly name = 'Avoid Unnecessary Re-renders';
  readonly description = 'Détecte les patterns React causant des re-renders inutiles';
  readonly category = 'performance' as const;
  readonly defaultSeverity = 'warning' as const;

  analyze(node: ts.Node, context: RuleContext): void {
    if (!this.isEnabled()) {
      return;
    }

    // Check for inline object/array props in JSX
    if (ts.isJsxAttribute(node)) {
      const initializer = node.initializer;

      if (initializer && ts.isJsxExpression(initializer) && initializer.expression) {
        const expr = initializer.expression;

        // Inline object literal
        if (ts.isObjectLiteralExpression(expr)) {
          const attrName = ts.isIdentifier(node.name) ? node.name.text : '';

          // Ignore style prop (common pattern)
          if (attrName !== 'style' && attrName !== 'key') {
            context.report(
              this.createIssue(
                node,
                context.sourceFile,
                `Objet inline dans la prop '${attrName}' cause un re-render à chaque cycle.`,
                {
                  suggestion: "Utilisez useMemo ou définissez l'objet en dehors du composant.",
                },
              ),
            );
          }
        }

        // Inline array literal
        if (ts.isArrayLiteralExpression(expr)) {
          context.report(
            this.createIssue(
              node,
              context.sourceFile,
              'Tableau inline dans les props cause un re-render à chaque cycle.',
              {
                suggestion: 'Utilisez useMemo ou définissez le tableau en dehors du composant.',
              },
            ),
          );
        }

        // Inline arrow function (except for event handlers)
        if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
          const attrName = ts.isIdentifier(node.name) ? node.name.text : '';
          const isEventHandler = attrName.startsWith('on');

          if (!isEventHandler) {
            context.report(
              this.createIssue(
                node,
                context.sourceFile,
                `Fonction inline dans la prop '${attrName}' cause un re-render à chaque cycle.`,
                {
                  suggestion: 'Utilisez useCallback pour mémoriser la fonction.',
                },
              ),
            );
          }
        }
      }
    }

    // Check for .bind() in JSX
    if (ts.isJsxExpression(node) && node.expression) {
      const expr = node.expression;

      if (ts.isCallExpression(expr)) {
        const callee = expr.expression;

        if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name) && callee.name.text === 'bind') {
          context.report(
            this.createIssue(node, context.sourceFile, '.bind() dans JSX crée une nouvelle fonction à chaque render.', {
              suggestion: 'Utilisez une arrow function dans le constructeur ou useCallback.',
            }),
          );
        }
      }
    }
  }

  protected getExamples(): RuleExample[] {
    return [
      { description: 'Objet inline dans props', code: '<Component data={{ a: 1 }} />', isValid: false },
      { description: 'Function inline non-event', code: '<Component render={() => <div />} />', isValid: false },
      { description: '.bind() dans JSX', code: '<button onClick={this.handleClick.bind(this)} />', isValid: false },
      { description: 'Event handler inline OK', code: '<button onClick={() => doSomething()} />', isValid: true },
    ];
  }
}

/*
 * ============================================================================
 * EXPORTS
 * ============================================================================
 */

export const PERFORMANCE_RULES = [NoSyncOperationsRule, MemoDependenciesRule, BundleSizeRule, AvoidReRendersRule];
