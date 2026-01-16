/**
 * Figma SDK.
 *
 * Comprehensive client for Figma REST API with design token extraction
 * and CSS/Tailwind conversion utilities.
 */

import { BaseHttpClient } from '../base-http-client';

/*
 * ============================================================================
 * Types - Core Figma API
 * ============================================================================
 */

export interface FigmaUser {
  id: string;
  email: string;
  handle: string;
  img_url: string;
}

export interface FigmaFile {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
  document: FigmaDocument;
  styles: Record<string, FigmaStyleMeta>;
  components: Record<string, FigmaComponentMeta>;
}

export interface FigmaDocument {
  id: string;
  name: string;
  type: string;
  children: FigmaNode[];
}

export interface FigmaNode {
  id: string;
  name: string;
  type: FigmaNodeType;
  children?: FigmaNode[];
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  effects?: FigmaEffect[];
  style?: FigmaTypeStyle;
  absoluteBoundingBox?: FigmaBoundingBox;
  constraints?: FigmaConstraints;
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  itemSpacing?: number;
  cornerRadius?: number;
  rectangleCornerRadii?: [number, number, number, number];
}

export type FigmaNodeType =
  | 'DOCUMENT'
  | 'CANVAS'
  | 'FRAME'
  | 'GROUP'
  | 'VECTOR'
  | 'BOOLEAN_OPERATION'
  | 'STAR'
  | 'LINE'
  | 'ELLIPSE'
  | 'REGULAR_POLYGON'
  | 'RECTANGLE'
  | 'TEXT'
  | 'SLICE'
  | 'COMPONENT'
  | 'COMPONENT_SET'
  | 'INSTANCE';

export interface FigmaPaint {
  type: 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'GRADIENT_DIAMOND' | 'IMAGE' | 'EMOJI';
  visible?: boolean;
  opacity?: number;
  color?: FigmaColor;
  gradientStops?: FigmaGradientStop[];
  gradientHandlePositions?: FigmaVector[];
}

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface FigmaGradientStop {
  position: number;
  color: FigmaColor;
}

export interface FigmaVector {
  x: number;
  y: number;
}

export interface FigmaEffect {
  type: 'INNER_SHADOW' | 'DROP_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR';
  visible?: boolean;
  radius: number;
  color?: FigmaColor;
  offset?: FigmaVector;
  spread?: number;
}

export interface FigmaTypeStyle {
  fontFamily: string;
  fontPostScriptName?: string;
  fontWeight: number;
  fontSize: number;
  textAlignHorizontal?: 'LEFT' | 'RIGHT' | 'CENTER' | 'JUSTIFIED';
  textAlignVertical?: 'TOP' | 'CENTER' | 'BOTTOM';
  letterSpacing: number;
  lineHeightPx: number;
  lineHeightPercent?: number;
  lineHeightPercentFontSize?: number;
  lineHeightUnit?: 'PIXELS' | 'FONT_SIZE_%' | 'INTRINSIC_%';
}

export interface FigmaBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FigmaConstraints {
  vertical: 'TOP' | 'BOTTOM' | 'CENTER' | 'TOP_BOTTOM' | 'SCALE';
  horizontal: 'LEFT' | 'RIGHT' | 'CENTER' | 'LEFT_RIGHT' | 'SCALE';
}

export interface FigmaStyleMeta {
  key: string;
  name: string;
  description: string;
  styleType: 'FILL' | 'TEXT' | 'EFFECT' | 'GRID';
}

export interface FigmaComponentMeta {
  key: string;
  name: string;
  description: string;
  documentationLinks?: string[];
}

export interface FigmaImageExport {
  [nodeId: string]: string; // URL to the exported image
}

/*
 * ============================================================================
 * Types - Design Tokens
 * ============================================================================
 */

export interface DesignTokens {
  colors: ColorToken[];
  typography: TypographyToken[];
  spacing: SpacingToken[];
  effects: EffectToken[];
  radii: RadiusToken[];
}

export interface ColorToken {
  name: string;
  value: string; // hex
  rgba: { r: number; g: number; b: number; a: number };
  usage?: 'fill' | 'stroke' | 'text';
}

export interface TypographyToken {
  name: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number | string;
  letterSpacing: number;
}

export interface SpacingToken {
  name: string;
  value: number;
}

export interface EffectToken {
  name: string;
  type: 'shadow' | 'blur';
  css: string;
}

export interface RadiusToken {
  name: string;
  value: number | number[];
}

/*
 * ============================================================================
 * Client
 * ============================================================================
 */

export class FigmaClient extends BaseHttpClient {
  constructor(config: { token: string }) {
    super({
      baseUrl: 'https://api.figma.com/v1',
      token: config.token,
      serviceName: 'Figma',
    });
  }

  async getUser(): Promise<FigmaUser> {
    return this.get('/me');
  }

  async getFile(fileKey: string, options?: { depth?: number; geometry?: string }): Promise<FigmaFile> {
    const params = new URLSearchParams();

    if (options?.depth) {
      params.set('depth', String(options.depth));
    }

    if (options?.geometry) {
      params.set('geometry', options.geometry);
    }

    const query = params.toString();

    return this.get(`/files/${fileKey}${query ? `?${query}` : ''}`);
  }

  async getFileNodes(fileKey: string, nodeIds: string[]): Promise<{ nodes: Record<string, { document: FigmaNode }> }> {
    const ids = nodeIds.join(',');
    return this.get(`/files/${fileKey}/nodes?ids=${ids}`);
  }

  async getStyles(fileKey: string): Promise<{ meta: { styles: FigmaStyleMeta[] } }> {
    return this.get(`/files/${fileKey}/styles`);
  }

  async getComponents(fileKey: string): Promise<{ meta: { components: FigmaComponentMeta[] } }> {
    return this.get(`/files/${fileKey}/components`);
  }

  async exportImages(
    fileKey: string,
    nodeIds: string[],
    options?: { format?: 'jpg' | 'png' | 'svg' | 'pdf'; scale?: number },
  ): Promise<{ images: FigmaImageExport }> {
    const params = new URLSearchParams();
    params.set('ids', nodeIds.join(','));
    params.set('format', options?.format || 'svg');

    if (options?.scale) {
      params.set('scale', String(options.scale));
    }

    return this.get(`/images/${fileKey}?${params.toString()}`);
  }

  override async validateToken(): Promise<boolean> {
    try {
      await this.get('/me');
      return true;
    } catch {
      return false;
    }
  }
}

export function createFigmaClient(token: string): FigmaClient {
  return new FigmaClient({ token });
}

/*
 * ============================================================================
 * Design Token Extraction
 * ============================================================================
 */

/**
 * Convert Figma color to hex string
 */
export function figmaColorToHex(color: FigmaColor): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Convert Figma color to rgba string
 */
export function figmaColorToRgba(color: FigmaColor): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const a = Math.round(color.a * 100) / 100;

  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Extract color tokens from a Figma file
 */
export function extractColorTokens(file: FigmaFile): ColorToken[] {
  const colors: ColorToken[] = [];
  const seen = new Set<string>();

  function processNode(node: FigmaNode) {
    // Process fills
    if (node.fills) {
      for (const fill of node.fills) {
        if (fill.type === 'SOLID' && fill.color && fill.visible !== false) {
          const hex = figmaColorToHex(fill.color);

          if (!seen.has(hex)) {
            seen.add(hex);
            colors.push({
              name: `${node.name}-fill`.toLowerCase().replace(/\s+/g, '-'),
              value: hex,
              rgba: {
                r: Math.round(fill.color.r * 255),
                g: Math.round(fill.color.g * 255),
                b: Math.round(fill.color.b * 255),
                a: fill.color.a,
              },
              usage: 'fill',
            });
          }
        }
      }
    }

    // Process strokes
    if (node.strokes) {
      for (const stroke of node.strokes) {
        if (stroke.type === 'SOLID' && stroke.color && stroke.visible !== false) {
          const hex = figmaColorToHex(stroke.color);

          if (!seen.has(hex)) {
            seen.add(hex);
            colors.push({
              name: `${node.name}-stroke`.toLowerCase().replace(/\s+/g, '-'),
              value: hex,
              rgba: {
                r: Math.round(stroke.color.r * 255),
                g: Math.round(stroke.color.g * 255),
                b: Math.round(stroke.color.b * 255),
                a: stroke.color.a,
              },
              usage: 'stroke',
            });
          }
        }
      }
    }

    // Recurse into children
    if (node.children) {
      for (const child of node.children) {
        processNode(child);
      }
    }
  }

  if (file.document?.children) {
    for (const page of file.document.children) {
      processNode(page);
    }
  }

  return colors;
}

/**
 * Extract typography tokens from a Figma file
 */
export function extractTypographyTokens(file: FigmaFile): TypographyToken[] {
  const typography: TypographyToken[] = [];
  const seen = new Set<string>();

  function processNode(node: FigmaNode) {
    if (node.type === 'TEXT' && node.style) {
      const style = node.style;
      const key = `${style.fontFamily}-${style.fontSize}-${style.fontWeight}`;

      if (!seen.has(key)) {
        seen.add(key);
        typography.push({
          name: node.name.toLowerCase().replace(/\s+/g, '-'),
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeightPx,
          letterSpacing: style.letterSpacing,
        });
      }
    }

    if (node.children) {
      for (const child of node.children) {
        processNode(child);
      }
    }
  }

  if (file.document?.children) {
    for (const page of file.document.children) {
      processNode(page);
    }
  }

  return typography;
}

/**
 * Extract spacing tokens from a Figma file (from auto-layout frames)
 */
export function extractSpacingTokens(file: FigmaFile): SpacingToken[] {
  const spacing: SpacingToken[] = [];
  const seen = new Set<number>();

  function processNode(node: FigmaNode) {
    if (node.layoutMode && node.layoutMode !== 'NONE') {
      // Collect padding values
      const paddings = [node.paddingLeft, node.paddingRight, node.paddingTop, node.paddingBottom];

      for (const pad of paddings) {
        if (pad && !seen.has(pad)) {
          seen.add(pad);
          spacing.push({ name: `spacing-${pad}`, value: pad });
        }
      }

      // Collect item spacing
      if (node.itemSpacing && !seen.has(node.itemSpacing)) {
        seen.add(node.itemSpacing);
        spacing.push({ name: `gap-${node.itemSpacing}`, value: node.itemSpacing });
      }
    }

    if (node.children) {
      for (const child of node.children) {
        processNode(child);
      }
    }
  }

  if (file.document?.children) {
    for (const page of file.document.children) {
      processNode(page);
    }
  }

  return spacing.sort((a, b) => a.value - b.value);
}

/**
 * Extract effect tokens (shadows, blurs)
 */
export function extractEffectTokens(file: FigmaFile): EffectToken[] {
  const effects: EffectToken[] = [];
  const seen = new Set<string>();

  function processNode(node: FigmaNode) {
    if (node.effects) {
      for (const effect of node.effects) {
        if (effect.visible === false) {
          continue;
        }

        let css = '';

        if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
          const inset = effect.type === 'INNER_SHADOW' ? 'inset ' : '';
          const x = effect.offset?.x || 0;
          const y = effect.offset?.y || 0;
          const blur = effect.radius;
          const spread = effect.spread || 0;
          const color = effect.color ? figmaColorToRgba(effect.color) : 'rgba(0,0,0,0.25)';
          css = `${inset}${x}px ${y}px ${blur}px ${spread}px ${color}`;
        } else if (effect.type === 'LAYER_BLUR' || effect.type === 'BACKGROUND_BLUR') {
          css = `blur(${effect.radius}px)`;
        }

        if (css && !seen.has(css)) {
          seen.add(css);
          effects.push({
            name: `${node.name}-${effect.type.toLowerCase()}`.replace(/\s+/g, '-'),
            type: effect.type.includes('BLUR') ? 'blur' : 'shadow',
            css,
          });
        }
      }
    }

    if (node.children) {
      for (const child of node.children) {
        processNode(child);
      }
    }
  }

  if (file.document?.children) {
    for (const page of file.document.children) {
      processNode(page);
    }
  }

  return effects;
}

/**
 * Extract border radius tokens
 */
export function extractRadiusTokens(file: FigmaFile): RadiusToken[] {
  const radii: RadiusToken[] = [];
  const seen = new Set<string>();

  function processNode(node: FigmaNode) {
    if (node.cornerRadius !== undefined && node.cornerRadius > 0) {
      const key = String(node.cornerRadius);

      if (!seen.has(key)) {
        seen.add(key);
        radii.push({ name: `radius-${node.cornerRadius}`, value: node.cornerRadius });
      }
    }

    if (node.rectangleCornerRadii) {
      const key = node.rectangleCornerRadii.join('-');

      if (!seen.has(key)) {
        seen.add(key);
        radii.push({
          name: `radius-${key}`,
          value: node.rectangleCornerRadii,
        });
      }
    }

    if (node.children) {
      for (const child of node.children) {
        processNode(child);
      }
    }
  }

  if (file.document?.children) {
    for (const page of file.document.children) {
      processNode(page);
    }
  }

  return radii;
}

/**
 * Extract all design tokens from a Figma file
 */
export function extractDesignTokens(file: FigmaFile): DesignTokens {
  return {
    colors: extractColorTokens(file),
    typography: extractTypographyTokens(file),
    spacing: extractSpacingTokens(file),
    effects: extractEffectTokens(file),
    radii: extractRadiusTokens(file),
  };
}

/*
 * ============================================================================
 * CSS/Tailwind Generation
 * ============================================================================
 */

/**
 * Generate CSS custom properties from design tokens
 */
export function generateCSSVariables(tokens: DesignTokens): string {
  const lines: string[] = [':root {'];

  // Colors
  lines.push('  /* Colors */');

  for (const color of tokens.colors) {
    lines.push(`  --color-${color.name}: ${color.value};`);
  }

  // Typography
  lines.push('');
  lines.push('  /* Typography */');

  const fonts = new Set(tokens.typography.map((t) => t.fontFamily));
  lines.push(`  --font-family: ${[...fonts].join(', ')};`);

  for (const typo of tokens.typography) {
    lines.push(`  --font-size-${typo.name}: ${typo.fontSize}px;`);
    lines.push(`  --line-height-${typo.name}: ${typo.lineHeight}px;`);
  }

  // Spacing
  lines.push('');
  lines.push('  /* Spacing */');

  for (const space of tokens.spacing) {
    lines.push(`  --${space.name}: ${space.value}px;`);
  }

  // Radii
  lines.push('');
  lines.push('  /* Border Radius */');

  for (const radius of tokens.radii) {
    const value = Array.isArray(radius.value) ? radius.value.map((v) => `${v}px`).join(' ') : `${radius.value}px`;
    lines.push(`  --${radius.name}: ${value};`);
  }

  // Effects
  lines.push('');
  lines.push('  /* Effects */');

  for (const effect of tokens.effects) {
    if (effect.type === 'shadow') {
      lines.push(`  --shadow-${effect.name}: ${effect.css};`);
    }
  }

  lines.push('}');

  return lines.join('\n');
}

/**
 * Generate Tailwind config extend from design tokens
 */
export function generateTailwindConfig(tokens: DesignTokens): string {
  const extend: Record<string, Record<string, string>> = {
    colors: {},
    fontSize: {},
    spacing: {},
    borderRadius: {},
    boxShadow: {},
  };

  const config = {
    theme: {
      extend,
    },
  };

  // Colors
  for (const color of tokens.colors) {
    extend.colors[color.name] = color.value;
  }

  // Typography
  for (const typo of tokens.typography) {
    extend.fontSize[typo.name] = `${typo.fontSize}px`;
  }

  // Spacing
  for (const space of tokens.spacing) {
    extend.spacing[space.name.replace('spacing-', '').replace('gap-', '')] = `${space.value}px`;
  }

  // Radii
  for (const radius of tokens.radii) {
    if (!Array.isArray(radius.value)) {
      extend.borderRadius[radius.name.replace('radius-', '')] = `${radius.value}px`;
    }
  }

  // Shadows
  for (const effect of tokens.effects) {
    if (effect.type === 'shadow') {
      extend.boxShadow[effect.name] = effect.css;
    }
  }

  return `module.exports = ${JSON.stringify(config, null, 2)}`;
}

/*
 * ============================================================================
 * Helper Functions
 * ============================================================================
 */

/**
 * Parse a Figma file URL to extract the file key
 */
export function parseFileUrl(url: string): { fileKey: string; nodeId?: string } | null {
  /*
   * https://www.figma.com/file/XXXXX/Name?node-id=YYY
   * https://www.figma.com/design/XXXXX/Name?node-id=YYY
   */
  const match = url.match(/figma\.com\/(file|design)\/([a-zA-Z0-9]+)/);

  if (!match) {
    return null;
  }

  const fileKey = match[2];
  const nodeIdMatch = url.match(/node-id=([^&]+)/);
  const nodeId = nodeIdMatch ? decodeURIComponent(nodeIdMatch[1]) : undefined;

  return { fileKey, nodeId };
}

/**
 * Get all frames from a Figma file
 */
export function getFrames(file: FigmaFile): FigmaNode[] {
  const frames: FigmaNode[] = [];

  function collectFrames(node: FigmaNode) {
    if (node.type === 'FRAME' || node.type === 'COMPONENT') {
      frames.push(node);
    }

    if (node.children) {
      for (const child of node.children) {
        collectFrames(child);
      }
    }
  }

  if (file.document?.children) {
    for (const page of file.document.children) {
      collectFrames(page);
    }
  }

  return frames;
}

/**
 * Find a node by ID in a Figma file
 */
export function findNodeById(file: FigmaFile, nodeId: string): FigmaNode | null {
  function search(node: FigmaNode): FigmaNode | null {
    if (node.id === nodeId) {
      return node;
    }

    if (node.children) {
      for (const child of node.children) {
        const found = search(child);

        if (found) {
          return found;
        }
      }
    }

    return null;
  }

  if (file.document?.children) {
    for (const page of file.document.children) {
      const found = search(page);

      if (found) {
        return found;
      }
    }
  }

  return null;
}

/**
 * Get all components from a Figma file
 */
export function getComponents(file: FigmaFile): FigmaNode[] {
  const components: FigmaNode[] = [];

  function collect(node: FigmaNode) {
    if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
      components.push(node);
    }

    if (node.children) {
      for (const child of node.children) {
        collect(child);
      }
    }
  }

  if (file.document?.children) {
    for (const page of file.document.children) {
      collect(page);
    }
  }

  return components;
}
