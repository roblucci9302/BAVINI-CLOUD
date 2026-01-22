/**
 * =============================================================================
 * BAVINI Dev Server - Vue HMR Plugin
 * =============================================================================
 * Enables Hot Module Replacement for Vue Single File Components.
 * =============================================================================
 */

import type { DevServerPlugin, TransformResult, PluginContext, HotUpdateContext, ModuleNode } from '../types';

/**
 * Vue HMR runtime code
 * Handles Vue component hot updates
 */
const VUE_HMR_RUNTIME = `
const __VUE_HMR_RUNTIME__ = {
  records: new Map(),

  createRecord(id, component) {
    if (this.records.has(id)) {
      return false;
    }
    this.records.set(id, {
      id,
      component,
      instances: new Set()
    });
    return true;
  },

  rerender(id, newRender) {
    const record = this.records.get(id);
    if (!record) return;

    record.component.render = newRender;
    record.instances.forEach(instance => {
      instance.render = newRender;
      instance.$forceUpdate();
    });
  },

  reload(id, newComponent) {
    const record = this.records.get(id);
    if (!record) return;

    // Update component definition
    Object.assign(record.component, newComponent);

    // Force update all instances
    record.instances.forEach(instance => {
      // For Vue 3
      if (instance.$.type) {
        Object.assign(instance.$.type, newComponent);
        instance.$forceUpdate();
      }
      // For Vue 2
      else if (instance._isVue) {
        instance.$forceUpdate();
      }
    });
  },

  registerInstance(id, instance) {
    const record = this.records.get(id);
    if (record) {
      record.instances.add(instance);
    }
  },

  unregisterInstance(id, instance) {
    const record = this.records.get(id);
    if (record) {
      record.instances.delete(instance);
    }
  }
};

// Expose globally
window.__VUE_HMR_RUNTIME__ = __VUE_HMR_RUNTIME__;

export default __VUE_HMR_RUNTIME__;
`;

/**
 * Vue HMR preamble injected into SFC
 */
const VUE_HMR_PREAMBLE = `
import __VUE_HMR_RUNTIME__ from '/@vue-hmr';
`;

/**
 * Check if file is a Vue SFC
 */
function isVueSFC(id: string): boolean {
  return id.endsWith('.vue');
}

/**
 * Check if code contains Vue component
 */
function isVueComponent(code: string): boolean {
  // Check for Vue 3 patterns
  if (/defineComponent\s*\(/.test(code)) return true;
  if (/setup\s*\(/.test(code)) return true;
  if (/from\s+['"]vue['"]/.test(code)) return true;

  // Check for Vue 2 patterns
  if (/export\s+default\s*\{[\s\S]*(?:data|methods|computed|watch)\s*:/.test(code)) return true;

  // Check for SFC template
  if (/<template>/.test(code)) return true;

  return false;
}

/**
 * Generate HMR code for Vue component
 */
function generateVueHMRCode(componentId: string, hasScript: boolean): string {
  const hmrId = JSON.stringify(componentId);

  if (!hasScript) {
    // Template-only component
    return `
if (import.meta.hot) {
  __VUE_HMR_RUNTIME__.createRecord(${hmrId}, __component__);
  import.meta.hot.accept(({ default: updated }) => {
    __VUE_HMR_RUNTIME__.reload(${hmrId}, updated);
  });
}
`;
  }

  return `
if (import.meta.hot) {
  __VUE_HMR_RUNTIME__.createRecord(${hmrId}, __component__);

  import.meta.hot.accept(({ default: updated, _rerender_only }) => {
    if (_rerender_only) {
      __VUE_HMR_RUNTIME__.rerender(${hmrId}, updated.render);
    } else {
      __VUE_HMR_RUNTIME__.reload(${hmrId}, updated);
    }
  });
}
`;
}

/**
 * Parse Vue SFC and extract parts
 */
interface SFCDescriptor {
  template: string | null;
  script: string | null;
  scriptSetup: string | null;
  styles: Array<{ content: string; scoped: boolean; lang: string }>;
}

function parseSFC(code: string): SFCDescriptor {
  const descriptor: SFCDescriptor = {
    template: null,
    script: null,
    scriptSetup: null,
    styles: [],
  };

  // Extract template
  const templateMatch = code.match(/<template[^>]*>([\s\S]*?)<\/template>/);
  if (templateMatch) {
    descriptor.template = templateMatch[1].trim();
  }

  // Extract script
  const scriptMatch = code.match(/<script(?![^>]*setup)[^>]*>([\s\S]*?)<\/script>/);
  if (scriptMatch) {
    descriptor.script = scriptMatch[1].trim();
  }

  // Extract script setup
  const scriptSetupMatch = code.match(/<script[^>]*setup[^>]*>([\s\S]*?)<\/script>/);
  if (scriptSetupMatch) {
    descriptor.scriptSetup = scriptSetupMatch[1].trim();
  }

  // Extract styles
  const styleRegex = /<style([^>]*)>([\s\S]*?)<\/style>/g;
  let styleMatch;
  while ((styleMatch = styleRegex.exec(code)) !== null) {
    const attrs = styleMatch[1];
    descriptor.styles.push({
      content: styleMatch[2].trim(),
      scoped: attrs.includes('scoped'),
      lang: attrs.match(/lang=["']([^"']+)["']/)?.[1] || 'css',
    });
  }

  return descriptor;
}

/**
 * Transform Vue SFC for HMR
 */
function transformVueSFC(code: string, id: string): TransformResult {
  const descriptor = parseSFC(code);
  const hasScript = !!(descriptor.script || descriptor.scriptSetup);

  // Build transformed code
  let result = VUE_HMR_PREAMBLE;

  // Add script content
  if (descriptor.scriptSetup) {
    // Vue 3 script setup
    result += `\n${descriptor.scriptSetup}\n`;
  } else if (descriptor.script) {
    result += `\n${descriptor.script}\n`;
  } else {
    result += '\nconst __component__ = {};\n';
  }

  // Add template compilation note
  if (descriptor.template) {
    result += `\n// Template: ${descriptor.template.slice(0, 50)}...\n`;
    result += `__component__.template = ${JSON.stringify(descriptor.template)};\n`;
  }

  // Add HMR code
  result += generateVueHMRCode(id, hasScript);

  // Handle styles (emit as separate CSS)
  const cssDeps: string[] = [];
  descriptor.styles.forEach((style, index) => {
    const styleId = `${id}?type=style&index=${index}`;
    cssDeps.push(styleId);
  });

  return {
    code: result,
    deps: ['/@vue-hmr', ...cssDeps],
  };
}

/**
 * Create Vue HMR plugin
 */
export function vueHMRPlugin(): DevServerPlugin {
  return {
    name: 'bavini:vue-hmr',

    configureServer(server) {
      // Register route for Vue HMR runtime
      server.route('/@vue-hmr', async () => ({
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'Content-Type': 'application/javascript' }),
        body: VUE_HMR_RUNTIME,
      }));
    },

    transform(code: string, id: string, _ctx: PluginContext): TransformResult | null {
      // Handle .vue files
      if (isVueSFC(id)) {
        return transformVueSFC(code, id);
      }

      // Handle JS files with Vue components
      const ext = id.split('.').pop()?.toLowerCase();
      if (['js', 'ts'].includes(ext || '') && isVueComponent(code)) {
        // Add HMR support to Vue component JS files
        const hmrCode = generateVueHMRCode(id, true);
        return {
          code: VUE_HMR_PREAMBLE + code + hmrCode,
          deps: ['/@vue-hmr'],
        };
      }

      return null;
    },

    handleHotUpdate(ctx: HotUpdateContext): ModuleNode[] | void {
      // Filter to only Vue files
      const vueModules = ctx.modules.filter(mod => {
        return isVueSFC(mod.url) || (mod.transformedCode && isVueComponent(mod.transformedCode));
      });

      if (vueModules.length === 0) {
        return;
      }

      // Check if only template changed (rerender only)
      const file = ctx.file;
      if (isVueSFC(file)) {
        // Could analyze what changed and set _rerender_only flag
        // For now, do full reload of component
      }

      return vueModules;
    },
  };
}

export default vueHMRPlugin;
