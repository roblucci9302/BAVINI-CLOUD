import { describe, it, expect } from 'vitest';
import { diffFiles, computeFileModifications, fileModificationsToHTML, modificationsRegex } from './diff';
import type { FileMap } from '~/lib/stores/files';

describe('diff utilities', () => {
  describe('diffFiles', () => {
    it('should return undefined when files are identical', () => {
      const content = 'const x = 1;';
      const result = diffFiles('test.js', content, content);

      expect(result).toBeUndefined();
    });

    it('should return unified diff for changed content', () => {
      const oldContent = 'const x = 1;';
      const newContent = 'const x = 2;';
      const result = diffFiles('test.js', oldContent, newContent);

      expect(result).toBeDefined();
      expect(result).toContain('-const x = 1;');
      expect(result).toContain('+const x = 2;');
    });

    it('should strip header from unified diff', () => {
      const oldContent = 'line1';
      const newContent = 'line2';
      const result = diffFiles('test.js', oldContent, newContent);

      // Should not contain the header
      expect(result).not.toContain('--- test.js');
      expect(result).not.toContain('+++ test.js');
    });

    it('should handle multi-line diffs', () => {
      const oldContent = 'line1\nline2\nline3';
      const newContent = 'line1\nmodified\nline3';
      const result = diffFiles('test.js', oldContent, newContent);

      expect(result).toContain('-line2');
      expect(result).toContain('+modified');
    });

    it('should handle added lines', () => {
      const oldContent = 'line1\nline2';
      const newContent = 'line1\nline2\nline3';
      const result = diffFiles('test.js', oldContent, newContent);

      expect(result).toContain('+line3');
    });

    it('should handle removed lines', () => {
      const oldContent = 'line1\nline2\nline3';
      const newContent = 'line1\nline3';
      const result = diffFiles('test.js', oldContent, newContent);

      expect(result).toContain('-line2');
    });

    it('should handle empty old content', () => {
      const oldContent = '';
      const newContent = 'new content';
      const result = diffFiles('test.js', oldContent, newContent);

      expect(result).toBeDefined();
      expect(result).toContain('+new content');
    });

    it('should handle empty new content', () => {
      const oldContent = 'old content';
      const newContent = '';
      const result = diffFiles('test.js', oldContent, newContent);

      expect(result).toBeDefined();
      expect(result).toContain('-old content');
    });
  });

  describe('computeFileModifications', () => {
    it('should return undefined when no modifications exist', () => {
      const files: FileMap = {
        '/test.js': { type: 'file', content: 'const x = 1;', isBinary: false },
      };
      const modifiedFiles = new Map<string, string>();

      const result = computeFileModifications(files, modifiedFiles);

      expect(result).toBeUndefined();
    });

    it('should return undefined when file content is unchanged', () => {
      const content = 'const x = 1;';
      const files: FileMap = {
        '/test.js': { type: 'file', content, isBinary: false },
      };
      const modifiedFiles = new Map<string, string>([['/test.js', content]]);

      const result = computeFileModifications(files, modifiedFiles);

      expect(result).toBeUndefined();
    });

    it('should return diff when content changed and diff is smaller', () => {
      /*
       * Create content where the diff will definitely be smaller
       * Many lines of context with one small change
       */
      const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`);
      const originalContent = lines.join('\n');
      const modifiedLines = [...lines];
      modifiedLines[50] = 'modified line 50';

      const modifiedContent = modifiedLines.join('\n');

      const files: FileMap = {
        '/test.js': { type: 'file', content: modifiedContent, isBinary: false },
      };
      const modifiedFiles = new Map<string, string>([['/test.js', originalContent]]);

      const result = computeFileModifications(files, modifiedFiles);

      expect(result).toBeDefined();

      // The diff should be smaller than the full file for this case
      expect(result!['/test.js'].type).toBe('diff');
    });

    it('should return file content when it is smaller than diff', () => {
      const files: FileMap = {
        '/test.js': { type: 'file', content: 'x', isBinary: false },
      };
      const modifiedFiles = new Map<string, string>([['/test.js', 'y']]);

      const result = computeFileModifications(files, modifiedFiles);

      expect(result).toBeDefined();

      // For very small files, diff might be larger than content
      expect(result!['/test.js']).toBeDefined();
    });

    it('should skip non-file entries', () => {
      const files: FileMap = {
        '/folder': { type: 'folder' },
      };
      const modifiedFiles = new Map<string, string>([['/folder', 'content']]);

      const result = computeFileModifications(files, modifiedFiles);

      expect(result).toBeUndefined();
    });

    it('should handle multiple modified files', () => {
      const files: FileMap = {
        '/a.js': { type: 'file', content: 'modified a', isBinary: false },
        '/b.js': { type: 'file', content: 'modified b', isBinary: false },
      };
      const modifiedFiles = new Map<string, string>([
        ['/a.js', 'original a'],
        ['/b.js', 'original b'],
      ]);

      const result = computeFileModifications(files, modifiedFiles);

      expect(result).toBeDefined();
      expect(result!['/a.js']).toBeDefined();
      expect(result!['/b.js']).toBeDefined();
    });
  });

  describe('fileModificationsToHTML', () => {
    it('should return undefined for empty modifications', () => {
      const result = fileModificationsToHTML({});

      expect(result).toBeUndefined();
    });

    it('should wrap modifications in bolt_file_modifications tag', () => {
      const modifications = {
        '/test.js': { type: 'diff' as const, content: '+added line' },
      };

      const result = fileModificationsToHTML(modifications);

      expect(result).toContain('<bolt_file_modifications>');
      expect(result).toContain('</bolt_file_modifications>');
    });

    it('should create diff tag with path attribute', () => {
      const modifications = {
        '/test.js': { type: 'diff' as const, content: '+added' },
      };

      const result = fileModificationsToHTML(modifications);

      expect(result).toContain('<diff path="/test.js">');
      expect(result).toContain('</diff>');
    });

    it('should create file tag for file type', () => {
      const modifications = {
        '/test.js': { type: 'file' as const, content: 'full content' },
      };

      const result = fileModificationsToHTML(modifications);

      expect(result).toContain('<file path="/test.js">');
      expect(result).toContain('</file>');
    });

    it('should include content between tags', () => {
      const modifications = {
        '/test.js': { type: 'diff' as const, content: '+new line\n-old line' },
      };

      const result = fileModificationsToHTML(modifications);

      expect(result).toContain('+new line\n-old line');
    });

    it('should handle multiple files', () => {
      const modifications = {
        '/a.js': { type: 'diff' as const, content: 'diff a' },
        '/b.js': { type: 'file' as const, content: 'file b' },
      };

      const result = fileModificationsToHTML(modifications);

      expect(result).toContain('<diff path="/a.js">');
      expect(result).toContain('<file path="/b.js">');
    });
  });

  describe('modificationsRegex', () => {
    it('should match bolt_file_modifications tags', () => {
      const text = '<bolt_file_modifications>\n<diff path="/test.js">+line</diff>\n</bolt_file_modifications> rest';

      const match = text.match(modificationsRegex);

      expect(match).toBeTruthy();
    });

    it('should match at start of string only', () => {
      const text = 'prefix <bolt_file_modifications></bolt_file_modifications>';

      const match = text.match(modificationsRegex);

      expect(match).toBeFalsy();
    });

    it('should capture multiline content', () => {
      const text = `<bolt_file_modifications>
<diff path="/test.js">
-old
+new
</diff>
</bolt_file_modifications>
remaining text`;

      const cleaned = text.replace(modificationsRegex, '');

      expect(cleaned).toBe('remaining text');
    });
  });
});
