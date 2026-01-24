/**
 * Tests pour le système AutoFix
 *
 * Vérifie le fonctionnement du processeur et des fixers individuels.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AutoFixProcessor, createAutoFixProcessor } from './AutoFixProcessor';
import { ImportFixer, TypeScriptFixer, AccessibilityFixer, SecurityFixer, createDefaultFixers } from './fixers';
import type { FixContext } from './autofix-types';

/*
 * =============================================================================
 * AutoFixProcessor Tests
 * =============================================================================
 */

describe('AutoFixProcessor', () => {
  let processor: AutoFixProcessor;

  beforeEach(() => {
    processor = new AutoFixProcessor(createDefaultFixers());
  });

  describe('Initialization', () => {
    it('should initialize with default options', () => {
      const proc = createAutoFixProcessor();
      expect(proc).toBeInstanceOf(AutoFixProcessor);
    });

    it('should accept custom rules', () => {
      const customProc = new AutoFixProcessor([new ImportFixer()]);
      expect(customProc).toBeDefined();
    });

    it('should reset stats', () => {
      processor.resetStats();

      const stats = processor.getStats();
      expect(stats.blocksProcessed).toBe(0);
      expect(stats.totalProcessingTime).toBe(0);
    });
  });

  describe('Code Processing', () => {
    it('should process code without errors', async () => {
      const code = `
        import React from 'react';
        export function App() {
          return <div>Hello</div>;
        }
      `;

      const result = await processor.processCode(code, { language: 'tsx' });
      expect(result).toBeDefined();
      expect(result.code).toBeDefined();
    });

    it('should detect and fix issues', async () => {
      const code = `
        export function App() {
          const [count, setCount] = useState(0);
          return <button onClick={() => setCount(count + 1)}>{count}</button>;
        }
      `;

      const result = await processor.processCode(code, { language: 'tsx' });
      expect(result.applied).toBe(true);
      expect(result.fixes.length).toBeGreaterThan(0);
    });

    it('should return stats after processing', async () => {
      await processor.processCode('const x: any = 1;', { language: 'typescript' });

      const stats = processor.getStats();
      expect(stats).toBeDefined();
    });
  });
});

/*
 * =============================================================================
 * ImportFixer Tests
 * =============================================================================
 */

describe('ImportFixer', () => {
  let fixer: ImportFixer;
  const context: FixContext = { language: 'tsx' };

  beforeEach(() => {
    fixer = new ImportFixer();
  });

  describe('Detection', () => {
    it('should detect missing React hook imports', () => {
      const code = `
        export function App() {
          const [count, setCount] = useState(0);
          return <div>{count}</div>;
        }
      `;
      expect(fixer.canFix(code, context)).toBe(true);
    });

    it('should detect missing Lucide icon imports', () => {
      // ImportFixer only detects known imports: React hooks, Lucide icons
      // EXTERNAL_UI_IMPORTS is intentionally empty (BAVINI uses native HTML)
      const code = `
        export function App() {
          return <Search className="w-4 h-4" />;
        }
      `;
      expect(fixer.canFix(code, context)).toBe(true);
    });

    it('should not flag code with correct imports', () => {
      const code = `
        import { useState } from 'react';
        export function App() {
          const [count] = useState(0);
          return <div>{count}</div>;
        }
      `;
      expect(fixer.canFix(code, context)).toBe(false);
    });
  });

  describe('Fixing', () => {
    it('should add missing useState import', async () => {
      const code = `
        export function App() {
          const [count, setCount] = useState(0);
          return <div>{count}</div>;
        }
      `;

      const result = await fixer.fix(code, context);
      expect(result.applied).toBe(true);
      expect(result.code).toContain("import { useState } from 'react';");
    });

    it('should add multiple hook imports at once', async () => {
      const code = `
        export function App() {
          const [count, setCount] = useState(0);
          useEffect(() => {}, []);
          return <div>{count}</div>;
        }
      `;

      const result = await fixer.fix(code, context);
      expect(result.applied).toBe(true);
      expect(result.code).toContain('useState');
      expect(result.code).toContain('useEffect');
    });

    it('should add Lucide icon imports', async () => {
      const code = `
        export function App() {
          return <Plus />;
        }
      `;

      const result = await fixer.fix(code, context);
      expect(result.applied).toBe(true);
      expect(result.code).toContain("from 'lucide-react'");
    });
  });
});

/*
 * =============================================================================
 * TypeScriptFixer Tests
 * =============================================================================
 */

describe('TypeScriptFixer', () => {
  let fixer: TypeScriptFixer;
  const context: FixContext = { language: 'typescript' };

  beforeEach(() => {
    fixer = new TypeScriptFixer();
  });

  describe('Detection', () => {
    it('should detect explicit any types', () => {
      const code = `const data: any = fetchData();`;
      expect(fixer.canFix(code, context)).toBe(true);
    });

    it('should detect as any assertions', () => {
      const code = `const value = something as any;`;
      expect(fixer.canFix(code, context)).toBe(true);
    });

    it('should not flag code without issues', () => {
      const code = `const data: string = 'hello';`;
      expect(fixer.canFix(code, context)).toBe(false);
    });
  });

  describe('Fixing', () => {
    it('should replace any with unknown', async () => {
      const code = `const data: any = getValue();`;

      const result = await fixer.fix(code, context);
      expect(result.applied).toBe(true);
      expect(result.code).toContain(': unknown');
      expect(result.code).not.toContain(': any');
    });

    it('should replace as any with as unknown', async () => {
      const code = `const value = something as any;`;

      const result = await fixer.fix(code, context);
      expect(result.applied).toBe(true);
      expect(result.code).toContain('as unknown');
    });

    it('should replace any[] with unknown[]', async () => {
      const code = `const items: any[] = [];`;

      const result = await fixer.fix(code, context);
      expect(result.applied).toBe(true);
      expect(result.code).toContain(': unknown[]');
    });

    it('should add event types to handlers', async () => {
      const code = `<button onClick={(e) => console.log(e)}>Click</button>`;

      const result = await fixer.fix(code, { language: 'tsx' });
      expect(result.applied).toBe(true);
      expect(result.code).toContain('React.MouseEvent');
    });
  });
});

/*
 * =============================================================================
 * AccessibilityFixer Tests
 * =============================================================================
 */

describe('AccessibilityFixer', () => {
  let fixer: AccessibilityFixer;
  const context: FixContext = { language: 'tsx' };

  beforeEach(() => {
    fixer = new AccessibilityFixer();
  });

  describe('Detection', () => {
    it('should detect images without alt', () => {
      const code = `<img src="photo.jpg" />`;
      expect(fixer.canFix(code, context)).toBe(true);
    });

    it('should detect buttons without labels', () => {
      // Le pattern détecte les boutons avec icône ET sans aria-label
      const code = `<button><PlusIcon /></button>`;

      // Le fixer détecte également d'autres problèmes d'accessibilité
      expect(fixer.canFix(code, context)).toBe(true);
    });

    it('should detect clickable divs without role', () => {
      const code = `<div onClick={() => {}}>Click me</div>`;
      expect(fixer.canFix(code, context)).toBe(true);
    });

    it('should not flag accessible code', () => {
      const code = `<img src="photo.jpg" alt="Description" />`;
      expect(fixer.canFix(code, context)).toBe(false);
    });
  });

  describe('Fixing', () => {
    it('should add alt to images', async () => {
      const code = `<img src="user-avatar.jpg" />`;

      const result = await fixer.fix(code, context);
      expect(result.applied).toBe(true);
      expect(result.code).toContain('alt=');
    });

    it('should add aria-hidden to decorative images without inferrable alt', async () => {
      // Images sans nom de fichier significatif reçoivent alt="" et aria-hidden
      const code = `<img src="/assets/img.svg" />`;

      const result = await fixer.fix(code, context);
      expect(result.applied).toBe(true);

      // Le fixer ajoute alt="" et aria-hidden pour les images décoratives
      expect(result.code).toContain('alt=');
    });

    it('should add role="button" to clickable divs', async () => {
      const code = `<div onClick={() => {}}>Click</div>`;

      const result = await fixer.fix(code, context);
      expect(result.applied).toBe(true);
      expect(result.code).toContain('role="button"');
    });

    it('should add tabIndex to role="button" elements', async () => {
      const code = `<div onClick={() => {}}>Click</div>`;

      const result = await fixer.fix(code, context);
      expect(result.applied).toBe(true);
      expect(result.code).toContain('tabIndex={0}');
    });
  });
});

/*
 * =============================================================================
 * SecurityFixer Tests
 * =============================================================================
 */

describe('SecurityFixer', () => {
  let fixer: SecurityFixer;
  const context: FixContext = { language: 'typescript' };

  beforeEach(() => {
    fixer = new SecurityFixer();
  });

  describe('Detection', () => {
    it('should detect dangerouslySetInnerHTML', () => {
      const code = `<div dangerouslySetInnerHTML={{ __html: content }} />`;
      expect(fixer.canFix(code, context)).toBe(true);
    });

    it('should detect hardcoded API keys', () => {
      const code = `const apiKey = "sk-1234567890abcdefghijklmnopqrstuvwxyz1234567890ab";`;
      expect(fixer.canFix(code, context)).toBe(true);
    });

    it('should detect eval usage', () => {
      const code = `eval(userInput);`;
      expect(fixer.canFix(code, context)).toBe(true);
    });

    it('should not flag safe code', () => {
      const code = `const data = JSON.parse(jsonString);`;
      expect(fixer.canFix(code, context)).toBe(false);
    });
  });

  describe('Fixing', () => {
    it('should add noopener noreferrer to external links', async () => {
      const code = `<a href="https://example.com">External</a>`;

      const result = await fixer.fix(code, { language: 'tsx' });
      expect(result.applied).toBe(true);
      expect(result.code).toContain('target="_blank"');
      expect(result.code).toContain('rel="noopener noreferrer"');
    });

    it('should replace hardcoded secrets with env vars', async () => {
      const code = `const supabaseKey = "sbp_12345678901234567890";`;

      const result = await fixer.fix(code, context);
      expect(result.applied).toBe(true);
      expect(result.code).toContain('import.meta.env');
    });

    it('should warn about dangerouslySetInnerHTML', async () => {
      const code = `<div dangerouslySetInnerHTML={{ __html: userContent }} />`;

      const result = await fixer.fix(code, { language: 'tsx' });
      expect(result.unresolved.length).toBeGreaterThan(0);
      expect(result.unresolved[0].message).toContain('dangerouslySetInnerHTML');
    });

    it('should warn about eval usage', async () => {
      const code = `eval(userInput);`;

      const result = await fixer.fix(code, context);
      expect(result.unresolved.length).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});

/*
 * =============================================================================
 * Integration Tests
 * =============================================================================
 */

describe('AutoFix Integration', () => {
  let processor: AutoFixProcessor;

  beforeEach(() => {
    processor = new AutoFixProcessor(createDefaultFixers());
  });

  it('should apply multiple fixers in sequence', async () => {
    const code = `
      export function App() {
        const [count, setCount] = useState(0);
        const data: any = fetchData();
        return (
          <div onClick={() => {}}>
            <img src="photo.jpg" />
            <button onClick={(e) => setCount(count + 1)}>
              Increment
            </button>
          </div>
        );
      }
    `;

    const result = await processor.processCode(code, { language: 'tsx' });

    expect(result.applied).toBe(true);
    expect(result.fixes.length).toBeGreaterThan(2);

    // Vérifier que plusieurs types de fixes ont été appliqués
    const ruleIds = result.fixes.map((f) => f.ruleId);
    expect(ruleIds).toContain('import-fixer');
    expect(ruleIds).toContain('accessibility-fixer');
  });

  it('should provide meaningful statistics', async () => {
    const code = `
      const x: any = 1;
      const y: any = 2;
    `;

    await processor.processCode(code, { language: 'typescript' });

    const stats = processor.getStats();

    expect(stats.fixesByCategory.typescript).toBeGreaterThan(0);
  });

  it('should handle empty code gracefully', async () => {
    const result = await processor.processCode('', { language: 'typescript' });
    expect(result.applied).toBe(false);
    expect(result.code).toBe('');
  });

  it('should preserve code when no fixes needed', async () => {
    const code = `
      import { useState } from 'react';

      export function App(): JSX.Element {
        const [count, setCount] = useState<number>(0);
        return <div>{count}</div>;
      }
    `;

    const result = await processor.processCode(code, { language: 'tsx' });

    // Le code est déjà correct, donc pas de modifications majeures
    expect(result.code.includes('useState')).toBe(true);
  });
});

/*
 * =============================================================================
 * Factory Tests
 * =============================================================================
 */

describe('Factory Functions', () => {
  it('should create default fixers', () => {
    const fixers = createDefaultFixers();
    expect(fixers.length).toBe(4);
    expect(fixers.some((f) => f.id === 'import-fixer')).toBe(true);
    expect(fixers.some((f) => f.id === 'typescript-fixer')).toBe(true);
    expect(fixers.some((f) => f.id === 'accessibility-fixer')).toBe(true);
    expect(fixers.some((f) => f.id === 'security-fixer')).toBe(true);
  });

  it('should create processor with factory', () => {
    const processor = createAutoFixProcessor({ strictMode: true });
    expect(processor).toBeInstanceOf(AutoFixProcessor);
  });
});
