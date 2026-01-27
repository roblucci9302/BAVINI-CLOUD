/**
 * =============================================================================
 * BAVINI CLOUD - Astro Code Post-Processor
 * =============================================================================
 * Functions for post-processing compiled Astro code for browser compatibility.
 *
 * @module lib/runtime/adapters/compilers/astro/post-processor
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';
import { getAstroRuntimeShims } from './runtime-shims';

const logger = createScopedLogger('AstroPostProcessor');

/**
 * Strip TypeScript-specific declarations from compiled code.
 * esbuild is configured for JavaScript, so TS syntax causes parse errors.
 *
 * @param code - The code to strip TypeScript declarations from
 * @returns Code with TypeScript declarations removed
 */
export function stripTypeScriptDeclarations(code: string): string {
  let processed = code;

  // Remove interface declarations: interface Name { ... }
  // Handles multi-line interfaces with nested braces
  processed = processed.replace(
    /^\s*interface\s+\w+\s*\{[^}]*\}\s*;?\s*$/gm,
    '// [TypeScript interface removed]',
  );

  // More robust interface removal for complex/nested interfaces
  // This handles interfaces that span multiple lines with nested objects
  processed = processed.replace(
    /interface\s+\w+\s*\{[\s\S]*?\n\}/g,
    '// [TypeScript interface removed]',
  );

  // Remove type aliases: type Name = ...;
  processed = processed.replace(
    /^\s*type\s+\w+\s*=\s*[^;]+;\s*$/gm,
    '// [TypeScript type alias removed]',
  );

  // Remove type-only imports: import type { ... } from '...'
  processed = processed.replace(
    /import\s+type\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?\s*\n?/g,
    '',
  );

  // Remove inline type annotations from variable declarations
  // const foo: Type = ... → const foo = ...
  processed = processed.replace(
    /(\bconst\s+\w+)\s*:\s*\w+(\s*=)/g,
    '$1$2',
  );

  // Remove type assertions: as Type
  processed = processed.replace(
    /\s+as\s+\w+(?:<[^>]+>)?/g,
    '',
  );

  // Remove generic type parameters from function calls: func<Type>(...)
  // But be careful not to break JSX: <Component />
  processed = processed.replace(
    /(\w+)<(\w+(?:\s*,\s*\w+)*)>\s*\(/g,
    '$1(',
  );

  return processed;
}

/**
 * Post-process compiled Astro code for browser compatibility.
 *
 * This function:
 * 1. Strips TypeScript declarations
 * 2. Injects Astro runtime shims
 * 3. Removes invalid import statements
 * 4. Replaces $result declarations with global references
 * 5. Replaces $ and $$ prefixed functions with globalThis.xxx
 *
 * @param code - The compiled Astro code
 * @param filename - The filename for logging
 * @returns Post-processed code ready for browser execution
 */
export function postProcessCode(code: string, filename: string): string {
  let processed = code;

  // The Astro compiler v2+ generates code with $$ (double dollar) prefix:
  // - $$createComponent, $$render, $$renderComponent, $$renderTemplate, etc.
  // We need to:
  // - Remove the import statements completely (provide our own shims)
  // - Handle CSS import statements that reference non-existent files
  // - Remove TypeScript-specific syntax (interface, type declarations)

  // CRITICAL: Remove TypeScript interface/type declarations
  // esbuild is configured for JS, not TS, so these cause parse errors
  processed = stripTypeScriptDeclarations(processed);

  // Check if the code has Astro v2+ shim definitions (uses $$ prefix)
  const hasInlineShims = /const \$\$(?:render|createComponent|renderComponent|renderTemplate)\s*=/.test(processed);
  // Also check for older v1 style (single $) just in case
  const hasLegacyShims = /const \$(?:render|createComponent|renderComponent)\s*=/.test(processed) && !hasInlineShims;

  // ALWAYS inject our shims first - they will be overridden by inline definitions if present
  // This ensures $$renderTemplate is available even if the compiler doesn't define it inline
  processed = `${getAstroRuntimeShims()}\n${processed}`;

  if (hasInlineShims || hasLegacyShims) {
    // Remove ALL import statements from astro/internal or /__astro_internal__
    // These are redundant since shims are now defined
    processed = processed.replace(
      /import\s*\{[^}]*\}\s*from\s*["'](?:astro\/internal|\/?__astro_internal__)["'];?\n?/g,
      '// Astro internals provided via shims\n',
    );
  } else if (processed.includes('from "astro/internal"') || processed.includes("from 'astro/internal'")) {
    // No inline shims at all - replace imports
    processed = processed.replace(
      /import\s*\{[^}]*\}\s*from\s*["']astro\/internal["'];?\n?/g,
      '// Astro internals provided via shims\n',
    );
  }

  // Remove CSS imports that reference non-existent virtual files
  // e.g., import "/src/pages/index.astro?astro&type=style&index=0&lang.css";
  processed = processed.replace(
    /import\s+["'][^"']*\?astro&type=style[^"']*["'];?\n?/g,
    '// CSS extracted separately\n',
  );

  // CRITICAL FIX: Replace local $result declarations with our global
  // The Astro compiler generates: const $result = { styles: new Set(), ... }
  // But this shadows our global $result which has createAstro method
  // We need to ensure all $result references use our global
  processed = processed.replace(
    /(?:const|let|var)\s+\$result\s*=\s*\{[^}]*styles:\s*new\s+Set\(\)[^}]*\};?/g,
    '// Using global $result from shims (has createAstro method)',
  );

  // Also handle $$result declarations
  processed = processed.replace(
    /(?:const|let|var)\s+\$\$result\s*=\s*\{[^}]*styles:\s*new\s+Set\(\)[^}]*\};?/g,
    '// Using global $$result from shims',
  );

  // CRITICAL: Replace $$renderTemplate definitions that use createTemplateFactory
  // The Astro compiler generates: const $$renderTemplate = createTemplateFactory($$result, ...);
  // But createTemplateFactory doesn't exist in our browser context.
  // Replace with our globalThis.$$renderTemplate shim.
  processed = processed.replace(
    /(?:const|let|var)\s+\$\$renderTemplate\s*=\s*createTemplateFactory\s*\([^)]*\)\s*;?/g,
    'const $$renderTemplate = globalThis.$$renderTemplate;',
  );

  // Also handle any other $$renderTemplate definitions that might use different patterns
  // e.g., const $$renderTemplate = $$createRenderTemplate(...)
  processed = processed.replace(
    /(?:const|let|var)\s+\$\$renderTemplate\s*=\s*\$\$create\w+\s*\([^)]*\)\s*;?/g,
    'const $$renderTemplate = globalThis.$$renderTemplate;',
  );

  // CRITICAL: Replace property access references to $result and $$result with globalThis.xxx
  // This prevents esbuild from renaming these variables during bundling
  // Property accesses like globalThis.$result.createAstro() cannot be renamed
  //
  // IMPORTANT: Do NOT replace standalone $result - it's used as function parameters!
  // e.g., $createComponent(($result, $props) => ...) - $result is a param name, not a reference
  //
  // CRITICAL: Process $$ (double dollar) BEFORE $ (single dollar) to avoid partial matches!
  // Otherwise $$result gets partially matched as $result → $globalThis.$result (BUG!)

  // Replace $$result.xxx with globalThis.$$result.xxx (ONLY property access)
  // Must be done FIRST before single $ patterns
  // NOTE: In String.replace(), $$ produces single $, so we need $$$$ to produce $$
  processed = processed.replace(/(?<!globalThis\.)(?<![\w\$])(\$\$result)\.(\w+)/g, 'globalThis.$$$$result.$2');

  // Replace $result.xxx with globalThis.$result.xxx (ONLY property access)
  // Use negative lookbehind to avoid already-prefixed, word chars, and $ before the pattern
  processed = processed.replace(/(?<!globalThis\.)(?<![\w\$])(\$result)\.(\w+)/g, 'globalThis.$result.$2');

  // Replace $$ prefixed function calls with globalThis.$$xxx
  // e.g., $$renderTemplate(...) → globalThis.$$renderTemplate(...)
  // BUT NOT inside function parameter lists - use lookbehind to avoid ($$func pattern
  // NOTE: In String.replace(), $$ is a special pattern producing single $
  // So we use $$$$ to produce $$ in the output
  const doubleDollarFuncs = [
    'renderTemplate', 'renderComponent', 'createComponent', 'render',
    'addAttribute', 'spreadAttributes', 'maybeRenderHead', 'renderHead',
    'renderSlot', 'mergeSlots', 'createAstro', 'unescapeHTML', 'defineScriptVars',
  ];
  for (const func of doubleDollarFuncs) {
    // Match $$func( but not when preceded by ( which would indicate parameter position
    const regex = new RegExp(`(?<!globalThis\\.)(?<![\\w\\(])\\$\\$${func}\\s*\\(`, 'g');
    // Use $$$$ to produce $$ (each $$ produces one $ in replacement string)
    processed = processed.replace(regex, `globalThis.$$$$${func}(`);
  }

  // CRITICAL FIX: Replace tagged template literal usage of $$renderTemplate
  // Astro compiler generates: return $$renderTemplate`<html>...</html>`;
  // This is a tagged template literal, NOT a function call!
  // We need to replace: $$renderTemplate` → globalThis.$$renderTemplate`
  // NOTE: In String.replace(), $$ produces single $, so we need $$$$ to produce $$
  processed = processed.replace(
    /(?<!globalThis\.)(?<![\w\(])\$\$renderTemplate\s*`/g,
    'globalThis.$$$$renderTemplate`',
  );

  // Also handle $renderTemplate tagged template literals (single $)
  processed = processed.replace(
    /(?<!globalThis\.)(?<![\w\$\(])\$renderTemplate\s*`/g,
    'globalThis.$renderTemplate`',
  );

  // CRITICAL: Astro v2.10.3 uses $render (not $renderTemplate) as tagged template literal!
  // e.g., return $render`<html>...</html>`;
  // We need to replace: $render` → globalThis.$render`
  processed = processed.replace(
    /(?<!globalThis\.)(?<![\w\$\(])\$render\s*`/g,
    'globalThis.$render`',
  );

  // Also handle $$render tagged template literals (double $)
  // NOTE: In String.replace(), $$ produces single $, so we need $$$$ to produce $$
  processed = processed.replace(
    /(?<!globalThis\.)(?<![\w\(])\$\$render\s*`/g,
    'globalThis.$$$$render`',
  );

  // Replace $ prefixed function calls with globalThis.$xxx
  // e.g., $renderTemplate(...) → globalThis.$renderTemplate(...)
  const singleDollarFuncs = [
    'createComponent', 'render', 'renderComponent', 'renderHead', 'maybeRenderHead',
    'addAttribute', 'spreadAttributes', 'defineStyleVars', 'defineScriptVars',
    'renderSlot', 'mergeSlots', 'createMetadata', 'renderTemplate',
  ];
  for (const func of singleDollarFuncs) {
    // Match $func( but not when preceded by ( which would indicate parameter position
    const regex = new RegExp(`(?<!globalThis\\.)(?<![\\w\\$\\(])\\$${func}\\s*\\(`, 'g');
    processed = processed.replace(regex, `globalThis.$${func}(`);
  }

  return processed;
}

/**
 * Extract component name from filename.
 *
 * @param filename - The filename to extract name from
 * @returns PascalCase component name
 */
export function getComponentName(filename: string): string {
  const base = filename.split('/').pop() || 'Component';
  const name = base.replace(/\.astro$/, '');
  // Convert to PascalCase
  return name.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
}

/**
 * Wrap Astro component output for browser rendering.
 * FIX: Properly resolve async render results from Astro components.
 *
 * @param code - The compiled Astro code
 * @param filename - The filename for component naming
 * @returns Code wrapped for browser preview
 */
export function wrapForBrowser(code: string, filename: string): string {
  const componentName = getComponentName(filename);

  return `
${code}

// Browser preview wrapper
const __astroComponent = typeof Component !== 'undefined' ? Component : (typeof $$Component !== 'undefined' ? $$Component : null);

// Helper to recursively resolve render results
async function __resolveRenderResult(value) {
  if (value === null || value === undefined) return '';

  // If it's a string, return directly
  if (typeof value === 'string') return value;

  // If it has a render() method (our async render result object), call it
  if (value && typeof value.render === 'function') {
    const rendered = await value.render();
    return __resolveRenderResult(rendered);
  }

  // If it's a promise, await it and recurse
  if (value && typeof value.then === 'function') {
    const resolved = await value;
    return __resolveRenderResult(resolved);
  }

  // If it's an array, resolve each item and join
  if (Array.isArray(value)) {
    const resolved = await Promise.all(value.map(v => __resolveRenderResult(v)));
    return resolved.join('');
  }

  // For other objects, try toString
  if (value && typeof value.toString === 'function') {
    const str = value.toString();
    // Check for placeholder strings that indicate unresolved async
    if (str === '[ASYNC]' || str === '[ASYNC_RENDER_RESULT]' || str === '[ASYNC_PENDING]' || str === '[object Object]') {
      console.warn('[BAVINI Astro] Unresolved async value detected:', str);
      return '';
    }
    return str;
  }

  return String(value);
}

// CRITICAL: Astro components expect (result, props, slots) signature
// The $result object must be passed as first argument
export default async function ${componentName}Preview(props = {}) {
  if (__astroComponent) {
    // Get the global $result which has createAstro and other methods
    const $result = globalThis.$result || globalThis.$$result || {
      styles: new Set(),
      scripts: new Set(),
      links: new Set(),
      createAstro: (Astro, p, s) => ({ ...Astro, props: p || {}, slots: s || {} }),
      resolve: (path) => path,
    };
    // Call component with proper signature: (result, props, slots)
    let output = await __astroComponent($result, props, {});

    // FIX: Properly resolve async render results
    output = await __resolveRenderResult(output);

    return output;
  }
  return null;
}
`;
}
