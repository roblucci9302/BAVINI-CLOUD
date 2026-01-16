/**
 * Tests pour le chargeur de mémoire projet
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ProjectMemoryParser,
  ProjectMemoryLoader,
  createProjectMemoryLoader,
  getProjectMemoryLoader,
  resetProjectMemoryLoader,
  loadProjectMemory,
  parseProjectMemory,
  DEFAULT_MEMORY_FILES,
} from './project-memory';
import type { ProjectMemory } from '../types';

/*
 * ============================================================================
 * PARSER TESTS
 * ============================================================================
 */

describe('ProjectMemoryParser', () => {
  let parser: ProjectMemoryParser;

  beforeEach(() => {
    parser = new ProjectMemoryParser();
  });

  describe('Section Extraction', () => {
    it('should parse instructions section', () => {
      const content = `# Instructions

Always use TypeScript.
Never use any type.`;

      const memory = parser.parse(content);

      expect(memory.instructions).toContain('Always use TypeScript');
      expect(memory.instructions).toContain('Never use any type');
    });

    it('should parse context section', () => {
      const content = `# Contexte

This is a React application with Next.js.`;

      const memory = parser.parse(content);

      expect(memory.context).toContain('React application');
    });

    it('should parse multiple sections', () => {
      const content = `# Instructions

Be concise.

# Context

Web app project.

# Constraints

- No external dependencies
- Keep bundle small`;

      const memory = parser.parse(content);

      expect(memory.instructions).toBe('Be concise.');
      expect(memory.context).toBe('Web app project.');
      expect(memory.constraints).toHaveLength(2);
    });

    it('should treat raw content as instructions', () => {
      const content = `Just some raw instructions without headers.
Line two.`;

      const memory = parser.parse(content);

      expect(memory.instructions).toContain('Just some raw instructions');
    });
  });

  describe('List Parsing', () => {
    it('should parse bullet lists with dashes', () => {
      const content = `# Constraints

- First constraint
- Second constraint
- Third constraint`;

      const memory = parser.parse(content);

      expect(memory.constraints).toEqual(['First constraint', 'Second constraint', 'Third constraint']);
    });

    it('should parse numbered lists', () => {
      const content = `# Patterns

1. Use functional components
2. Use hooks
3. Follow DRY principle`;

      const memory = parser.parse(content);

      expect(memory.patterns).toHaveLength(3);
      expect(memory.patterns?.[0]).toBe('Use functional components');
    });

    it('should parse asterisk bullets', () => {
      const content = `# Ignore

* node_modules
* dist
* .env`;

      const memory = parser.parse(content);

      expect(memory.ignore).toContain('node_modules');
      expect(memory.ignore).toContain('dist');
    });
  });

  describe('Code Style Parsing', () => {
    it('should detect tabs indentation', () => {
      const content = `# Style

Use tabs for indentation.`;

      const memory = parser.parse(content);

      expect(memory.codeStyle?.indentation).toBe('tabs');
    });

    it('should detect spaces with size', () => {
      const content = `# Code Style

Use 2 spaces for indentation.`;

      const memory = parser.parse(content);

      expect(memory.codeStyle?.indentation).toBe('spaces');
      expect(memory.codeStyle?.indentSize).toBe(2);
    });

    it('should detect quote preference', () => {
      const content = `# Style

- Single quotes for strings
- No semicolons`;

      const memory = parser.parse(content);

      expect(memory.codeStyle?.quotes).toBe('single');
      expect(memory.codeStyle?.semicolons).toBe(false);
    });

    it('should detect semicolons preference', () => {
      const content = `# Formatting

Always use semicolons.`;

      const memory = parser.parse(content);

      expect(memory.codeStyle?.semicolons).toBe(true);
    });
  });

  describe('Custom Section Parsing', () => {
    it('should parse JSON in custom section', () => {
      const content = `# Custom

\`\`\`json
{
  "feature_flags": {
    "dark_mode": true
  }
}
\`\`\``;

      const memory = parser.parse(content);

      expect(memory.custom).toEqual({
        feature_flags: {
          dark_mode: true,
        },
      });
    });

    it('should parse key-value pairs', () => {
      const content = `# Personnalisé

- max_files: 100
- debug: true
- version: 2.0`;

      const memory = parser.parse(content);

      expect(memory.custom).toEqual({
        max_files: 100,
        debug: true,
        version: 2.0,
      });
    });
  });

  describe('Section Aliases', () => {
    it('should recognize French section names', () => {
      const content = `# Règles

Follow the rules.

# Contraintes

- Rule 1

# À propos

Project description.`;

      const memory = parser.parse(content);

      expect(memory.instructions).toBe('Follow the rules.');
      expect(memory.constraints).toHaveLength(1);
      expect(memory.context).toBe('Project description.');
    });

    it('should recognize English aliases', () => {
      const content = `# Rules

Important rules.

# About

The project.

# Best Practices

- Pattern 1`;

      const memory = parser.parse(content);

      expect(memory.instructions).toBe('Important rules.');
      expect(memory.context).toBe('The project.');
      expect(memory.patterns).toContain('Pattern 1');
    });
  });
});

/*
 * ============================================================================
 * LOADER TESTS
 * ============================================================================
 */

describe('ProjectMemoryLoader', () => {
  let loader: ProjectMemoryLoader;
  let mockFileReader: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetProjectMemoryLoader();
    mockFileReader = vi.fn();
    loader = new ProjectMemoryLoader({ fileReader: mockFileReader });
  });

  describe('File Loading', () => {
    it('should search default file names', async () => {
      mockFileReader.mockResolvedValue(null);

      await loader.load();

      // Should have searched all default files
      expect(mockFileReader).toHaveBeenCalledTimes(DEFAULT_MEMORY_FILES.length);
    });

    it('should return first found file', async () => {
      mockFileReader
        .mockResolvedValueOnce(null) // BAVINI.md not found
        .mockResolvedValueOnce('# Instructions\nFound!'); // CLAUDE.md found

      const result = await loader.load();

      expect(result.memory).not.toBeNull();
      expect(result.memory?.instructions).toBe('Found!');
      expect(result.source).toBe('CLAUDE.md');
    });

    it('should use project root', async () => {
      const loaderWithRoot = new ProjectMemoryLoader({
        projectRoot: '/my/project',
        fileReader: mockFileReader,
      });

      mockFileReader.mockResolvedValue(null);

      await loaderWithRoot.load();

      expect(mockFileReader).toHaveBeenCalledWith('/my/project/BAVINI.md');
    });

    it('should return null when no file found', async () => {
      mockFileReader.mockResolvedValue(null);

      const result = await loader.load();

      expect(result.memory).toBeNull();
      expect(result.source).toBeNull();
    });

    it('should track searched paths', async () => {
      mockFileReader.mockResolvedValue(null);

      const result = await loader.load();

      expect(result.searchedPaths.length).toBeGreaterThan(0);
      expect(result.searchedPaths).toContain('BAVINI.md');
    });

    it('should track errors', async () => {
      mockFileReader.mockRejectedValue(new Error('Permission denied'));

      const result = await loader.load();

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Permission denied');
    });
  });

  describe('Content Loading', () => {
    it('should load from provided content', () => {
      const content = `# Instructions

Test instructions.`;

      const memory = loader.loadFromContent(content);

      expect(memory.instructions).toBe('Test instructions.');
      expect(memory.source).toBe('provided');
      expect(memory.loadedAt).toBeInstanceOf(Date);
    });

    it('should accept custom source name', () => {
      const memory = loader.loadFromContent('Content', 'my-config.md');

      expect(memory.source).toBe('my-config.md');
    });
  });

  describe('Caching', () => {
    it('should cache loaded memory', async () => {
      mockFileReader.mockResolvedValue('# Test\nContent');

      await loader.load();

      const cached = loader.getFromCache('BAVINI.md');
      expect(cached).toBeDefined();
    });

    it('should clear cache', async () => {
      mockFileReader.mockResolvedValue('# Test\nContent');

      await loader.load();
      loader.clearCache();

      const cached = loader.getFromCache('BAVINI.md');
      expect(cached).toBeUndefined();
    });
  });

  describe('Prompt Formatting', () => {
    it('should format memory for prompt', () => {
      const memory: ProjectMemory = {
        instructions: 'Be helpful.',
        context: 'A web app.',
        constraints: ['No jQuery', 'Keep it simple'],
        codeStyle: {
          indentation: 'spaces',
          indentSize: 2,
          quotes: 'single',
          semicolons: false,
        },
        patterns: ['Use hooks'],
        ignore: ['node_modules'],
        source: 'BAVINI.md',
      };

      const formatted = loader.formatForPrompt(memory);

      expect(formatted).toContain('<project-memory>');
      expect(formatted).toContain('</project-memory>');
      expect(formatted).toContain('## Instructions');
      expect(formatted).toContain('Be helpful.');
      expect(formatted).toContain('## Context');
      expect(formatted).toContain('A web app.');
      expect(formatted).toContain('## Constraints');
      expect(formatted).toContain('No jQuery');
      expect(formatted).toContain('## Code Style');
      expect(formatted).toContain('spaces (2)');
      expect(formatted).toContain('single');
      expect(formatted).toContain('## Patterns');
      expect(formatted).toContain('Use hooks');
      expect(formatted).toContain('Source: BAVINI.md');
    });

    it('should handle custom settings', () => {
      const memory: ProjectMemory = {
        custom: { debug: true, max_files: 50 },
      };

      const formatted = loader.formatForPrompt(memory);

      expect(formatted).toContain('## Custom Settings');
      expect(formatted).toContain('"debug": true');
    });

    it('should handle empty memory gracefully', () => {
      const memory: ProjectMemory = {};

      const formatted = loader.formatForPrompt(memory);

      expect(formatted).toContain('<project-memory>');
      expect(formatted).toContain('</project-memory>');
    });
  });
});

/*
 * ============================================================================
 * UTILITY FUNCTIONS TESTS
 * ============================================================================
 */

describe('Utility Functions', () => {
  beforeEach(() => {
    resetProjectMemoryLoader();
  });

  describe('getProjectMemoryLoader', () => {
    it('should return singleton instance', () => {
      const loader1 = getProjectMemoryLoader();
      const loader2 = getProjectMemoryLoader();

      expect(loader1).toBe(loader2);
    });

    it('should reset singleton', () => {
      const loader1 = getProjectMemoryLoader();
      resetProjectMemoryLoader();
      const loader2 = getProjectMemoryLoader();

      expect(loader1).not.toBe(loader2);
    });
  });

  describe('createProjectMemoryLoader', () => {
    it('should create new instances', () => {
      const loader1 = createProjectMemoryLoader();
      const loader2 = createProjectMemoryLoader();

      expect(loader1).not.toBe(loader2);
    });

    it('should accept options', () => {
      const reader = vi.fn().mockResolvedValue(null);
      const loader = createProjectMemoryLoader({
        projectRoot: '/custom',
        fileReader: reader,
      });

      expect(loader).toBeDefined();
    });
  });

  describe('loadProjectMemory', () => {
    it('should load with custom reader', async () => {
      const reader = vi.fn().mockResolvedValue('# Test\nContent');

      const memory = await loadProjectMemory('/project', reader);

      expect(memory).not.toBeNull();
      expect(reader).toHaveBeenCalled();
    });

    it('should return null when not found', async () => {
      const reader = vi.fn().mockResolvedValue(null);

      const memory = await loadProjectMemory('/project', reader);

      expect(memory).toBeNull();
    });
  });

  describe('parseProjectMemory', () => {
    it('should parse content directly', () => {
      const memory = parseProjectMemory(`# Instructions

Be awesome.`);

      expect(memory.instructions).toBe('Be awesome.');
    });
  });
});

/*
 * ============================================================================
 * INTEGRATION TESTS
 * ============================================================================
 */

describe('Integration Tests', () => {
  it('should handle complete BAVINI.md example', () => {
    const baviniMd = `# BAVINI Project Configuration

## Contexte

This is a TypeScript React application using Vite.
The codebase follows functional programming patterns.

## Instructions

- Always use TypeScript with strict mode
- Prefer functional components over class components
- Use React Query for server state
- Use Zustand for client state

## Contraintes

- No jQuery or other legacy libraries
- Bundle size must stay under 500KB
- All API calls must have error handling
- Tests are required for critical paths

## Style de Code

Use 2 spaces for indentation.
Single quotes for strings.
No semicolons.
Follow Prettier defaults.

## Patterns

- Custom hooks for reusable logic
- Compound components for complex UI
- Error boundaries at route level
- Suspense for code splitting

## Ignorer

- node_modules
- dist
- coverage
- .env.local

## Custom

\`\`\`json
{
  "testing": {
    "framework": "vitest",
    "coverage_threshold": 80
  },
  "deployment": {
    "platform": "vercel",
    "preview_branches": true
  }
}
\`\`\`
`;

    const parser = new ProjectMemoryParser();
    const memory = parser.parse(baviniMd);

    // Context
    expect(memory.context).toContain('TypeScript React application');
    expect(memory.context).toContain('functional programming');

    // Instructions
    expect(memory.instructions).toContain('strict mode');
    expect(memory.instructions).toContain('React Query');

    // Constraints
    expect(memory.constraints).toHaveLength(4);
    expect(memory.constraints).toContain('No jQuery or other legacy libraries');
    expect(memory.constraints).toContain('Bundle size must stay under 500KB');

    // Code Style
    expect(memory.codeStyle?.indentation).toBe('spaces');
    expect(memory.codeStyle?.indentSize).toBe(2);
    expect(memory.codeStyle?.quotes).toBe('single');
    expect(memory.codeStyle?.semicolons).toBe(false);

    // Patterns
    expect(memory.patterns).toHaveLength(4);
    expect(memory.patterns).toContain('Custom hooks for reusable logic');

    // Ignore
    expect(memory.ignore).toContain('node_modules');
    expect(memory.ignore).toContain('.env.local');

    // Custom
    expect(memory.custom).toEqual({
      testing: {
        framework: 'vitest',
        coverage_threshold: 80,
      },
      deployment: {
        platform: 'vercel',
        preview_branches: true,
      },
    });
  });
});
