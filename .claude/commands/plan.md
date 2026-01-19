# /plan Command

> Planifier une feature complexe ou un refactoring majeur

## Usage

```
/plan <description de la feature ou du changement>
```

## Exemples

```
/plan Implémenter le BAVINI Runtime Phase 1 (Foundation)
/plan Ajouter le support Astro au browser build
/plan Migrer les stores de useState vers nanostores
/plan Refactorer le système de preview pour supporter HMR
```

## Ce que fait cette commande

1. **Analyse** la demande et le contexte du projet
2. **Explore** le codebase pour comprendre l'architecture existante
3. **Identifie** les fichiers et composants impactés
4. **Crée** un plan d'implémentation détaillé avec:
   - Overview
   - Requirements
   - Architecture changes
   - Implementation steps (phases)
   - Testing strategy
   - Risks et mitigations
   - Success criteria

## Agent utilisé

**planner** (Model: opus)

## Output

Un document markdown structuré avec toutes les étapes détaillées, prêt à être suivi pour l'implémentation.

## Quand utiliser

- Features complexes (> 3 fichiers impactés)
- Changements architecturaux
- Refactoring majeur
- Nouvelles intégrations
- Quand vous n'êtes pas sûr de l'approche
