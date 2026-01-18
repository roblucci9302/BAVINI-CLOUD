# BAVINI CLOUD - Security Policy

## Vue d'ensemble

Ce document decrit les mesures de securite implementees dans BAVINI CLOUD pour proteger contre les attaques courantes et garantir l'integrite du systeme.

## Politique de validation

### Principe: Deny-by-Default

Toutes les commandes shell et actions non explicitement autorisees sont bloquees par defaut.

```typescript
// Si aucune regle ne matche, la commande est bloquee
return {
  level: 'blocked',
  message: 'Commande non reconnue - bloquee par defaut'
};
```

## Commandes Shell

### Commandes autorisees (execution automatique)

| Commande | Description |
|----------|-------------|
| `npm install`, `npm i`, `npm ci` | Installation de dependances |
| `npm run dev/build/test/lint/start` | Scripts de developpement standards |
| `npm ls`, `npm audit`, `npm outdated` | Commandes en lecture seule |
| `pnpm install`, `pnpm add`, `pnpm run dev/build/test` | Equivalents pnpm |
| `yarn install`, `yarn add`, `yarn run dev/build/test` | Equivalents yarn |
| `ls`, `pwd`, `cat`, `head`, `tail`, `grep` | Commandes lecture seule |
| `mkdir`, `touch` | Creation de fichiers/dossiers |
| `tsc`, `eslint`, `prettier` | Outils de developpement |

### Commandes necessitant approbation

| Commande | Raison |
|----------|--------|
| `git push/reset/rebase/merge` | Modification de l'historique |
| `git checkout -b` | Creation de branche |
| `npx *` | Peut telecharger et executer du code arbitraire |
| `npm publish`, `npm link` | Actions sensibles npm |
| `mv`, `cp` | Deplacement/copie de fichiers |
| `node script.js` | Execution de scripts Node.js |

### Commandes bloquees

| Commande | Raison |
|----------|--------|
| `rm`, `rm -rf` | Suppression de fichiers |
| `sudo`, `su` | Elevation de privileges |
| `curl`, `wget`, `fetch` | Telechargement externe |
| `chmod`, `chown` | Modification de permissions |
| Commandes avec `;`, `&&`, `\|\|`, `\|` | Chaining de commandes |
| Commandes avec `$()`, `` ` `` | Substitution de commandes |
| Chemins avec `../` | Traversee de repertoire |

## Validation des chemins de fichiers

### Patterns dangereux bloques

```typescript
const dangerousPatterns = [
  /\.\./,        // Path traversal
  /\/\//,        // Double slashes
  /%2e/i,        // URL-encoded .
  /%2f/i,        // URL-encoded /
  /\\/           // Backslashes (Windows)
];
```

### Extensions autorisees

```typescript
const ALLOWED_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.html', '.css', '.scss', '.less',
  '.svg', '.md', '.txt', '.yaml', '.yml',
  '.vue', '.svelte', '.astro'
];
```

### Limite de taille des fichiers

- **Maximum**: 5 MB par fichier
- Les fichiers depassant cette limite sont rejetes

## Protection contre les injections

### Injection de commandes

Detection et blocage des caracteres speciaux shell:
- `;` (chaining)
- `&&`, `||` (conditionnels)
- `|` (pipe)
- `$()`, `` ` `` (substitution)
- `>`, `<` (redirections)

### Path Traversal

Validation de tous les chemins de fichiers:
```typescript
function isPathSafe(path: string): boolean {
  const dangerous = [/\.\./, /\/\//, /%2e/i, /%2f/i, /\\/];
  return !dangerous.some(p => p.test(path));
}
```

### XSS dans le preview

- Le preview est isole dans une iframe avec sandbox
- Origin check sur les messages postMessage
- Pas d'execution de scripts provenant de l'utilisateur dans le contexte principal

## Rate Limiting

### Configuration

```typescript
const RATE_LIMITS = {
  chat: { requests: 60, window: 60 },  // 60 req/min
  agent: { requests: 30, window: 60 }, // 30 req/min
  build: { requests: 20, window: 60 }  // 20 req/min
};
```

### Stockage

- **Production**: Cloudflare KV (distribue)
- **Developpement**: Memoire locale

## Timeouts

### Timeouts par agent

| Agent | Timeout |
|-------|---------|
| Orchestrator | 30s |
| Coder | 180s (3 min) |
| Builder | 120s (2 min) |
| Tester | 60s |
| Reviewer | 60s |
| Fixer | 120s |

## Signalement de vulnerabilites

### Procedure

1. **Ne pas divulguer publiquement** la vulnerabilite avant qu'elle soit corrigee
2. Envoyer un email detaille a l'equipe de securite avec:
   - Description de la vulnerabilite
   - Etapes pour reproduire
   - Impact potentiel
   - Solution proposee (si applicable)

### Informations a inclure

```
Sujet: [SECURITY] Description courte

- Type de vulnerabilite
- Composant affecte
- Severite estimee (Critical/High/Medium/Low)
- Etapes de reproduction
- Preuve de concept (si applicable)
```

### Delais de reponse

| Severite | Reponse initiale | Resolution cible |
|----------|------------------|------------------|
| Critical | 24h | 7 jours |
| High | 48h | 14 jours |
| Medium | 7 jours | 30 jours |
| Low | 14 jours | 90 jours |

## Checklist de securite

### Avant chaque deploiement

- [ ] Tous les tests de securite passent
- [ ] Pas de secrets dans le code (`.env`, credentials)
- [ ] Rate limiting actif
- [ ] Logs de securite actifs
- [ ] CSP headers configures

### Review de code

- [ ] Validation des inputs utilisateur
- [ ] Pas d'injection possible
- [ ] Gestion correcte des erreurs (pas de leak d'info)
- [ ] Timeouts configures
- [ ] Principe du moindre privilege respecte

## Logs de securite

### Evenements logues

- Tentatives de commandes bloquees
- Echecs de validation de chemin
- Depassements de rate limit
- Erreurs d'authentification
- Timeouts d'agents

### Format des logs

```json
{
  "timestamp": "2026-01-18T12:00:00Z",
  "event": "command_blocked",
  "details": {
    "command": "rm -rf /",
    "reason": "Commande dangereuse",
    "ip": "192.168.1.1"
  }
}
```

## Mises a jour de securite

Ce document est mis a jour lors de:
- Ajout de nouvelles fonctionnalites de securite
- Decouverte et correction de vulnerabilites
- Changements dans les politiques de validation

**Derniere mise a jour**: 18 janvier 2026
