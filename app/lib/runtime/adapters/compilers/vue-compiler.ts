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
 * Vue Compiler implementation
 */
export class VueCompiler implements FrameworkCompiler {
  name = 'Vue';
  extensions = ['.vue'];

  private _compiler: VueCompilerSFC | null = null;
  private _initialized = false;
  private _idCounter = 0;

  /**
   * Initialize the Vue compiler
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
   * Check if this compiler can handle a file
   */
  canHandle(filename: string): boolean {
    return filename.endsWith('.vue');
  }

  /**
   * Compile a Vue SFC to JavaScript
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
      };
    } catch (error) {
      logger.error(`Failed to compile ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Assemble the final Vue component code
   */
  private assembleComponent(
    scriptCode: string,
    templateCode: string,
    css: string,
    filename: string,
    scopeId: string
  ): string {
    const componentName = this.getComponentName(filename);

    // If we have script setup / inlined template, the script code should be complete
    if (scriptCode.includes('export default') || scriptCode.includes('defineComponent')) {
      // Just ensure we have the runtime imports
      const imports = `import { h, createApp, defineComponent, ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue';\n`;

      // Inject CSS via JS
      const cssInjection = css
        ? `
// Inject component styles
(function() {
  if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.setAttribute('${scopeId}', '');
    style.textContent = ${JSON.stringify(css)};
    document.head.appendChild(style);
  }
})();
`
        : '';

      return `${imports}${cssInjection}${scriptCode}`;
    }

    // Fallback: assemble from parts
    return `
import { h, createApp, defineComponent, ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue';

// Inject component styles
${
  css
    ? `(function() {
  if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.setAttribute('${scopeId}', '');
    style.textContent = ${JSON.stringify(css)};
    document.head.appendChild(style);
  }
})();`
    : ''
}

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
}
