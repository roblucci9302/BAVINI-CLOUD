/**
 * Détection automatique des erreurs dans les outputs
 */

import type { DetectedError } from './types';

/**
 * Détecte les erreurs dans le texte de sortie d'un agent
 */
export function detectErrorsInOutput(output: string): DetectedError[] {
  const errors: DetectedError[] = [];

  // TypeScript errors (TS####)
  const tsErrors = output.match(/error\s+TS\d+[:\s].+?(?=\n|$)/gi);

  if (tsErrors) {
    tsErrors.forEach((msg) => {
      errors.push({ type: 'typescript', message: msg.trim(), severity: 'high' });
    });
  }

  // Syntax errors
  const syntaxErrors = output.match(/SyntaxError[:\s].+?(?=\n|$)/gi);

  if (syntaxErrors) {
    syntaxErrors.forEach((msg) => {
      errors.push({ type: 'syntax', message: msg.trim(), severity: 'high' });
    });
  }

  // Import/Module errors (expanded patterns for npm packages)
  const importPatterns = [
    /Cannot find module ['"]([^'"]+)['"]/gi,
    /Module not found[:\s].+?(?=\n|$)/gi,
    /Failed to resolve import ['"]([^'"]+)['"]/gi,
    /Module ['"]([^'"]+)['"] has no exported member/gi,
    /Could not resolve ['"]([^'"]+)['"]/gi,
    /Cannot resolve module ['"]([^'"]+)['"]/gi,
    /Error: Cannot find module/gi,
    /ENOENT.*node_modules/gi,
  ];

  importPatterns.forEach((pattern) => {
    const matches = output.match(pattern);

    if (matches) {
      matches.forEach((msg) => {
        errors.push({ type: 'import', message: msg.trim(), severity: 'high' });
      });
    }
  });

  // NPM errors
  const npmErrors = output.match(/npm ERR![^\n]+/gi);

  if (npmErrors) {
    npmErrors.forEach((msg) => {
      errors.push({ type: 'build', message: msg.trim(), severity: 'high' });
    });
  }

  // Vite/esbuild specific errors
  const viteErrors = output.match(/\[vite\][:\s]*.+?(?=\n|$)/gi);

  if (viteErrors) {
    viteErrors.forEach((msg) => {
      if (msg.toLowerCase().includes('error')) {
        errors.push({ type: 'build', message: msg.trim(), severity: 'high' });
      }
    });
  }

  // Runtime errors (TypeError, ReferenceError, etc.)
  const runtimeErrors = output.match(/(?:TypeError|ReferenceError|RangeError)[:\s].+?(?=\n|$)/gi);

  if (runtimeErrors) {
    // Filter out false positives
    runtimeErrors
      .filter((msg) => !msg.includes('No route matches') && !msg.includes('.well-known'))
      .forEach((msg) => {
        errors.push({ type: 'runtime', message: msg.trim(), severity: 'medium' });
      });
  }

  // Build errors
  const buildErrors = output.match(
    /(?:Build failed|Compilation failed|Failed to compile|error during build)[:\s]?.+?(?=\n|$)/gi,
  );

  if (buildErrors) {
    buildErrors.forEach((msg) => {
      errors.push({ type: 'build', message: msg.trim(), severity: 'high' });
    });
  }

  // PostCSS/Tailwind specific errors
  const postcssErrors = output.match(/(?:PostCSS|Tailwind)[:\s]*(?:error|Error).+?(?=\n|$)/gi);

  if (postcssErrors) {
    postcssErrors.forEach((msg) => {
      errors.push({ type: 'build', message: msg.trim(), severity: 'high' });
    });
  }

  // Test failures
  const testErrors = output.match(/(?:FAIL|✗|×)\s*.+?(?=\n|$)/gi);

  if (testErrors) {
    testErrors.forEach((msg) => {
      errors.push({ type: 'test', message: msg.trim(), severity: 'medium' });
    });
  }

  // Deduplicate and limit
  const uniqueErrors = errors
    .filter((error, index, self) => index === self.findIndex((e) => e.message === error.message))
    .slice(0, 10); // Max 10 errors

  return uniqueErrors;
}

/**
 * Génère un prompt de correction pour le fixer agent
 */
export function buildFixerPrompt(errors: DetectedError[], sourceAgent: string): string {
  return `Tu dois corriger les erreurs suivantes détectées dans le code généré:

## Erreurs détectées:
${errors.map((e, i) => `${i + 1}. [${e.type}] ${e.message}`).join('\n')}

## Code problématique:
Le code a été généré par l'agent "${sourceAgent}".

## Instructions CRITIQUES:

### Pour les erreurs d'import/module (Cannot find module, Module not found):
1. **VÉRIFIE** si le package est dans package.json
2. Si NON, **AJOUTE-LE** dans package.json avec la bonne version
3. **EXÉCUTE** une commande shell: \`npm install\` ou \`npm install <package-name>\`
4. **REDÉMARRE** le serveur avec \`<boltAction type="restart">\`

### Pour les erreurs TypeScript/syntaxe:
1. Identifie le fichier exact
2. Corrige le code avec les balises <boltArtifact>

### Pour les erreurs de configuration:
1. Vérifie tailwind.config.js, vite.config.ts, tsconfig.json
2. Corrige la configuration manquante
3. **REDÉMARRE** le serveur avec \`<boltAction type="restart">\`

## FORMAT DE RÉPONSE OBLIGATOIRE:

Tu DOIS utiliser les balises <boltArtifact> pour:
- Créer/modifier des fichiers de code
- Exécuter des commandes shell (npm install, etc.)
- **REDÉMARRER** le serveur avec \`<boltAction type="restart">\`

Exemple pour une dépendance manquante:
\`\`\`
<boltArtifact id="install-deps" title="Installation des dépendances">
<boltAction type="shell">npm install tailwindcss postcss autoprefixer</boltAction>
<boltAction type="restart"></boltAction>
</boltArtifact>
\`\`\`

**IMPORTANT**: Termine TOUJOURS par \`<boltAction type="restart">\` pour appliquer les corrections.

Corrige TOUS les problèmes de manière définitive.`;
}
