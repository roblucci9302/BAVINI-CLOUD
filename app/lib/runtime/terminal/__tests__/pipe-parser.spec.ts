/**
 * =============================================================================
 * Tests: Pipe Parser (pipe-parser.ts)
 * =============================================================================
 * FIX 3.2: Tests for shell pipe and redirection parsing.
 * =============================================================================
 */

import { describe, it, expect } from 'vitest';
import {
  hasPipeOperators,
  parsePipeline,
  formatPipeline,
} from '../pipe-parser';

describe('hasPipeOperators', () => {
  describe('should return true for', () => {
    it('pipe operator', () => {
      expect(hasPipeOperators('cat file.txt | grep test')).toBe(true);
      expect(hasPipeOperators('ls | wc -l')).toBe(true);
    });

    it('output redirect', () => {
      expect(hasPipeOperators('echo hello > file.txt')).toBe(true);
      expect(hasPipeOperators('cat file >> log.txt')).toBe(true);
    });

    it('input redirect', () => {
      expect(hasPipeOperators('sort < data.txt')).toBe(true);
    });
  });

  describe('should return false for', () => {
    it('simple commands', () => {
      expect(hasPipeOperators('ls -la')).toBe(false);
      expect(hasPipeOperators('echo hello world')).toBe(false);
    });

    it('pipe in single quotes', () => {
      expect(hasPipeOperators("echo 'hello | world'")).toBe(false);
    });

    it('pipe in double quotes', () => {
      expect(hasPipeOperators('echo "hello | world"')).toBe(false);
    });

    it('escaped pipe', () => {
      expect(hasPipeOperators('echo hello \\| world')).toBe(false);
    });

    it('redirect in quotes', () => {
      expect(hasPipeOperators('echo "foo > bar"')).toBe(false);
      expect(hasPipeOperators("echo 'foo < bar'")).toBe(false);
    });
  });
});

describe('parsePipeline', () => {
  describe('simple commands', () => {
    it('should parse simple command without pipes', () => {
      const result = parsePipeline('ls -la /home');

      expect(result.isSimple).toBe(true);
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].command).toBe('ls');
      expect(result.commands[0].args).toEqual(['-la', '/home']);
    });

    it('should parse command with quoted arguments', () => {
      const result = parsePipeline('echo "hello world"');

      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].command).toBe('echo');
      expect(result.commands[0].args).toEqual(['hello world']);
    });
  });

  describe('pipes', () => {
    it('should parse simple pipe', () => {
      const result = parsePipeline('cat file.txt | grep test');

      expect(result.isSimple).toBe(false);
      expect(result.commands).toHaveLength(2);
      expect(result.commands[0].command).toBe('cat');
      expect(result.commands[0].args).toEqual(['file.txt']);
      expect(result.commands[1].command).toBe('grep');
      expect(result.commands[1].args).toEqual(['test']);
    });

    it('should parse multiple pipes', () => {
      const result = parsePipeline('cat file | grep test | wc -l');

      expect(result.commands).toHaveLength(3);
      expect(result.commands[0].command).toBe('cat');
      expect(result.commands[1].command).toBe('grep');
      expect(result.commands[2].command).toBe('wc');
      expect(result.commands[2].args).toEqual(['-l']);
    });

    it('should handle spaces around pipe', () => {
      const result = parsePipeline('ls    |    grep test');

      expect(result.commands).toHaveLength(2);
      expect(result.commands[0].command).toBe('ls');
      expect(result.commands[1].command).toBe('grep');
    });
  });

  describe('output redirection', () => {
    it('should parse overwrite redirect >', () => {
      const result = parsePipeline('echo hello > output.txt');

      expect(result.isSimple).toBe(false);
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].command).toBe('echo');
      expect(result.outputRedirect).toEqual({
        type: '>',
        file: 'output.txt',
      });
    });

    it('should parse append redirect >>', () => {
      const result = parsePipeline('echo hello >> log.txt');

      expect(result.outputRedirect).toEqual({
        type: '>>',
        file: 'log.txt',
      });
    });

    it('should parse pipe with redirect', () => {
      const result = parsePipeline('cat file | grep test > results.txt');

      expect(result.commands).toHaveLength(2);
      expect(result.outputRedirect).toEqual({
        type: '>',
        file: 'results.txt',
      });
    });
  });

  describe('input redirection', () => {
    it('should parse input redirect <', () => {
      const result = parsePipeline('sort < data.txt');

      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].command).toBe('sort');
      expect(result.inputRedirect).toEqual({
        type: '<',
        file: 'data.txt',
      });
    });
  });

  describe('quotes handling', () => {
    it('should preserve pipe inside single quotes', () => {
      const result = parsePipeline("echo 'hello | world'");

      expect(result.isSimple).toBe(true);
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].args).toEqual(['hello | world']);
    });

    it('should preserve pipe inside double quotes', () => {
      const result = parsePipeline('echo "hello | world"');

      expect(result.isSimple).toBe(true);
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].args).toEqual(['hello | world']);
    });

    it('should handle escaped characters', () => {
      const result = parsePipeline('echo hello\\ world');

      expect(result.commands[0].args).toEqual(['hello world']);
    });
  });

  describe('edge cases', () => {
    it('should handle empty input', () => {
      const result = parsePipeline('');

      expect(result.commands).toHaveLength(0);
      expect(result.isSimple).toBe(true);
    });

    it('should handle whitespace only', () => {
      const result = parsePipeline('   ');

      expect(result.commands).toHaveLength(0);
    });

    it('should handle command with no args', () => {
      const result = parsePipeline('pwd');

      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].command).toBe('pwd');
      expect(result.commands[0].args).toEqual([]);
    });
  });
});

describe('formatPipeline', () => {
  it('should format simple pipeline', () => {
    const pipeline = parsePipeline('cat file | grep test');
    const formatted = formatPipeline(pipeline);

    expect(formatted).toBe('cat file | grep test');
  });

  it('should format pipeline with output redirect', () => {
    const pipeline = parsePipeline('echo hello > output.txt');
    const formatted = formatPipeline(pipeline);

    expect(formatted).toContain('echo hello');
    expect(formatted).toContain('> output.txt');
  });

  it('should format complex pipeline', () => {
    const pipeline = parsePipeline('cat data | sort | uniq > results.txt');
    const formatted = formatPipeline(pipeline);

    expect(formatted).toContain('|');
    expect(formatted).toContain('> results.txt');
  });
});
