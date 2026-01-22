/**
 * =============================================================================
 * BAVINI CLOUD - Vue Compiler Wrapper
 * =============================================================================
 * Wrapper for @vue/compiler-sfc with lazy loading.
 * Compiles .vue Single File Components to JavaScript for browser preview.
 * =============================================================================
 */

import type { FrameworkCompiler, CompilationResult } from './compiler-registry';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('VueCompiler');

/**
 * Types for @vue/compiler-sfc (loaded dynamically)
 */
interface VueCompilerSFC {
  parse: (source: string, options?: VueParseOptions) => VueSFCParseResult;
  compileScript: (sfc: VueSFCDescriptor, options: VueCompileScriptOptions) => VueSFCScriptBlock;
  compileTemplate: (options: VueCompileTemplateOptions) => VueTemplateCompileResults;
  compileStyleAsync: (options: VueCompileStyleOptions) => Promise<VueStyleCompileResults>;
}

interface VueParseOptions {
  filename?: string;
  sourceMap?: boolean;
}

interface VueSFCParseResult {
  descriptor: VueSFCDescriptor;
  errors: VueCompilerError[];
}

interface VueSFCDescriptor {
  filename: string;
  source: string;
  template: VueSFCBlock | null;
  script: VueSFCScriptBlock | null;
  scriptSetup: VueSFCScriptBlock | null;
  styles: VueSFCStyleBlock[];
  customBlocks: VueSFCBlock[];
}

interface VueSFCBlock {
  type: string;
  content: string;
  loc: { start: { line: number; column: number }; end: { line: number; column: number } };
  attrs: Record<string, string | true>;
}

interface VueSFCScriptBlock extends VueSFCBlock {
  lang?: string;
  setup?: boolean;
}

interface VueSFCStyleBlock extends VueSFCBlock {
  scoped?: boolean;
  module?: string | boolean;
  lang?: string;
}

interface VueCompileScriptOptions {
  id: string;
  inlineTemplate?: boolean;
  templateOptions?: VueCompileTemplateOptions;
}

interface VueCompileTemplateOptions {
  source: string;
  filename: string;
  id: string;
  scoped?: boolean;
  compilerOptions?: {
    scopeId?: string;
  };
}

interface VueTemplateCompileResults {
  code: string;
  source: string;
  errors: VueCompilerError[];
  tips: string[];
  map?: unknown;
}

interface VueCompileStyleOptions {
  source: string;
  filename: string;
  id: string;
  scoped?: boolean;
}

interface VueStyleCompileResults {
  code: string;
  errors: VueCompilerError[];
}

interface VueCompilerError {
  message: string;
  loc?: { start: { line: number; column: number } };
}

/**
 * CDN URL for Vue compiler
 */
const VUE_COMPILER_CDN = 'https://esm.sh/@vue/compiler-sfc@3.5.13';

/**
 * Vue Single File Component (SFC) Compiler
 *
 * Compiles `.vue` files to JavaScript using `@vue/compiler-sfc` loaded from CDN.
 * Supports Vue 3 features including:
 * - `<script setup>` syntax
 * - Scoped CSS with automatic scope ID generation
 * - TypeScript in `<script lang="ts">`
 *
 * @example
 * ```typescript
 * const compiler = new VueCompiler();
 * await compiler.init();
 *
 * const result = await compiler.compile(`
 *   <template>
 *     <button @click="count++">{{ count }}</button>
 *   </template>
 *   <script setup>
 *   import { ref } from 'vue';
 *   const count = ref(0);
 *   </script>
 *   <style scoped>
 *   button { color: blue; }
 *   </style>
 * `, 'Counter.vue');
 *
 * console.log(result.code); // Compiled JavaScript
 * console.log(result.css);  // Scoped CSS
 * ```
 *
 * @implements {FrameworkCompiler}
 */
export class VueCompiler implements FrameworkCompiler {
  /** Compiler display name */
  name = 'Vue';
  /** Supported file extensions */
  extensions = ['.vue'];

  private _compiler: VueCompilerSFC | null = null;
  private _initialized = false;
  private _idCounter = 0;

  /**
   * Initialize the Vue compiler by loading `@vue/compiler-sfc` from CDN.
   * Must be called before `compile()`.
   *
   * @throws {Error} If the compiler fails to load from CDN
   *
   * @example
   * ```typescript
   * const compiler = new VueCompiler();
   * await compiler.init(); // Loads compiler from esm.sh
   * ```
   */
  async init(): Promise<void> {
    if (this._initialized) {
      return;
    }

    const startTime = performance.now();
    logger.info('Initializing Vue compiler...');

    try {
      // Dynamically import the compiler from CDN
      const compilerModule = await import(/* @vite-ignore */ VUE_COMPILER_CDN);
      this._compiler = compilerModule;

      this._initialized = true;
      const loadTime = (performance.now() - startTime).toFixed(0);
      logger.info(`Vue compiler initialized (${loadTime}ms)`);
    } catch (error) {
      logger.error('Failed to initialize Vue compiler:', error);
      throw new Error(`Failed to load Vue compiler: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if this compiler can handle a given file based on its extension.
   *
   * @param filename - The filename to check (can include full path)
   * @returns `true` if the file has a `.vue` extension
   *
   * @example
   * ```typescript
   * compiler.canHandle('App.vue');           // true
   * compiler.canHandle('/src/Button.vue');   // true
   * compiler.canHandle('component.tsx');     // false
   * ```
   */
  canHandle(filename: string): boolean {
    return filename.endsWith('.vue');
  }

  /**
   * Compile a Vue Single File Component to JavaScript.
   *
   * Processes the SFC by:
   * 1. Parsing `<template>`, `<script>`, and `<style>` blocks
   * 2. Compiling `<script setup>` with inlined template
   * 3. Processing scoped styles with unique scope IDs
   * 4. Assembling the final component code
   *
   * @param source - The Vue SFC source code
   * @param filename - The filename (used for error messages and source maps)
   * @returns Compilation result with code, CSS, and any warnings
   *
   * @throws {Error} If the compiler is not initialized
   * @throws {Error} If the SFC has parsing errors
   *
   * @example
   * ```typescript
   * const result = await compiler.compile(vueSource, 'MyComponent.vue');
   *
   * // result.code - Compiled JavaScript (ES module)
   * // result.css - Compiled CSS with scoped selectors
   * // result.warnings - Array of warning messages
   * // result.cssMetadata - Metadata for CSS aggregation
   * ```
   */
  async compile(source: string, filename: string): Promise<CompilationResult> {
    if (!this._compiler || !this._initialized) {
      throw new Error('Vue compiler not initialized. Call init() first.');
    }

    const startTime = performance.now();
    logger.debug(`Compiling: ${filename}`);

    try {
      // Generate a unique ID for scoped styles
      const id = `data-v-${this.generateId()}`;

      // Parse the SFC
      const { descriptor, errors: parseErrors } = this._compiler.parse(source, {
        filename,
        sourceMap: true,
      });

      if (parseErrors.length > 0) {
        const errorMsg = parseErrors.map((e) => e.message).join('\n');
        throw new Error(`Vue parsing failed:\n${errorMsg}`);
      }

      const warnings: string[] = [];
      let code = '';
      let css = '';

      // Compile script (handles both <script> and <script setup>)
      let scriptCode = '';
      if (descriptor.script || descriptor.scriptSetup) {
        try {
          const scriptResult = this._compiler.compileScript(descriptor, {
            id,
            inlineTemplate: true,
            templateOptions: descriptor.template
              ? {
                  source: descriptor.template.content,
                  filename,
                  id,
                  scoped: descriptor.styles.some((s) => s.scoped),
                  compilerOptions: {
                    scopeId: id,
                  },
                }
              : undefined,
          });

          // DEBUG: Log the full structure of scriptResult to understand what we're getting
          logger.debug(`[compileScript] Result keys for ${filename}:`, Object.keys(scriptResult));
          logger.debug(`[compileScript] content preview (first 400 chars):`, scriptResult.content?.slice(0, 400));
          logger.debug(`[compileScript] content ending (last 400 chars):`, scriptResult.content?.slice(-400));
          logger.debug(`[compileScript] has export default:`, scriptResult.content?.includes('export default'));
          logger.debug(`[compileScript] has _sfc_main:`, scriptResult.content?.includes('_sfc_main'));

          scriptCode = scriptResult.content;
        } catch (e) {
          logger.warn('Script compilation failed, falling back to raw script:', e);
          scriptCode = descriptor.script?.content || descriptor.scriptSetup?.content || '';
        }
      }

      // Compile template (if not inlined)
      let templateCode = '';
      if (descriptor.template && !descriptor.scriptSetup) {
        const hasScoped = descriptor.styles.some((s) => s.scoped);
        const templateResult = this._compiler.compileTemplate({
          source: descriptor.template.content,
          filename,
          id,
          scoped: hasScoped,
          compilerOptions: {
            scopeId: hasScoped ? id : undefined,
          },
        });

        if (templateResult.errors.length > 0) {
          templateResult.errors.forEach((e) => warnings.push(e.message));
        }
        templateCode = templateResult.code;
      }

      // Compile styles
      const styleResults: string[] = [];
      for (const style of descriptor.styles) {
        try {
          const styleResult = await this._compiler.compileStyleAsync({
            source: style.content,
            filename,
            id,
            scoped: style.scoped,
          });

          if (styleResult.errors.length > 0) {
            styleResult.errors.forEach((e) => warnings.push(e.message));
          }
          styleResults.push(styleResult.code);
        } catch (e) {
          logger.warn('Style compilation failed, using raw CSS:', e);
          styleResults.push(style.content);
        }
      }
      css = styleResults.join('\n');

      // Assemble the final code
      code = this.assembleComponent(scriptCode, templateCode, css, filename, id);

      const compileTime = (performance.now() - startTime).toFixed(0);
      logger.debug(`Compiled ${filename} (${compileTime}ms)`);

      return {
        code,
        css,
        warnings,
        // CSS metadata for aggregation - CSS will be injected by the build adapter
        cssMetadata: css ? { type: 'component' as const, scopeId: id } : undefined,
      };
    } catch (error) {
      logger.error(`Failed to compile ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Assemble the final Vue component code
   *
   * IMPORTANT: The Vue SFC compiler (with inlineTemplate: true) generates COMPLETE code
   * including all necessary imports. We must detect this and return as-is to avoid duplicates.
   */
  private assembleComponent(
    scriptCode: string,
    templateCode: string,
    _css: string,
    filename: string,
    scopeId: string
  ): string {
    const componentName = this.getComponentName(filename);

    // DEBUG: Log code previews
    logger.debug(`[assembleComponent] scriptCode length: ${scriptCode.length}, templateCode length: ${templateCode.length}`);
    if (scriptCode) {
      logger.debug(`[assembleComponent] scriptCode preview for ${filename}:`, scriptCode.slice(0, 300));
    }
    if (templateCode) {
      logger.debug(`[assembleComponent] templateCode preview for ${filename}:`, templateCode.slice(0, 300));
    }

    // CRITICAL: Check BOTH scriptCode AND templateCode for existing Vue imports
    // The Vue SFC compiler can put imports in either location depending on the component structure:
    // - Components with <script setup>: imports in scriptCode (inlined template)
    // - Components with only <template>: imports in templateCode (separate template compilation)

    // Combine both for checking
    const allCode = scriptCode + templateCode;

    // Use simple string includes for reliability
    // Check 1: Simple string check for import from vue (both quote styles)
    const hasFromVue = allCode.includes("from 'vue'") || allCode.includes('from "vue"');

    // Check 2: Look for Vue render helpers which indicate compiled SFC code
    const hasRenderHelpers = allCode.includes('_openBlock') ||
                             allCode.includes('_createElementBlock') ||
                             allCode.includes('_createVNode') ||
                             allCode.includes('_createElementVNode');

    // Check 3: Look for _sfc_main which is the Vue SFC compiler output pattern
    const hasSfcMain = allCode.includes('_sfc_main');

    // Check 4: Look for import statement anywhere
    const hasImportKeyword = allCode.includes('import {') || allCode.includes('import{');

    logger.debug(`[assembleComponent] Detection results for ${filename}:`, {
      hasFromVue,
      hasRenderHelpers,
      hasSfcMain,
      hasImportKeyword,
      allCodeLength: allCode.length,
    });

    // If the code has Vue imports or SFC output markers, it's complete
    // We need to combine scriptCode and templateCode properly without adding more imports
    if (hasFromVue || hasSfcMain || (hasImportKeyword && hasRenderHelpers)) {
      logger.info(`Vue SFC code already complete, returning as-is for ${filename}`);

      // If we have both scriptCode and templateCode with imports already, combine them
      // But if templateCode has imports, we should NOT add scriptCode imports on top
      if (scriptCode && templateCode) {
        // Check if templateCode has its own imports (compiled separately)
        const templateHasImports = templateCode.includes("from 'vue'") || templateCode.includes('from "vue"');

        if (templateHasImports) {
          // Template was compiled separately with its own imports
          // We need to merge the script content without duplicating imports
          // The template code is complete, just add the script's component definition
          const scriptWithoutImports = this.stripImports(scriptCode);
          const combined = `${templateCode}\n\n${scriptWithoutImports}`;
          // Inject scopeId for scoped styles to work
          return this.injectScopeId(combined, scopeId);
        }
      }

      // If only scriptCode has imports (inlined template), inject scopeId for scoped styles
      if (scriptCode && !templateCode) {
        logger.info(`[SCOPEID] Injecting scopeId ${scopeId} into scriptCode for ${filename}`);

        // First, verify that scriptCode has export default
        const hasExport = scriptCode.includes('export default');
        if (!hasExport && scriptCode.includes('_sfc_main')) {
          // Vue compiler returned script without export, add it
          logger.info(`[SCOPEID] Adding missing export default _sfc_main`);
          const withExport = `${scriptCode}\n_sfc_main.__scopeId = '${scopeId}';\nexport default _sfc_main;`;
          return withExport;
        }

        const result = this.injectScopeId(scriptCode, scopeId);
        logger.debug(`[SCOPEID] Result preview (last 200 chars): ${result.slice(-200)}`);
        return result;
      }

      // If only templateCode has imports (template-only component, no script)
      // We need to create a proper component with export default
      if (templateCode && !scriptCode) {
        // templateCode has the render function but no export default
        // Check if it already has export default
        if (templateCode.includes('export default')) {
          return this.injectScopeId(templateCode, scopeId);
        }

        // Create a component wrapper for template-only components
        logger.debug(`Creating component wrapper for template-only component: ${filename}`);
        return `${templateCode}

const __component = {
  name: '${componentName}',
  render,
  __scopeId: '${scopeId}'
};

export default __component;
`;
      }

      // Both exist but no conflicts detected, inject scopeId and return
      const result = scriptCode || templateCode;
      return this.injectScopeId(result, scopeId);
    }

    // If we have export default but no imports, the code needs Vue imports added
    // This handles cases where the SFC compiler didn't inline the template
    if (scriptCode.includes('export default') || scriptCode.includes('defineComponent')) {
      logger.debug(`Adding Vue imports to code with export default for ${filename}`);
      const imports = `import { h, createApp, defineComponent, ref, reactive, computed, watch, onMounted, onUnmounted, openBlock as _openBlock, createElementBlock as _createElementBlock, createVNode as _createVNode, createElementVNode as _createElementVNode, createTextVNode as _createTextVNode, createBlock as _createBlock, Fragment as _Fragment, renderList as _renderList, withCtx as _withCtx, toDisplayString as _toDisplayString, normalizeClass as _normalizeClass, normalizeStyle as _normalizeStyle, resolveComponent as _resolveComponent } from 'vue';\n`;
      const codeWithImports = `${imports}${scriptCode}`;
      return this.injectScopeId(codeWithImports, scopeId);
    }

    // Fallback: assemble from parts (no existing export, no imports)
    // This is for edge cases where the SFC compiler didn't produce a complete module
    logger.debug(`Assembling component from parts for ${filename}`);
    const imports = `import { h, createApp, defineComponent, ref, reactive, computed, watch, onMounted, onUnmounted, openBlock as _openBlock, createElementBlock as _createElementBlock, createVNode as _createVNode, createElementVNode as _createElementVNode, Fragment as _Fragment, toDisplayString as _toDisplayString, normalizeClass as _normalizeClass } from 'vue';\n`;

    return `${imports}
${templateCode ? `${templateCode}\n` : ''}

${scriptCode || `const __script = { name: '${componentName}' };`}

const __component = typeof __default__ !== 'undefined' ? __default__ : (typeof __script !== 'undefined' ? __script : {});
${templateCode ? '__component.render = render;' : ''}
__component.__scopeId = '${scopeId}';

export default __component;
`;
  }

  /**
   * Generate a unique ID for scoped styles
   */
  private generateId(): string {
    return (++this._idCounter).toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /**
   * Extract component name from filename
   */
  private getComponentName(filename: string): string {
    const base = filename.split('/').pop() || 'Component';
    const name = base.replace(/\.vue$/, '');
    // Convert to PascalCase
    return name.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase());
  }

  /**
   * Strip import statements from code to avoid duplicates when merging
   */
  private stripImports(code: string): string {
    // Remove import statements from 'vue'
    // Handles both single and multi-line imports
    return code
      .replace(/import\s*\{[^}]*\}\s*from\s*['"]vue['"];?\s*/g, '')
      .replace(/import\s+\w+\s+from\s*['"]vue['"];?\s*/g, '')
      .trim();
  }

  /**
   * Inject __scopeId into code that has export default
   * This is critical for Vue scoped styles to work correctly.
   *
   * Vue 3's runtime uses __scopeId on the component to add data-v-xxx
   * attributes to rendered elements. Without this, scoped CSS selectors
   * like .class[data-v-xxx] won't match any elements.
   */
  private injectScopeId(code: string, scopeId: string): string {
    // If code already has __scopeId defined, don't add another
    if (code.includes('__scopeId')) {
      logger.info(`[SCOPEID] Code already has __scopeId, skipping injection`);
      return code;
    }

    // DIAGNOSTIC: Find where export default is in the code
    const exportIndex = code.indexOf('export default');
    const hasExportDefault = exportIndex !== -1;
    const hasSfcMain = code.includes('_sfc_main');

    // Also check for alternative export patterns
    const hasExportKeyword = code.includes('export');
    const hasDefaultKeyword = code.includes('default');

    logger.info(`[SCOPEID] Diagnostic: codeLength=${code.length}, hasExport=${hasExportKeyword}, hasDefault=${hasDefaultKeyword}, hasExportDefault=${hasExportDefault}, exportIndex=${exportIndex}, hasSfcMain=${hasSfcMain}`);
    if (hasExportDefault) {
      logger.info(`[SCOPEID] Export context: ${code.slice(exportIndex, Math.min(exportIndex + 100, code.length)).replace(/\n/g, '\\n')}`);
    } else if (hasExportKeyword) {
      // Find where 'export' appears
      const exportOnlyIndex = code.indexOf('export');
      logger.info(`[SCOPEID] Export keyword found at ${exportOnlyIndex}: ${code.slice(exportOnlyIndex, Math.min(exportOnlyIndex + 80, code.length)).replace(/\n/g, '\\n')}`);
    }

    // Log both beginning and end of code to understand the structure
    logger.info(`[SCOPEID] Code start (first 200 chars): ${code.slice(0, 200).replace(/\n/g, '\\n')}`);
    logger.info(`[SCOPEID] Code end (last 150 chars): ${code.slice(-150).replace(/\n/g, '\\n')}`);

    // Pattern 1: export default _sfc_main (most common from @vue/compiler-sfc)
    // Transform: export default _sfc_main → _sfc_main.__scopeId = 'data-v-xxx'; export default _sfc_main
    const sfcMainMatch = code.match(/export\s+default\s+(_sfc_main)\s*;?\s*$/);
    if (sfcMainMatch) {
      logger.info(`[SCOPEID] Pattern 1 matched: export default _sfc_main`);
      const varName = sfcMainMatch[1];
      const injection = `${varName}.__scopeId = '${scopeId}';\n`;
      return code.replace(
        /export\s+default\s+_sfc_main\s*;?\s*$/,
        `${injection}export default ${varName};`
      );
    }

    // Pattern 2: export default { ... } (inline object export at end of file)
    // Need to wrap in a variable first
    if (code.match(/export\s+default\s+\{/)) {
      // Find where the export default starts - must be at end of file
      const exportMatch = code.match(/export\s+default\s+(\{[\s\S]*\})\s*;?\s*$/);
      if (exportMatch) {
        logger.info(`[SCOPEID] Pattern 2 matched: export default { ... } at end of file`);
        const objContent = exportMatch[1];
        logger.debug(`[SCOPEID] Pattern 2 object content length: ${objContent.length}`);
        // Create a wrapper variable
        const result = code.replace(
          /export\s+default\s+(\{[\s\S]*\})\s*;?\s*$/,
          `const __sfc_component__ = ${objContent};\n__sfc_component__.__scopeId = '${scopeId}';\nexport default __sfc_component__;`
        );
        logger.info(`[SCOPEID] Pattern 2 injection successful, added __scopeId: ${scopeId}`);
        return result;
      }
    }

    // Pattern 3: export default defineComponent({ ... })
    const defineComponentMatch = code.match(/export\s+default\s+(defineComponent\([^)]*\))\s*;?\s*$/);
    if (defineComponentMatch) {
      const expr = defineComponentMatch[1];
      return code.replace(
        /export\s+default\s+defineComponent\([^)]*\)\s*;?\s*$/,
        `const __sfc_component__ = ${expr};\n__sfc_component__.__scopeId = '${scopeId}';\nexport default __sfc_component__;`
      );
    }

    // Pattern 4: Generic - find export default <identifier>
    const identifierMatch = code.match(/export\s+default\s+(\w+)\s*;?\s*$/);
    if (identifierMatch) {
      logger.info(`[SCOPEID] Pattern 4 matched: export default ${identifierMatch[1]}`);
      const varName = identifierMatch[1];
      const injection = `${varName}.__scopeId = '${scopeId}';\n`;
      return code.replace(
        new RegExp(`export\\s+default\\s+${varName}\\s*;?\\s*$`),
        `${injection}export default ${varName};`
      );
    }

    // Pattern 5: export default _defineComponent(...) or export default /* @__PURE__ */ _defineComponent(...)
    // Find export default followed by _defineComponent or defineComponent
    const sfcDefineMatch = code.match(/export\s+default\s+(?:\/\*[^*]*\*\/\s*)?(_?defineComponent\s*\([^)]*\{)/);
    if (sfcDefineMatch) {
      logger.info(`[SCOPEID] Pattern 5 matched: export default defineComponent`);
      // Find the position of export default
      const exportIndex = code.indexOf('export default');
      if (exportIndex !== -1) {
        // Find where the export ends (the closing of defineComponent)
        // We need to find the matching closing parenthesis and brace
        let depth = 0;
        let inString = false;
        let stringChar = '';
        let exportEnd = -1;

        for (let i = exportIndex; i < code.length; i++) {
          const char = code[i];
          const prevChar = i > 0 ? code[i-1] : '';

          if (!inString) {
            if (char === '"' || char === "'" || char === '`') {
              inString = true;
              stringChar = char;
            } else if (char === '(' || char === '{') {
              depth++;
            } else if (char === ')' || char === '}') {
              depth--;
              if (depth === 0 && char === ')') {
                exportEnd = i + 1;
                break;
              }
            }
          } else {
            if (char === stringChar && prevChar !== '\\') {
              inString = false;
            }
          }
        }

        if (exportEnd !== -1) {
          // Extract the defineComponent expression
          const exportExpr = code.slice(exportIndex + 'export default'.length, exportEnd).trim();
          const beforeExport = code.slice(0, exportIndex);
          const afterExport = code.slice(exportEnd);

          const result = `${beforeExport}const __sfc_component__ = ${exportExpr};\n__sfc_component__.__scopeId = '${scopeId}';\nexport default __sfc_component__;${afterExport}`;
          logger.info(`[SCOPEID] Pattern 5 injection successful`);
          return result;
        }
      }
    }

    // Pattern 6: export default { ... } (inline object) - anywhere in code
    const inlineObjectMatch = code.match(/export\s+default\s+\{/);
    if (inlineObjectMatch) {
      logger.info(`[SCOPEID] Pattern 6 matched: export default { ... }`);
      const exportIndex = code.indexOf('export default');
      if (exportIndex !== -1) {
        // Find the matching closing brace for the object
        const startBrace = code.indexOf('{', exportIndex);
        if (startBrace !== -1) {
          let depth = 0;
          let inString = false;
          let stringChar = '';
          let endBrace = -1;

          for (let i = startBrace; i < code.length; i++) {
            const char = code[i];
            const prevChar = i > 0 ? code[i-1] : '';

            if (!inString) {
              if (char === '"' || char === "'" || char === '`') {
                inString = true;
                stringChar = char;
              } else if (char === '{') {
                depth++;
              } else if (char === '}') {
                depth--;
                if (depth === 0) {
                  endBrace = i + 1;
                  break;
                }
              }
            } else {
              if (char === stringChar && prevChar !== '\\') {
                inString = false;
              }
            }
          }

          if (endBrace !== -1) {
            const objectContent = code.slice(startBrace, endBrace);
            const beforeExport = code.slice(0, exportIndex);
            const afterExport = code.slice(endBrace);

            const result = `${beforeExport}const __sfc_component__ = ${objectContent};\n__sfc_component__.__scopeId = '${scopeId}';\nexport default __sfc_component__;${afterExport}`;
            logger.info(`[SCOPEID] Pattern 6 injection successful`);
            return result;
          }
        }
      }
    }

    // Pattern 7: Generic fallback - find any export default <identifier> anywhere
    // Handle optional /* @__PURE__ */ or other comments between export default and identifier
    const anyExportMatch = code.match(/export\s+default\s+(?:\/\*[^*]*\*\/\s*)?(\w+)/);
    if (anyExportMatch) {
      logger.info(`[SCOPEID] Pattern 7 matched: export default ${anyExportMatch[1]}`);
      const varName = anyExportMatch[1];
      // Insert scopeId assignment before the export
      const exportIdx = code.indexOf('export default');
      if (exportIdx !== -1) {
        const injection = `${varName}.__scopeId = '${scopeId}';\n`;
        return code.slice(0, exportIdx) + injection + code.slice(exportIdx);
      }
    }

    // Log that no regex pattern matched
    logger.warn(`[SCOPEID] No regex pattern matched, trying fallback approaches`);

    // FALLBACK: If no export pattern matched, try to find _sfc_main variable directly
    // Vue SFC compiler always names the component variable _sfc_main
    if (code.includes('_sfc_main')) {
      logger.info(`[SCOPEID] Fallback: Found _sfc_main variable, injecting scopeId`);
      // Find where _sfc_main is defined and add __scopeId after the definition
      // Look for the line "export default _sfc_main" or just add before it
      const sfcMainExportIdx = code.indexOf('export default _sfc_main');
      if (sfcMainExportIdx !== -1) {
        const injection = `_sfc_main.__scopeId = '${scopeId}';\n`;
        return code.slice(0, sfcMainExportIdx) + injection + code.slice(sfcMainExportIdx);
      }

      // If no export found, append scopeId assignment at the end
      logger.info(`[SCOPEID] Fallback: No export found, appending to end`);
      return `${code}\n_sfc_main.__scopeId = '${scopeId}';\nexport default _sfc_main;`;
    }

    // FINAL FALLBACK: If code has defineComponent, wrap it
    if (code.includes('defineComponent')) {
      logger.info(`[SCOPEID] Final fallback: wrapping defineComponent`);
      // Find the defineComponent call and wrap it
      const defineIdx = code.indexOf('defineComponent(');
      if (defineIdx !== -1) {
        // Find the matching closing parenthesis
        let depth = 0;
        let foundStart = false;
        let endIdx = -1;

        for (let i = defineIdx; i < code.length; i++) {
          if (code[i] === '(') {
            depth++;
            foundStart = true;
          } else if (code[i] === ')') {
            depth--;
            if (foundStart && depth === 0) {
              endIdx = i + 1;
              break;
            }
          }
        }

        if (endIdx !== -1) {
          // Check if this is preceded by export default
          const beforeDefine = code.slice(0, defineIdx).trim();
          if (beforeDefine.endsWith('export default')) {
            const exportStart = code.lastIndexOf('export default', defineIdx);
            const defineExpr = code.slice(defineIdx, endIdx);
            const result = code.slice(0, exportStart) +
              `const __sfc_component__ = ${defineExpr};\n__sfc_component__.__scopeId = '${scopeId}';\nexport default __sfc_component__;` +
              code.slice(endIdx);
            return result;
          }
        }
      }
    }

    // If all else fails, just log and return as-is
    logger.warn(`[SCOPEID] Could not inject __scopeId for scopeId: ${scopeId}`);
    logger.warn(`[SCOPEID] Code ending: ${code.slice(-300)}`);
    return code;
  }
}
