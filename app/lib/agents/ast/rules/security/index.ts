/**
 * Security Rules - Règles de sécurité pour l'analyse AST
 */

import ts from 'typescript';
import { BaseRule, type RuleContext, type RuleExample } from '../base-rule';

/*
 * ============================================================================
 * NO EVAL RULE
 * ============================================================================
 */

/**
 * Interdire l'utilisation de eval() et Function() dynamique
 */
export class NoEvalRule extends BaseRule {
  readonly id = 'security/no-eval';
  readonly name = 'No eval()';
  readonly description = "Interdit l'utilisation de eval() qui peut exécuter du code arbitraire";
  readonly category = 'security' as const;
  readonly defaultSeverity = 'error' as const;

  analyze(node: ts.Node, context: RuleContext): void {
    if (!this.isEnabled()) {
      return;
    }

    // Check for eval() calls
    if (ts.isCallExpression(node)) {
      const expression = node.expression;

      if (ts.isIdentifier(expression) && expression.text === 'eval') {
        context.report(
          this.createIssue(
            node,
            context.sourceFile,
            'eval() est dangereux et ne devrait pas être utilisé. Il peut exécuter du code arbitraire.',
            {
              suggestion:
                "Utilisez JSON.parse() pour les données JSON, ou restructurez votre code pour éviter l'évaluation dynamique.",
            },
          ),
        );
      }
    }

    // Check for new Function() - similar to eval
    if (ts.isNewExpression(node)) {
      const expression = node.expression;

      if (ts.isIdentifier(expression) && expression.text === 'Function') {
        context.report(
          this.createIssue(node, context.sourceFile, 'new Function() est similaire à eval() et devrait être évité.', {
            severity: 'warning',
            suggestion: 'Restructurez votre code pour éviter la création dynamique de fonctions.',
          }),
        );
      }
    }

    // Check for setTimeout/setInterval with string argument
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      let fnName: string | undefined;

      if (ts.isIdentifier(expression)) {
        fnName = expression.text;
      } else if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.name)) {
        fnName = expression.name.text;
      }

      if ((fnName === 'setTimeout' || fnName === 'setInterval') && node.arguments.length > 0) {
        const firstArg = node.arguments[0];

        if (ts.isStringLiteral(firstArg) || ts.isTemplateExpression(firstArg)) {
          context.report(
            this.createIssue(
              node,
              context.sourceFile,
              `${fnName} avec une chaîne de caractères fonctionne comme eval() et est dangereux.`,
              {
                suggestion: `Utilisez une fonction au lieu d'une chaîne: ${fnName}(() => { ... }, delay)`,
              },
            ),
          );
        }
      }
    }
  }

  protected getExamples(): RuleExample[] {
    return [
      { description: 'eval() est interdit', code: 'eval("alert(1)")', isValid: false },
      { description: 'new Function() est interdit', code: 'new Function("return 1")', isValid: false },
      { description: 'setTimeout avec string est interdit', code: 'setTimeout("alert(1)", 100)', isValid: false },
      { description: 'setTimeout avec fonction est OK', code: 'setTimeout(() => console.log(1), 100)', isValid: true },
    ];
  }
}

/*
 * ============================================================================
 * NO INNERHTML RULE
 * ============================================================================
 */

/**
 * Interdire innerHTML et dangerouslySetInnerHTML pour prévenir XSS
 */
export class NoInnerHTMLRule extends BaseRule {
  readonly id = 'security/no-innerhtml';
  readonly name = 'No innerHTML';
  readonly description = "Interdit l'assignation directe de innerHTML pour prévenir les attaques XSS";
  readonly category = 'security' as const;
  readonly defaultSeverity = 'error' as const;

  analyze(node: ts.Node, context: RuleContext): void {
    if (!this.isEnabled()) {
      return;
    }

    // Check for .innerHTML assignment
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = node.left;

      if (ts.isPropertyAccessExpression(left) && (left.name.text === 'innerHTML' || left.name.text === 'outerHTML')) {
        context.report(
          this.createIssue(
            node,
            context.sourceFile,
            `L'assignation directe de ${left.name.text} peut mener à des vulnérabilités XSS.`,
            {
              suggestion: 'Utilisez textContent pour du texte brut, ou sanitizez le HTML avec DOMPurify.',
            },
          ),
        );
      }
    }

    // Check for dangerouslySetInnerHTML in JSX
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === 'dangerouslySetInnerHTML') {
      context.report(
        this.createIssue(
          node,
          context.sourceFile,
          'dangerouslySetInnerHTML peut mener à des vulnérabilités XSS. Assurez-vous que le contenu est sanitizé.',
          {
            severity: 'warning',
            suggestion: 'Sanitizez le contenu HTML avec DOMPurify avant de le rendre.',
          },
        ),
      );
    }

    // Check for document.write
    if (ts.isCallExpression(node)) {
      const expression = node.expression;

      if (ts.isPropertyAccessExpression(expression)) {
        const chain = this.getPropertyAccessChain(expression);

        if (chain.length === 2 && chain[0] === 'document' && (chain[1] === 'write' || chain[1] === 'writeln')) {
          context.report(
            this.createIssue(
              node,
              context.sourceFile,
              'document.write() est dangereux et peut mener à des vulnérabilités XSS.',
              {
                suggestion: 'Utilisez des méthodes DOM modernes comme appendChild() ou innerHTML avec sanitization.',
              },
            ),
          );
        }
      }
    }
  }

  protected getExamples(): RuleExample[] {
    return [
      { description: 'innerHTML est interdit', code: 'element.innerHTML = userInput', isValid: false },
      {
        description: 'dangerouslySetInnerHTML génère un warning',
        code: '<div dangerouslySetInnerHTML={{__html: html}} />',
        isValid: false,
      },
      { description: 'textContent est OK', code: 'element.textContent = userInput', isValid: true },
    ];
  }
}

/*
 * ============================================================================
 * SQL INJECTION RULE
 * ============================================================================
 */

/**
 * Détecter les potentielles injections SQL
 */
export class SQLInjectionRule extends BaseRule {
  readonly id = 'security/sql-injection';
  readonly name = 'SQL Injection Detection';
  readonly description = "Détecte les potentielles vulnérabilités d'injection SQL";
  readonly category = 'security' as const;
  readonly defaultSeverity = 'error' as const;

  private sqlPatterns = [
    /SELECT\s+.+\s+FROM/i,
    /INSERT\s+INTO/i,
    /UPDATE\s+.+\s+SET/i,
    /DELETE\s+FROM/i,
    /DROP\s+(TABLE|DATABASE)/i,
    /EXEC(UTE)?\s*\(/i,
  ];

  analyze(node: ts.Node, context: RuleContext): void {
    if (!this.isEnabled()) {
      return;
    }

    // Check template literals with SQL patterns and variables
    if (ts.isTemplateExpression(node)) {
      const text = this.getNodeText(node, context.sourceFile);

      if (this.containsSQLPattern(text) && node.templateSpans.length > 0) {
        // Has variables interpolated in SQL
        context.report(
          this.createIssue(
            node,
            context.sourceFile,
            'Potentielle injection SQL détectée. Ne pas interpoler de variables directement dans les requêtes SQL.',
            {
              suggestion: 'Utilisez des requêtes paramétrées ou des prepared statements.',
            },
          ),
        );
      }
    }

    // Check string concatenation with SQL patterns
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const text = this.getNodeText(node, context.sourceFile);

      if (this.containsSQLPattern(text) && this.hasVariableInConcat(node)) {
        context.report(
          this.createIssue(
            node,
            context.sourceFile,
            'Potentielle injection SQL: concaténation de chaîne avec SQL détectée.',
            {
              suggestion: 'Utilisez des requêtes paramétrées au lieu de la concaténation.',
            },
          ),
        );
      }
    }

    // Check for raw query calls with template literals
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      let methodName: string | undefined;

      if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.name)) {
        methodName = expression.name.text;
      }

      // Common raw query methods
      const rawQueryMethods = ['$queryRaw', 'raw', 'rawQuery', '$executeRaw', 'query'];

      if (methodName && rawQueryMethods.includes(methodName)) {
        const firstArg = node.arguments[0];

        if (firstArg && ts.isTemplateExpression(firstArg) && firstArg.templateSpans.length > 0) {
          context.report(
            this.createIssue(
              node,
              context.sourceFile,
              `${methodName}() avec interpolation de variables peut être vulnérable aux injections SQL.`,
              {
                severity: 'warning',
                suggestion: "Utilisez les placeholders du framework (?, $1, :param) au lieu de l'interpolation.",
              },
            ),
          );
        }
      }
    }
  }

  private containsSQLPattern(text: string): boolean {
    return this.sqlPatterns.some((pattern) => pattern.test(text));
  }

  private hasVariableInConcat(node: ts.BinaryExpression): boolean {
    const left = node.left;
    const right = node.right;

    const isVariable = (n: ts.Node): boolean => {
      return ts.isIdentifier(n) || ts.isPropertyAccessExpression(n) || ts.isCallExpression(n);
    };

    return (
      isVariable(left) ||
      isVariable(right) ||
      (ts.isBinaryExpression(left) && this.hasVariableInConcat(left)) ||
      (ts.isBinaryExpression(right) && this.hasVariableInConcat(right))
    );
  }

  protected getExamples(): RuleExample[] {
    return [
      {
        description: 'Template literal SQL avec variable',
        code: '`SELECT * FROM users WHERE id = ${userId}`',
        isValid: false,
      },
      { description: 'Concaténation SQL', code: '"SELECT * FROM users WHERE name = \'" + name + "\'"', isValid: false },
      {
        description: 'Requête paramétrée est OK',
        code: 'db.query("SELECT * FROM users WHERE id = ?", [userId])',
        isValid: true,
      },
    ];
  }
}

/*
 * ============================================================================
 * XSS PREVENTION RULE
 * ============================================================================
 */

/**
 * Prévenir les vulnérabilités XSS
 */
export class XSSPreventionRule extends BaseRule {
  readonly id = 'security/xss-prevention';
  readonly name = 'XSS Prevention';
  readonly description = 'Détecte les pratiques pouvant mener à des attaques XSS';
  readonly category = 'security' as const;
  readonly defaultSeverity = 'warning' as const;

  analyze(node: ts.Node, context: RuleContext): void {
    if (!this.isEnabled()) {
      return;
    }

    // Check for location.href with user input
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = node.left;

      if (ts.isPropertyAccessExpression(left)) {
        const chain = this.getPropertyAccessChain(left);
        const propPath = chain.join('.');

        const dangerousProps = [
          'location.href',
          'location.replace',
          'location.assign',
          'window.location',
          'document.location',
        ];

        if (dangerousProps.some((p) => propPath.includes(p))) {
          const right = node.right;

          // Check if right side contains user input indicators
          if (this.mightContainUserInput(right)) {
            context.report(
              this.createIssue(
                node,
                context.sourceFile,
                'Manipulation de location avec potentielle entrée utilisateur peut mener à des redirections malveillantes.',
                {
                  suggestion: 'Validez et sanitizez les URLs avant de les utiliser pour la redirection.',
                },
              ),
            );
          }
        }
      }
    }

    // Check for href in JSX with javascript: protocol
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === 'href') {
      const initializer = node.initializer;

      if (initializer) {
        let value: string | undefined;

        if (ts.isStringLiteral(initializer)) {
          value = initializer.text;
        } else if (
          ts.isJsxExpression(initializer) &&
          initializer.expression &&
          ts.isStringLiteral(initializer.expression)
        ) {
          value = initializer.expression.text;
        }

        if (value?.toLowerCase().startsWith('javascript:')) {
          context.report(
            this.createIssue(
              node,
              context.sourceFile,
              'Les URLs javascript: peuvent être utilisées pour des attaques XSS.',
              {
                severity: 'error',
                suggestion: 'Utilisez des handlers onClick au lieu de javascript: URLs.',
              },
            ),
          );
        }
      }
    }

    // Check for postMessage without origin check
    if (ts.isCallExpression(node)) {
      const expression = node.expression;

      if (
        ts.isPropertyAccessExpression(expression) &&
        ts.isIdentifier(expression.name) &&
        expression.name.text === 'addEventListener'
      ) {
        const args = node.arguments;

        if (args.length >= 2 && ts.isStringLiteral(args[0]) && args[0].text === 'message') {
          // Check if the handler validates origin
          const handler = args[1];

          if (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler)) {
            const body = handler.body;
            const bodyText = ts.isBlock(body) ? this.getNodeText(body, context.sourceFile) : '';

            if (!bodyText.includes('origin') && !bodyText.includes('source')) {
              context.report(
                this.createIssue(
                  node,
                  context.sourceFile,
                  "Message event handler sans vérification d'origin peut être vulnérable.",
                  {
                    suggestion: 'Vérifiez event.origin avant de traiter les messages postMessage.',
                  },
                ),
              );
            }
          }
        }
      }
    }
  }

  private mightContainUserInput(node: ts.Node): boolean {
    const text = this.getNodeText(node).toLowerCase();

    const userInputIndicators = [
      'params',
      'query',
      'search',
      'hash',
      'userinput',
      'input',
      'request',
      'req.',
      'body',
      'formdata',
    ];

    return userInputIndicators.some((indicator) => text.includes(indicator));
  }

  protected getExamples(): RuleExample[] {
    return [
      { description: 'javascript: URL est interdit', code: '<a href="javascript:alert(1)">Click</a>', isValid: false },
      {
        description: 'postMessage sans vérification origin',
        code: 'window.addEventListener("message", (e) => handle(e.data))',
        isValid: false,
      },
      {
        description: 'postMessage avec vérification origin',
        code: 'window.addEventListener("message", (e) => { if (e.origin === "https://trusted.com") handle(e.data) })',
        isValid: true,
      },
    ];
  }
}

/*
 * ============================================================================
 * EXPORTS
 * ============================================================================
 */

export const SECURITY_RULES = [NoEvalRule, NoInnerHTMLRule, SQLInjectionRule, XSSPreventionRule];
