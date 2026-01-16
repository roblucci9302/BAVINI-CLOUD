# BAVINI Project Configuration

## Contexte

BAVINI est un assistant de développement IA multi-agent basé sur Claude.
Le projet utilise React, Remix, TypeScript et Vite.
Architecture: système d'agents spécialisés (Orchestrator, Coder, Explorer, Builder, Tester, Deployer).

## Instructions

- Toujours utiliser TypeScript avec le mode strict
- Préférer les composants fonctionnels React avec hooks
- Utiliser les conventions de nommage camelCase pour les variables et PascalCase pour les composants
- Documenter les fonctions publiques avec JSDoc
- Éviter les `any` - utiliser des types précis ou `unknown`
- Les messages d'erreur doivent être en français pour l'utilisateur final

## Contraintes

- Pas de dépendances externes sans approbation
- Taille du bundle doit rester optimisée
- Tous les appels API doivent avoir une gestion d'erreur
- Les tests sont requis pour les fonctionnalités critiques
- Respecter la structure de dossiers existante

## Style de Code

Use 2 spaces for indentation.
Single quotes for strings.
No semicolons at end of statements.
Follow Prettier and ESLint configurations.

## Patterns

- Custom hooks pour la logique réutilisable (useXxx)
- Agents spécialisés pour chaque domaine (explore, coder, builder, etc.)
- Circuit breaker pour la résilience
- Checkpoints pour les tâches longues
- Tool Registry centralisé pour les outils

## Ignorer

- node_modules
- dist
- coverage
- .env
- .dev.vars
- *.log

## Custom

\`\`\`json
{
  "project": {
    "name": "BAVINI",
    "version": "25.0.0",
    "type": "multi-agent-ai-assistant"
  },
  "testing": {
    "framework": "vitest",
    "coverage_threshold": 80
  },
  "agents": {
    "default_model": "claude-sonnet-4-5-20250929",
    "orchestrator_model": "claude-opus-4-5-20251101",
    "extended_thinking": true
  }
}
\`\`\`
