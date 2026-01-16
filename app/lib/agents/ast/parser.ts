/**
 * TypeScript AST Parser
 * Utilise TypeScript Compiler API pour parser et traverser le code
 */

import ts from 'typescript';
import type { ASTLocation, ASTPosition, TraversalContext } from './types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('TypeScriptParser');

/*
 * ============================================================================
 * TYPESCRIPT PARSER
 * ============================================================================
 */

/**
 * Parser TypeScript avec support pour l'analyse AST
 */
export class TypeScriptParser {
  private program: ts.Program | null = null;
  private checker: ts.TypeChecker | null = null;
  private sourceFiles: Map<string, ts.SourceFile> = new Map();

  /*
   * ============================================================================
   * PARSING
   * ============================================================================
   */

  /**
   * Parser plusieurs fichiers TypeScript et créer un Program
   */
  parse(files: string[], compilerOptions?: ts.CompilerOptions): ts.Program {
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      esModuleInterop: true,
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      allowJs: true,
      jsx: ts.JsxEmit.ReactJSX,
      ...compilerOptions,
    };

    this.program = ts.createProgram(files, options);
    this.checker = this.program.getTypeChecker();

    // Cache source files
    for (const sourceFile of this.program.getSourceFiles()) {
      if (!sourceFile.isDeclarationFile) {
        this.sourceFiles.set(sourceFile.fileName, sourceFile);
      }
    }

    logger.debug(`Parsed ${files.length} files`);

    return this.program;
  }

  /**
   * Parser une chaîne de code source
   */
  parseSource(code: string, fileName = 'source.ts'): ts.SourceFile {
    const scriptKind = this.getScriptKind(fileName);

    const sourceFile = ts.createSourceFile(
      fileName,
      code,
      ts.ScriptTarget.ESNext,
      true, // setParentNodes
      scriptKind,
    );

    this.sourceFiles.set(fileName, sourceFile);

    return sourceFile;
  }

  /**
   * Parser un fichier depuis le disque
   */
  async parseFile(filePath: string): Promise<ts.SourceFile> {
    const fs = await import('fs/promises');
    const content = await fs.readFile(filePath, 'utf-8');

    return this.parseSource(content, filePath);
  }

  /*
   * ============================================================================
   * TYPE INFORMATION
   * ============================================================================
   */

  /**
   * Obtenir le type d'un nœud
   */
  getTypeAtLocation(node: ts.Node): ts.Type | undefined {
    if (!this.checker) {
      logger.warn('No type checker available - call parse() first');
      return undefined;
    }

    return this.checker.getTypeAtLocation(node);
  }

  /**
   * Obtenir le symbole d'un nœud
   */
  getSymbolAtLocation(node: ts.Node): ts.Symbol | undefined {
    return this.checker?.getSymbolAtLocation(node);
  }

  /**
   * Obtenir le type sous forme de chaîne
   */
  getTypeString(node: ts.Node): string {
    const type = this.getTypeAtLocation(node);

    if (!type || !this.checker) {
      return 'unknown';
    }

    return this.checker.typeToString(type);
  }

  /**
   * Vérifier si un type est 'any'
   */
  isAnyType(node: ts.Node): boolean {
    const type = this.getTypeAtLocation(node);

    if (!type) {
      return false;
    }

    return (type.flags & ts.TypeFlags.Any) !== 0;
  }

  /*
   * ============================================================================
   * TRAVERSAL
   * ============================================================================
   */

  /**
   * Traverser l'AST avec un visitor pattern
   */
  traverse(
    node: ts.Node,
    visitor: (node: ts.Node, context: TraversalContext) => void | boolean,
    context: TraversalContext = { depth: 0, parent: null, ancestors: [] },
  ): void {
    // Appeler le visitor - si retourne false, arrêter la traversée des enfants
    const shouldContinue = visitor(node, context);

    if (shouldContinue === false) {
      return;
    }

    // Traverser les enfants
    ts.forEachChild(node, (child) => {
      this.traverse(child, visitor, {
        depth: context.depth + 1,
        parent: node,
        ancestors: [...(context.ancestors || []), node],
      });
    });
  }

  /**
   * Traverser avec collecte des résultats
   */
  collect<T>(node: ts.Node, collector: (node: ts.Node, context: TraversalContext) => T | undefined): T[] {
    const results: T[] = [];

    this.traverse(node, (n, ctx) => {
      const result = collector(n, ctx);

      if (result !== undefined) {
        results.push(result);
      }
    });

    return results;
  }

  /**
   * Trouver tous les nœuds d'un certain type
   */
  findNodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
    const results: T[] = [];

    this.traverse(root, (node) => {
      if (predicate(node)) {
        results.push(node);
      }
    });

    return results;
  }

  /**
   * Trouver le premier nœud correspondant
   */
  findFirst<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T | undefined {
    let result: T | undefined;

    this.traverse(root, (node) => {
      if (!result && predicate(node)) {
        result = node;
        return false; // Stop traversal
      }
    });

    return result;
  }

  /*
   * ============================================================================
   * LOCATION UTILITIES
   * ============================================================================
   */

  /**
   * Obtenir la localisation d'un nœud
   */
  getLocation(node: ts.Node, sourceFile: ts.SourceFile): ASTLocation {
    const startPos = node.getStart(sourceFile);
    const endPos = node.getEnd();

    const start = sourceFile.getLineAndCharacterOfPosition(startPos);
    const end = sourceFile.getLineAndCharacterOfPosition(endPos);

    return {
      file: sourceFile.fileName,
      start: {
        line: start.line + 1,
        column: start.character + 1,
        offset: startPos,
      },
      end: {
        line: end.line + 1,
        column: end.character + 1,
        offset: endPos,
      },
    };
  }

  /**
   * Obtenir le texte source d'un nœud
   */
  getNodeText(node: ts.Node, sourceFile?: ts.SourceFile): string {
    const sf = sourceFile || node.getSourceFile();
    return node.getText(sf);
  }

  /**
   * Obtenir le code source d'une ligne
   */
  getLineText(sourceFile: ts.SourceFile, line: number): string {
    const lineStarts = sourceFile.getLineStarts();
    const lineStart = lineStarts[line - 1];
    const lineEnd = lineStarts[line] || sourceFile.getEnd();

    return sourceFile.text.slice(lineStart, lineEnd).replace(/\n$/, '');
  }

  /**
   * Obtenir le code source autour d'un nœud (contexte)
   */
  getCodeContext(node: ts.Node, sourceFile: ts.SourceFile, contextLines = 2): string {
    const location = this.getLocation(node, sourceFile);
    const lines: string[] = [];

    for (
      let i = Math.max(1, location.start.line - contextLines);
      i <= Math.min(sourceFile.getLineStarts().length, location.end.line + contextLines);
      i++
    ) {
      const prefix = i === location.start.line ? '> ' : '  ';
      lines.push(`${prefix}${i}: ${this.getLineText(sourceFile, i)}`);
    }

    return lines.join('\n');
  }

  /*
   * ============================================================================
   * NODE TYPE UTILITIES
   * ============================================================================
   */

  /**
   * Obtenir le nom d'une fonction/méthode
   */
  getFunctionName(node: ts.Node): string {
    if (ts.isFunctionDeclaration(node) && node.name) {
      return node.name.text;
    }

    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
      return node.name.text;
    }

    if (ts.isArrowFunction(node)) {
      const parent = node.parent;

      if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
        return parent.name.text;
      }
    }

    if (ts.isFunctionExpression(node) && node.name) {
      return node.name.text;
    }

    return '<anonymous>';
  }

  /**
   * Obtenir le nom d'une classe
   */
  getClassName(node: ts.ClassDeclaration | ts.ClassExpression): string {
    return node.name?.text || '<anonymous>';
  }

  /**
   * Vérifier si un nœud est exporté
   */
  isExported(node: ts.Node): boolean {
    // Check if node has modifiers (declarations)
    if (!('modifiers' in node)) {
      return false;
    }

    const modifiers = (node as ts.HasModifiers).modifiers;

    if (!modifiers) {
      return false;
    }

    return modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  }

  /**
   * Vérifier si un nœud est async
   */
  isAsync(node: ts.Node): boolean {
    if (!ts.isFunctionLike(node)) {
      return false;
    }

    const modifiers = ts.getModifiers(node as ts.FunctionLikeDeclaration);

    if (!modifiers) {
      return false;
    }

    return modifiers.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
  }

  /*
   * ============================================================================
   * IMPORT ANALYSIS
   * ============================================================================
   */

  /**
   * Obtenir tous les imports d'un fichier
   */
  getImports(sourceFile: ts.SourceFile): ImportInfo[] {
    const imports: ImportInfo[] = [];

    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement)) {
        const moduleSpecifier = statement.moduleSpecifier;

        if (!ts.isStringLiteral(moduleSpecifier)) {
          continue;
        }

        const importInfo: ImportInfo = {
          module: moduleSpecifier.text,
          defaultImport: undefined,
          namedImports: [],
          namespaceImport: undefined,
          isTypeOnly: statement.importClause?.isTypeOnly ?? false,
          location: this.getLocation(statement, sourceFile),
        };

        const clause = statement.importClause;

        if (clause) {
          // Default import
          if (clause.name) {
            importInfo.defaultImport = clause.name.text;
          }

          // Named imports
          if (clause.namedBindings) {
            if (ts.isNamedImports(clause.namedBindings)) {
              for (const element of clause.namedBindings.elements) {
                importInfo.namedImports.push({
                  name: element.name.text,
                  alias: element.propertyName?.text,
                  isTypeOnly: element.isTypeOnly,
                });
              }
            } else if (ts.isNamespaceImport(clause.namedBindings)) {
              importInfo.namespaceImport = clause.namedBindings.name.text;
            }
          }
        }

        imports.push(importInfo);
      }
    }

    return imports;
  }

  /*
   * ============================================================================
   * PRIVATE UTILITIES
   * ============================================================================
   */

  /**
   * Déterminer le type de script basé sur l'extension
   */
  private getScriptKind(fileName: string): ts.ScriptKind {
    const ext = fileName.slice(fileName.lastIndexOf('.'));

    switch (ext) {
      case '.ts':
        return ts.ScriptKind.TS;
      case '.tsx':
        return ts.ScriptKind.TSX;
      case '.js':
        return ts.ScriptKind.JS;
      case '.jsx':
        return ts.ScriptKind.JSX;
      case '.json':
        return ts.ScriptKind.JSON;
      default:
        return ts.ScriptKind.Unknown;
    }
  }

  /*
   * ============================================================================
   * GETTERS
   * ============================================================================
   */

  /**
   * Obtenir le Program TypeScript
   */
  getProgram(): ts.Program | null {
    return this.program;
  }

  /**
   * Obtenir le TypeChecker
   */
  getTypeChecker(): ts.TypeChecker | null {
    return this.checker;
  }

  /**
   * Obtenir un SourceFile en cache
   */
  getSourceFile(fileName: string): ts.SourceFile | undefined {
    return this.sourceFiles.get(fileName);
  }

  /**
   * Nettoyer le cache
   */
  clear(): void {
    this.program = null;
    this.checker = null;
    this.sourceFiles.clear();
  }
}

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Information sur un import
 */
export interface ImportInfo {
  /** Nom du module */
  module: string;

  /** Import par défaut */
  defaultImport?: string;

  /** Imports nommés */
  namedImports: NamedImportInfo[];

  /** Import namespace (import * as X) */
  namespaceImport?: string;

  /** Import de type seulement */
  isTypeOnly: boolean;

  /** Localisation */
  location: ASTLocation;
}

/**
 * Information sur un import nommé
 */
export interface NamedImportInfo {
  /** Nom importé */
  name: string;

  /** Alias (si renommé) */
  alias?: string;

  /** Import de type seulement */
  isTypeOnly: boolean;
}

/*
 * ============================================================================
 * FACTORY FUNCTIONS
 * ============================================================================
 */

/**
 * Créer un nouveau parser
 */
export function createTypeScriptParser(): TypeScriptParser {
  return new TypeScriptParser();
}

/**
 * Parser un fichier rapidement
 */
export function parseSourceFile(code: string, fileName = 'source.ts'): ts.SourceFile {
  const parser = new TypeScriptParser();
  return parser.parseSource(code, fileName);
}

/**
 * Utilitaire pour trouver rapidement des nœuds
 */
export function findNodesOfKind<T extends ts.Node>(sourceFile: ts.SourceFile, kind: ts.SyntaxKind): T[] {
  const parser = new TypeScriptParser();
  return parser.findNodes(sourceFile, (node): node is T => node.kind === kind);
}
