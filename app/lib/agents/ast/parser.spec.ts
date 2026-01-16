/**
 * Tests for TypeScript Parser
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import ts from 'typescript';
import { TypeScriptParser, createTypeScriptParser, parseSourceFile, findNodesOfKind } from './parser';

// Mock logger
vi.mock('~/utils/logger', () => ({
  createScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('TypeScriptParser', () => {
  let parser: TypeScriptParser;

  beforeEach(() => {
    parser = new TypeScriptParser();
  });

  describe('parseSource', () => {
    it('should parse TypeScript code', () => {
      const code = `const x: number = 42;`;
      const sourceFile = parser.parseSource(code);

      expect(sourceFile).toBeDefined();
      expect(sourceFile.fileName).toBe('source.ts');
    });

    it('should parse with custom filename', () => {
      const code = `const x = 42;`;
      const sourceFile = parser.parseSource(code, 'custom.ts');

      expect(sourceFile.fileName).toBe('custom.ts');
    });

    it('should parse TSX files', () => {
      const code = `const Component = () => <div>Hello</div>;`;
      const sourceFile = parser.parseSource(code, 'component.tsx');

      expect(sourceFile.fileName).toBe('component.tsx');
    });

    it('should parse JavaScript files', () => {
      const code = `function add(a, b) { return a + b; }`;
      const sourceFile = parser.parseSource(code, 'utils.js');

      expect(sourceFile.fileName).toBe('utils.js');
    });

    it('should parse JSX files', () => {
      const code = `const App = () => <div>App</div>;`;
      const sourceFile = parser.parseSource(code, 'app.jsx');

      expect(sourceFile.fileName).toBe('app.jsx');
    });

    it('should cache source files', () => {
      const code = `const x = 1;`;
      parser.parseSource(code, 'cached.ts');

      const cached = parser.getSourceFile('cached.ts');
      expect(cached).toBeDefined();
    });
  });

  describe('traverse', () => {
    it('should traverse all nodes', () => {
      const code = `const x = 1; const y = 2;`;
      const sourceFile = parser.parseSource(code);

      const nodeTypes: ts.SyntaxKind[] = [];
      parser.traverse(sourceFile, (node) => {
        nodeTypes.push(node.kind);
      });

      expect(nodeTypes.length).toBeGreaterThan(0);
      expect(nodeTypes).toContain(ts.SyntaxKind.VariableDeclaration);
    });

    it('should stop child traversal when visitor returns false', () => {
      const code = `function outer() { function inner() { const x = 1; } }`;
      const sourceFile = parser.parseSource(code);

      const foundFunctions: string[] = [];
      parser.traverse(sourceFile, (node) => {
        if (ts.isFunctionDeclaration(node) && node.name) {
          foundFunctions.push(node.name.text);

          // Stop traversing into this function's children
          if (node.name.text === 'outer') {
            return false;
          }
        }
      });

      // Should find outer but not inner (child traversal stopped)
      expect(foundFunctions).toContain('outer');
      expect(foundFunctions).not.toContain('inner');
    });

    it('should provide context with depth', () => {
      const code = `function foo() { const x = 1; }`;
      const sourceFile = parser.parseSource(code);

      const depths: number[] = [];
      parser.traverse(sourceFile, (_node, context) => {
        depths.push(context.depth);
      });

      expect(depths).toContain(0);
      expect(Math.max(...depths)).toBeGreaterThan(0);
    });

    it('should track parent and ancestors', () => {
      const code = `const x = { nested: { deep: 1 } };`;
      const sourceFile = parser.parseSource(code);

      let foundAncestors = false;
      parser.traverse(sourceFile, (node, context) => {
        if (ts.isNumericLiteral(node)) {
          expect(context.parent).toBeDefined();
          expect(context.ancestors?.length).toBeGreaterThan(0);
          foundAncestors = true;
        }
      });

      expect(foundAncestors).toBe(true);
    });
  });

  describe('collect', () => {
    it('should collect matching nodes', () => {
      const code = `const a = 1; const b = 2; let c = 3;`;
      const sourceFile = parser.parseSource(code);

      const varNames = parser.collect(sourceFile, (node) => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
          return node.name.text;
        }

        return undefined;
      });

      expect(varNames).toContain('a');
      expect(varNames).toContain('b');
      expect(varNames).toContain('c');
    });
  });

  describe('findNodes', () => {
    it('should find all nodes of a specific type', () => {
      const code = `
        function foo() { return 1; }
        function bar() { return 2; }
      `;
      const sourceFile = parser.parseSource(code);

      const functions = parser.findNodes(sourceFile, ts.isFunctionDeclaration);

      expect(functions).toHaveLength(2);
    });
  });

  describe('findFirst', () => {
    it('should find the first matching node', () => {
      const code = `
        function first() {}
        function second() {}
      `;
      const sourceFile = parser.parseSource(code);

      const first = parser.findFirst(sourceFile, ts.isFunctionDeclaration);

      expect(first).toBeDefined();
      expect(first?.name?.text).toBe('first');
    });

    it('should return undefined if no match', () => {
      const code = `const x = 1;`;
      const sourceFile = parser.parseSource(code);

      const result = parser.findFirst(sourceFile, ts.isClassDeclaration);

      expect(result).toBeUndefined();
    });
  });

  describe('getLocation', () => {
    it('should return correct location', () => {
      const code = `const x = 42;`;
      const sourceFile = parser.parseSource(code);

      const varDecl = parser.findFirst(sourceFile, ts.isVariableDeclaration)!;
      const location = parser.getLocation(varDecl, sourceFile);

      expect(location.file).toBe('source.ts');
      expect(location.start.line).toBe(1);
      expect(location.start.column).toBeGreaterThan(0);
    });
  });

  describe('getNodeText', () => {
    it('should return node text', () => {
      const code = `const greeting = "hello";`;
      const sourceFile = parser.parseSource(code);

      const stringLiteral = parser.findFirst(sourceFile, ts.isStringLiteral)!;
      const text = parser.getNodeText(stringLiteral, sourceFile);

      expect(text).toBe('"hello"');
    });
  });

  describe('getLineText', () => {
    it('should return specific line text', () => {
      const code = `line1\nline2\nline3`;
      const sourceFile = parser.parseSource(code);

      expect(parser.getLineText(sourceFile, 1)).toBe('line1');
      expect(parser.getLineText(sourceFile, 2)).toBe('line2');
      expect(parser.getLineText(sourceFile, 3)).toBe('line3');
    });
  });

  describe('getCodeContext', () => {
    it('should return code with context', () => {
      const code = `line1\nline2\nline3\nline4\nline5`;
      const sourceFile = parser.parseSource(code);

      // Find a node on line 3
      const statements = sourceFile.statements;
      const context = parser.getCodeContext(statements[0], sourceFile, 1);

      expect(context).toContain('1:');
      expect(context).toContain('2:');
    });
  });

  describe('getFunctionName', () => {
    it('should get function declaration name', () => {
      const code = `function myFunc() {}`;
      const sourceFile = parser.parseSource(code);

      const func = parser.findFirst(sourceFile, ts.isFunctionDeclaration)!;
      expect(parser.getFunctionName(func)).toBe('myFunc');
    });

    it('should get method name', () => {
      const code = `class Foo { myMethod() {} }`;
      const sourceFile = parser.parseSource(code);

      const method = parser.findFirst(sourceFile, ts.isMethodDeclaration)!;
      expect(parser.getFunctionName(method)).toBe('myMethod');
    });

    it('should get arrow function name from variable', () => {
      const code = `const myArrow = () => {};`;
      const sourceFile = parser.parseSource(code);

      const arrow = parser.findFirst(sourceFile, ts.isArrowFunction)!;
      expect(parser.getFunctionName(arrow)).toBe('myArrow');
    });

    it('should get function expression name', () => {
      const code = `const x = function named() {};`;
      const sourceFile = parser.parseSource(code);

      const funcExpr = parser.findFirst(sourceFile, ts.isFunctionExpression)!;
      expect(parser.getFunctionName(funcExpr)).toBe('named');
    });

    it('should return anonymous for unnamed functions', () => {
      const code = `const x = function() {};`;
      const sourceFile = parser.parseSource(code);

      const funcExpr = parser.findFirst(sourceFile, ts.isFunctionExpression)!;
      expect(parser.getFunctionName(funcExpr)).toBe('<anonymous>');
    });
  });

  describe('getClassName', () => {
    it('should get class name', () => {
      const code = `class MyClass {}`;
      const sourceFile = parser.parseSource(code);

      const cls = parser.findFirst(sourceFile, ts.isClassDeclaration)!;
      expect(parser.getClassName(cls)).toBe('MyClass');
    });

    it('should return anonymous for unnamed class', () => {
      const code = `export default class {}`;
      const sourceFile = parser.parseSource(code);

      const cls = parser.findFirst(sourceFile, ts.isClassDeclaration)!;
      expect(parser.getClassName(cls)).toBe('<anonymous>');
    });
  });

  describe('isExported', () => {
    it('should detect exported declarations', () => {
      const code = `export function foo() {}`;
      const sourceFile = parser.parseSource(code);

      const func = parser.findFirst(sourceFile, ts.isFunctionDeclaration)!;
      expect(parser.isExported(func)).toBe(true);
    });

    it('should return false for non-exported', () => {
      const code = `function foo() {}`;
      const sourceFile = parser.parseSource(code);

      const func = parser.findFirst(sourceFile, ts.isFunctionDeclaration)!;
      expect(parser.isExported(func)).toBe(false);
    });

    it('should return false for nodes without modifiers', () => {
      const code = `const x = 1;`;
      const sourceFile = parser.parseSource(code);

      const literal = parser.findFirst(sourceFile, ts.isNumericLiteral)!;
      expect(parser.isExported(literal)).toBe(false);
    });
  });

  describe('isAsync', () => {
    it('should detect async functions', () => {
      const code = `async function asyncFunc() {}`;
      const sourceFile = parser.parseSource(code);

      const func = parser.findFirst(sourceFile, ts.isFunctionDeclaration)!;
      expect(parser.isAsync(func)).toBe(true);
    });

    it('should return false for sync functions', () => {
      const code = `function syncFunc() {}`;
      const sourceFile = parser.parseSource(code);

      const func = parser.findFirst(sourceFile, ts.isFunctionDeclaration)!;
      expect(parser.isAsync(func)).toBe(false);
    });

    it('should return false for non-function nodes', () => {
      const code = `const x = 1;`;
      const sourceFile = parser.parseSource(code);

      const literal = parser.findFirst(sourceFile, ts.isNumericLiteral)!;
      expect(parser.isAsync(literal)).toBe(false);
    });
  });

  describe('getImports', () => {
    it('should get default imports', () => {
      const code = `import React from 'react';`;
      const sourceFile = parser.parseSource(code);

      const imports = parser.getImports(sourceFile);

      expect(imports).toHaveLength(1);
      expect(imports[0].module).toBe('react');
      expect(imports[0].defaultImport).toBe('React');
    });

    it('should get named imports', () => {
      const code = `import { useState, useEffect } from 'react';`;
      const sourceFile = parser.parseSource(code);

      const imports = parser.getImports(sourceFile);

      expect(imports).toHaveLength(1);
      expect(imports[0].namedImports).toHaveLength(2);
      expect(imports[0].namedImports.map((n) => n.name)).toContain('useState');
      expect(imports[0].namedImports.map((n) => n.name)).toContain('useEffect');
    });

    it('should get namespace imports', () => {
      const code = `import * as fs from 'fs';`;
      const sourceFile = parser.parseSource(code);

      const imports = parser.getImports(sourceFile);

      expect(imports).toHaveLength(1);
      expect(imports[0].namespaceImport).toBe('fs');
    });

    it('should detect type-only imports', () => {
      const code = `import type { MyType } from './types';`;
      const sourceFile = parser.parseSource(code);

      const imports = parser.getImports(sourceFile);

      expect(imports).toHaveLength(1);
      expect(imports[0].isTypeOnly).toBe(true);
    });

    it('should get aliased imports', () => {
      const code = `import { foo as bar } from './module';`;
      const sourceFile = parser.parseSource(code);

      const imports = parser.getImports(sourceFile);

      expect(imports[0].namedImports[0].name).toBe('bar');
      expect(imports[0].namedImports[0].alias).toBe('foo');
    });
  });

  describe('getTypeAtLocation', () => {
    it('should return undefined without type checker', () => {
      const code = `const x = 1;`;
      const sourceFile = parser.parseSource(code);

      const literal = parser.findFirst(sourceFile, ts.isNumericLiteral)!;
      const type = parser.getTypeAtLocation(literal);

      expect(type).toBeUndefined();
    });
  });

  describe('getSymbolAtLocation', () => {
    it('should return undefined without type checker', () => {
      const code = `const x = 1;`;
      const sourceFile = parser.parseSource(code);

      const varDecl = parser.findFirst(sourceFile, ts.isVariableDeclaration)!;
      const symbol = parser.getSymbolAtLocation(varDecl);

      expect(symbol).toBeUndefined();
    });
  });

  describe('getTypeString', () => {
    it('should return unknown without type checker', () => {
      const code = `const x: number = 1;`;
      const sourceFile = parser.parseSource(code);

      const literal = parser.findFirst(sourceFile, ts.isNumericLiteral)!;
      expect(parser.getTypeString(literal)).toBe('unknown');
    });
  });

  describe('isAnyType', () => {
    it('should return false without type checker', () => {
      const code = `const x: any = 1;`;
      const sourceFile = parser.parseSource(code);

      const varDecl = parser.findFirst(sourceFile, ts.isVariableDeclaration)!;
      expect(parser.isAnyType(varDecl)).toBe(false);
    });
  });

  describe('getters', () => {
    it('should return null program initially', () => {
      expect(parser.getProgram()).toBeNull();
    });

    it('should return null type checker initially', () => {
      expect(parser.getTypeChecker()).toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear cached data', () => {
      parser.parseSource('const x = 1;', 'test.ts');

      expect(parser.getSourceFile('test.ts')).toBeDefined();

      parser.clear();

      expect(parser.getSourceFile('test.ts')).toBeUndefined();
      expect(parser.getProgram()).toBeNull();
      expect(parser.getTypeChecker()).toBeNull();
    });
  });
});

describe('createTypeScriptParser', () => {
  it('should create a parser instance', () => {
    const parser = createTypeScriptParser();
    expect(parser).toBeInstanceOf(TypeScriptParser);
  });
});

describe('parseSourceFile', () => {
  it('should parse source file', () => {
    const sourceFile = parseSourceFile('const x = 1;');
    expect(sourceFile).toBeDefined();
    expect(sourceFile.fileName).toBe('source.ts');
  });

  it('should accept custom filename', () => {
    const sourceFile = parseSourceFile('const x = 1;', 'custom.ts');
    expect(sourceFile.fileName).toBe('custom.ts');
  });
});

describe('findNodesOfKind', () => {
  it('should find nodes by kind', () => {
    const sourceFile = parseSourceFile(`
      function foo() {}
      function bar() {}
    `);

    const funcs = findNodesOfKind<ts.FunctionDeclaration>(sourceFile, ts.SyntaxKind.FunctionDeclaration);

    expect(funcs).toHaveLength(2);
  });
});
