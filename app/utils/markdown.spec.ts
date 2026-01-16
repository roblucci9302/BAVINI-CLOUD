import { describe, it, expect } from 'vitest';
import { allowedHTMLElements, remarkPlugins, rehypePlugins } from './markdown';

describe('markdown utilities', () => {
  describe('allowedHTMLElements', () => {
    it('should include common text elements', () => {
      expect(allowedHTMLElements).toContain('p');
      expect(allowedHTMLElements).toContain('span');
      expect(allowedHTMLElements).toContain('div');
      expect(allowedHTMLElements).toContain('br');
    });

    it('should include heading elements', () => {
      expect(allowedHTMLElements).toContain('h1');
      expect(allowedHTMLElements).toContain('h2');
      expect(allowedHTMLElements).toContain('h3');
      expect(allowedHTMLElements).toContain('h4');
      expect(allowedHTMLElements).toContain('h5');
      expect(allowedHTMLElements).toContain('h6');
    });

    it('should include code elements', () => {
      expect(allowedHTMLElements).toContain('code');
      expect(allowedHTMLElements).toContain('pre');
      expect(allowedHTMLElements).toContain('kbd');
      expect(allowedHTMLElements).toContain('samp');
    });

    it('should include list elements', () => {
      expect(allowedHTMLElements).toContain('ul');
      expect(allowedHTMLElements).toContain('ol');
      expect(allowedHTMLElements).toContain('li');
      expect(allowedHTMLElements).toContain('dl');
      expect(allowedHTMLElements).toContain('dt');
      expect(allowedHTMLElements).toContain('dd');
    });

    it('should include table elements', () => {
      expect(allowedHTMLElements).toContain('table');
      expect(allowedHTMLElements).toContain('thead');
      expect(allowedHTMLElements).toContain('tbody');
      expect(allowedHTMLElements).toContain('tfoot');
      expect(allowedHTMLElements).toContain('tr');
      expect(allowedHTMLElements).toContain('th');
      expect(allowedHTMLElements).toContain('td');
    });

    it('should include formatting elements', () => {
      expect(allowedHTMLElements).toContain('strong');
      expect(allowedHTMLElements).toContain('em');
      expect(allowedHTMLElements).toContain('b');
      expect(allowedHTMLElements).toContain('i');
      expect(allowedHTMLElements).toContain('del');
      expect(allowedHTMLElements).toContain('ins');
      expect(allowedHTMLElements).toContain('s');
      expect(allowedHTMLElements).toContain('strike');
    });

    it('should include link elements', () => {
      expect(allowedHTMLElements).toContain('a');
    });

    it('should include quote and details elements', () => {
      expect(allowedHTMLElements).toContain('blockquote');
      expect(allowedHTMLElements).toContain('q');
      expect(allowedHTMLElements).toContain('details');
      expect(allowedHTMLElements).toContain('summary');
    });

    it('should not include script or style elements', () => {
      expect(allowedHTMLElements).not.toContain('script');
      expect(allowedHTMLElements).not.toContain('style');
      expect(allowedHTMLElements).not.toContain('iframe');
      expect(allowedHTMLElements).not.toContain('object');
      expect(allowedHTMLElements).not.toContain('embed');
    });
  });

  describe('remarkPlugins', () => {
    it('should return array with remarkGfm when limitedMarkdown is false', () => {
      const plugins = remarkPlugins(false);

      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins.length).toBe(1);
    });

    it('should include limitedMarkdownPlugin when limitedMarkdown is true', () => {
      const plugins = remarkPlugins(true);

      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins.length).toBe(2);
    });
  });

  describe('rehypePlugins', () => {
    it('should return empty array when html is false', () => {
      const plugins = rehypePlugins(false);

      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins.length).toBe(0);
    });

    it('should include rehypeRaw and rehypeSanitize when html is true', () => {
      const plugins = rehypePlugins(true);

      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins.length).toBe(2);
    });
  });
});
