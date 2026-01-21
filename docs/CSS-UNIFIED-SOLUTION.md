# Solution Unifiée CSS - BAVINI

## Problème Actuel

Chaque compilateur (Vue, Svelte, Astro, Tailwind) gère le CSS différemment:
- Vue: injection via IIFE dans le code JS
- Svelte: CSS injecté par le compilateur
- Astro: extraction manuelle par regex (cassé)
- Tailwind: compilation JIT séparée

**Résultat**: CSS fragmenté, pas d'ordre garanti, pollution globale.

---

## Solution: CSS Aggregator Centralisé

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CSS AGGREGATOR                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. COLLECT PHASE                                           │
│     ├── Vue styles (scoped)                                 │
│     ├── Svelte styles (scoped)                              │
│     ├── Astro styles (extracted)                            │
│     ├── Plain CSS files                                     │
│     └── Tailwind directives                                 │
│                                                              │
│  2. PROCESS PHASE                                           │
│     ├── Tailwind JIT compilation                            │
│     ├── CSS variable resolution                             │
│     ├── Deduplication                                       │
│     └── Source map generation                               │
│                                                              │
│  3. OUTPUT PHASE                                            │
│     └── Single <style> tag with all CSS                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Implémentation

```typescript
// app/lib/runtime/adapters/css-aggregator.ts

interface CSSEntry {
  id: string;           // Unique identifier (file path)
  content: string;      // CSS content
  scope?: string;       // Scoping prefix (for Vue/Svelte)
  order: number;        // Import order for cascade
  source: 'vue' | 'svelte' | 'astro' | 'css' | 'tailwind';
}

class CSSAggregator {
  private entries: Map<string, CSSEntry> = new Map();
  private tailwindCompiler: TailwindCompiler;

  // Collect CSS from any source
  addCSS(entry: CSSEntry): void {
    // Deduplicate by ID
    this.entries.set(entry.id, entry);
  }

  // Process all collected CSS
  async compile(contentFiles: Map<string, string>): Promise<string> {
    // 1. Sort by order
    const sorted = [...this.entries.values()]
      .sort((a, b) => a.order - b.order);

    // 2. Separate Tailwind from regular CSS
    const tailwindCSS: string[] = [];
    const regularCSS: string[] = [];

    for (const entry of sorted) {
      if (this.hasTailwindDirectives(entry.content)) {
        tailwindCSS.push(entry.content);
      } else {
        regularCSS.push(this.scopeCSS(entry));
      }
    }

    // 3. Compile Tailwind with all content files
    let compiledTailwind = '';
    if (tailwindCSS.length > 0) {
      compiledTailwind = await this.tailwindCompiler.compile(
        tailwindCSS.join('\n'),
        contentFiles
      );
    }

    // 4. Combine: Base → Tailwind → Component CSS
    return [
      this.getBaseCSS(),
      compiledTailwind,
      ...regularCSS
    ].filter(Boolean).join('\n\n');
  }

  private getBaseCSS(): string {
    return `
/* BAVINI Design System */
:root {
  --color-primary: #6366f1;
  --color-secondary: #8b5cf6;
  --color-background: #ffffff;
  --color-surface: #f8fafc;
  --color-text: #1e293b;
  --color-text-muted: #64748b;
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}

.dark {
  --color-background: #0f172a;
  --color-surface: #1e293b;
  --color-text: #f1f5f9;
  --color-text-muted: #94a3b8;
}

*, *::before, *::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background: var(--color-background);
  color: var(--color-text);
}
`;
  }

  private scopeCSS(entry: CSSEntry): string {
    if (!entry.scope) return entry.content;

    // Add scope prefix to all selectors
    return entry.content.replace(
      /([^\r\n,{}]+)(,(?=[^}]*{)|\s*{)/g,
      (match, selector, suffix) => {
        // Skip @rules
        if (selector.trim().startsWith('@')) return match;
        return `${selector.trim()}[${entry.scope}]${suffix}`;
      }
    );
  }

  private hasTailwindDirectives(css: string): boolean {
    return /@tailwind|@apply|@layer/.test(css);
  }

  clear(): void {
    this.entries.clear();
  }
}
```

### Modifications des Compilateurs

#### Vue Compiler
```typescript
// Au lieu d'injecter le CSS dans le JS:
// AVANT:
const cssInjection = `(function(){ ... })();`;

// APRÈS:
// Retourner le CSS séparément
return {
  code: jsCode,
  css: extractedCSS,  // CSS Aggregator le collectera
  scope: scopeId
};
```

#### Astro Compiler
```typescript
// Au lieu d'extraction regex manuelle:
// AVANT:
const extractedCss = this.extractStylesFromSource(source, filename);

// APRÈS:
// Utiliser le CSS du compilateur Astro + fallback regex
const result = await this._compiler.transform(source, options);
let css = '';

// 1. Essayer d'obtenir le CSS du compilateur
if (result.css) {
  css = result.css;
} else {
  // 2. Fallback: extraction manuelle
  css = this.extractStylesFromSource(source, filename);
}

return { code, css };
```

#### Browser Build Adapter
```typescript
// Nouveau flow dans build()
async build(files: Map<string, string>, entryPoint: string): Promise<BuildResult> {
  // 1. Créer l'aggregator
  const cssAggregator = new CSSAggregator();

  // 2. Compiler chaque fichier, collecter le CSS
  for (const [path, content] of files) {
    const result = await this.compileFile(path, content);

    if (result.css) {
      cssAggregator.addCSS({
        id: path,
        content: result.css,
        scope: result.scope,
        order: this.getImportOrder(path),
        source: this.detectSource(path)
      });
    }
  }

  // 3. Compiler tout le CSS en une fois
  const finalCSS = await cssAggregator.compile(files);

  // 4. Injecter dans le HTML
  return this.injectBundle(html, jsBundle, finalCSS);
}
```

---

## Avantages de cette Solution

| Aspect | Avant | Après |
|--------|-------|-------|
| **Ordre CSS** | Non garanti | Contrôlé par import order |
| **Duplication** | Possible | Dédupliqué par ID |
| **Tailwind** | Compilé séparément | Intégré au pipeline |
| **Scoping** | Incohérent | Unifié |
| **Debug** | Difficile | Source maps possibles |
| **Performance** | Multiple `<style>` tags | Single `<style>` tag |

---

## Plan d'Implémentation

### Phase 1: CSS Aggregator (1-2 jours)
- [ ] Créer `css-aggregator.ts`
- [ ] Implémenter collect/process/output
- [ ] Tests unitaires

### Phase 2: Modifier les Compilateurs (2-3 jours)
- [ ] Vue: retourner CSS séparément
- [ ] Svelte: retourner CSS séparément
- [ ] Astro: améliorer extraction CSS
- [ ] Tailwind: intégrer dans aggregator

### Phase 3: Browser Build Adapter (1-2 jours)
- [ ] Intégrer CSS Aggregator
- [ ] Supprimer injections CSS individuelles
- [ ] Tester tous les frameworks

### Phase 4: Tests & Polish (1-2 jours)
- [ ] Tests d'intégration
- [ ] Source maps (optionnel)
- [ ] Documentation

---

## Alternative Rapide (Quick Fix)

Si une refonte complète n'est pas possible immédiatement, voici un fix rapide pour Astro:

```typescript
// Dans browser-build-adapter.ts, après le build esbuild

// Injecter Tailwind CDN si aucun CSS compilé
if (!css || css.length < 100) {
  const tailwindCDN = `<script src="https://cdn.tailwindcss.com"></script>`;
  html = html.replace('</head>', `${tailwindCDN}\n</head>`);
}
```

Ceci est déjà partiellement implémenté mais peut être amélioré.
