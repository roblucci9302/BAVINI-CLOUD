/**
 * =============================================================================
 * BAVINI CLOUD - Dynamic Font Shim Tests
 * =============================================================================
 * Tests for the dynamic font shim generation feature.
 * Ensures that any font from Google Fonts can be used without errors.
 * =============================================================================
 */

import { describe, it, expect } from 'vitest';
import {
  extractFontImports,
  generateDynamicFontShim,
  FONT_LOADER_BASE,
} from '../nextjs-shims';

describe('extractFontImports', () => {
  it('should extract single font import', () => {
    const files = new Map([
      ['/app/layout.tsx', `import { Inter } from 'next/font/google';`],
    ]);

    const fonts = extractFontImports(files);

    expect(fonts).toContain('Inter');
    expect(fonts).toHaveLength(1);
  });

  it('should extract multiple fonts from single import', () => {
    const files = new Map([
      [
        '/app/layout.tsx',
        `import { Crimson_Pro, Space_Grotesk } from 'next/font/google';`,
      ],
    ]);

    const fonts = extractFontImports(files);

    expect(fonts).toContain('Crimson_Pro');
    expect(fonts).toContain('Space_Grotesk');
    expect(fonts).toHaveLength(2);
  });

  it('should handle "as" alias syntax', () => {
    const files = new Map([
      [
        '/app/layout.tsx',
        `import { Inter as MainFont, Roboto as BodyFont } from 'next/font/google';`,
      ],
    ]);

    const fonts = extractFontImports(files);

    expect(fonts).toContain('Inter');
    expect(fonts).toContain('Roboto');
    expect(fonts).not.toContain('MainFont');
    expect(fonts).not.toContain('BodyFont');
    expect(fonts).toHaveLength(2);
  });

  it('should handle mixed imports with and without aliases', () => {
    const files = new Map([
      [
        '/app/layout.tsx',
        `import { Inter, Roboto as BodyFont, Poppins } from 'next/font/google';`,
      ],
    ]);

    const fonts = extractFontImports(files);

    expect(fonts).toContain('Inter');
    expect(fonts).toContain('Roboto');
    expect(fonts).toContain('Poppins');
    expect(fonts).toHaveLength(3);
  });

  it('should extract fonts from multiple files', () => {
    const files = new Map([
      ['/app/layout.tsx', `import { Inter } from 'next/font/google';`],
      ['/app/page.tsx', `import { Playfair_Display } from 'next/font/google';`],
      [
        '/components/Header.tsx',
        `import { Space_Grotesk } from 'next/font/google';`,
      ],
    ]);

    const fonts = extractFontImports(files);

    expect(fonts).toContain('Inter');
    expect(fonts).toContain('Playfair_Display');
    expect(fonts).toContain('Space_Grotesk');
    expect(fonts).toHaveLength(3);
  });

  it('should deduplicate fonts used in multiple files', () => {
    const files = new Map([
      ['/app/layout.tsx', `import { Inter } from 'next/font/google';`],
      ['/app/page.tsx', `import { Inter } from 'next/font/google';`],
    ]);

    const fonts = extractFontImports(files);

    expect(fonts).toContain('Inter');
    expect(fonts).toHaveLength(1);
  });

  it('should handle single quotes', () => {
    const files = new Map([
      ['/app/layout.tsx', `import { Inter } from 'next/font/google';`],
    ]);

    const fonts = extractFontImports(files);

    expect(fonts).toContain('Inter');
  });

  it('should handle double quotes', () => {
    const files = new Map([
      ['/app/layout.tsx', `import { Inter } from "next/font/google";`],
    ]);

    const fonts = extractFontImports(files);

    expect(fonts).toContain('Inter');
  });

  it('should return empty array when no font imports exist', () => {
    const files = new Map([
      ['/app/layout.tsx', `import React from 'react';`],
      ['/app/page.tsx', `export default function Page() { return <div />; }`],
    ]);

    const fonts = extractFontImports(files);

    expect(fonts).toHaveLength(0);
  });

  it('should ignore invalid font names', () => {
    const files = new Map([
      [
        '/app/layout.tsx',
        `import { Inter, lowercase, 123Invalid } from 'next/font/google';`,
      ],
    ]);

    const fonts = extractFontImports(files);

    expect(fonts).toContain('Inter');
    expect(fonts).not.toContain('lowercase');
    expect(fonts).not.toContain('123Invalid');
  });

  it('should handle multiline imports', () => {
    const files = new Map([
      [
        '/app/layout.tsx',
        `import {
          Inter,
          Roboto,
          Poppins
        } from 'next/font/google';`,
      ],
    ]);

    const fonts = extractFontImports(files);

    expect(fonts).toContain('Inter');
    expect(fonts).toContain('Roboto');
    expect(fonts).toContain('Poppins');
    expect(fonts).toHaveLength(3);
  });

  it('should handle fonts with underscores', () => {
    const files = new Map([
      [
        '/app/layout.tsx',
        `import { Plus_Jakarta_Sans, DM_Serif_Display } from 'next/font/google';`,
      ],
    ]);

    const fonts = extractFontImports(files);

    expect(fonts).toContain('Plus_Jakarta_Sans');
    expect(fonts).toContain('DM_Serif_Display');
  });
});

describe('generateDynamicFontShim', () => {
  it('should generate valid shim with single font', () => {
    const shim = generateDynamicFontShim(['Inter']);

    expect(shim).toContain('function createFontLoader(fontName)');
    expect(shim).toContain("export const Inter = createFontLoader('Inter');");
  });

  it('should generate valid shim with multiple fonts', () => {
    const shim = generateDynamicFontShim(['Inter', 'Roboto', 'Poppins']);

    expect(shim).toContain("export const Inter = createFontLoader('Inter');");
    expect(shim).toContain("export const Roboto = createFontLoader('Roboto');");
    expect(shim).toContain(
      "export const Poppins = createFontLoader('Poppins');"
    );
  });

  it('should generate valid shim with fonts containing underscores', () => {
    const shim = generateDynamicFontShim(['Crimson_Pro', 'Space_Grotesk']);

    expect(shim).toContain(
      "export const Crimson_Pro = createFontLoader('Crimson_Pro');"
    );
    expect(shim).toContain(
      "export const Space_Grotesk = createFontLoader('Space_Grotesk');"
    );
  });

  it('should include base font loader code', () => {
    const shim = generateDynamicFontShim(['Inter']);

    expect(shim).toContain('function createFontLoader(fontName)');
    expect(shim).toContain('export default createFontLoader');
  });

  it('should generate valid shim even with empty font list', () => {
    const shim = generateDynamicFontShim([]);

    expect(shim).toContain('function createFontLoader(fontName)');
    expect(shim).toContain('export default createFontLoader');
  });
});

describe('FONT_LOADER_BASE', () => {
  it('should contain createFontLoader function', () => {
    expect(FONT_LOADER_BASE).toContain('function createFontLoader(fontName)');
  });

  it('should export default createFontLoader', () => {
    expect(FONT_LOADER_BASE).toContain('export default createFontLoader');
  });

  it('should convert underscore to space for CSS font name', () => {
    expect(FONT_LOADER_BASE).toContain("fontName.replace(/_/g, ' ')");
  });
});
