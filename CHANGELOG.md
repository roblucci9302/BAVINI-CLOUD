# Changelog

Toutes les modifications notables de BAVINI sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

### Added
- Documentation complète des composants (`docs/COMPONENTS.md`)
- Documentation de la base de données (`docs/DATABASE.md`)
- 4 Architecture Decision Records (`docs/adr/`)
- Documentation API (`docs/API.md`)
- JSDoc complet pour les stores et hooks
- Tests unitaires complets (~3500 cas de test)

## [1.2.0] - 2024-12

### Added
- **Système Multi-Agents** : 8 agents spécialisés avec orchestrateur
  - Orchestrator : planification et délégation
  - Explore : analyse du codebase
  - Coder : génération de code
  - Builder : gestion des dépendances
  - Tester : écriture de tests
  - Deployer : déploiement
  - Reviewer : revue de code
  - Fixer : correction de bugs
- **Modes de contrôle** : strict, moderate, permissive
- **Panneau d'activité** : logs en temps réel des agents
- **Modal d'approbation** : validation des actions proposées

### Changed
- Interface du chat redesignée avec support multi-agent
- Bouton d'envoi redésigné avec menu contextuel

### Fixed
- Auto-scroll du chat corrigé
- Race condition sur l'affichage du workbench

## [1.1.0] - 2024-11

### Added
- **Preview responsive** : sélecteur de device (mobile, tablet, desktop)
- **Mode plein écran** : preview en fullscreen
- **Connecteurs** : Figma, Notion, Stripe intégrés
- **Quick links** : accès rapide aux connecteurs dans le workbench
- **Time Travel** : système de checkpoints avec restauration

### Changed
- Workbench persistant entre les sessions
- Scroll indépendant pour le chat et le workbench
- Migration de IndexedDB vers PGlite

### Fixed
- Timeout de la base de données augmenté
- Flash vers l'écran de bienvenue pendant le chargement
- Extraction du messageId dans les artifacts

## [1.0.0] - 2024-10

### Added
- **Chat IA** : conversation avec Claude pour générer du code
- **WebContainer** : exécution Node.js dans le navigateur
- **Éditeur Monaco** : édition de code avec coloration syntaxique
- **Preview live** : prévisualisation en temps réel des applications
- **Terminal** : accès au shell WebContainer
- **Persistance** : sauvegarde des conversations dans IndexedDB
- **Thème** : support clair/sombre
- **Artifacts** : affichage des fichiers générés

### Technical
- React 18 avec Remix
- TypeScript strict
- Vitest pour les tests
- Tailwind CSS + UnoCSS

---

## Types de changements

- `Added` : nouvelles fonctionnalités
- `Changed` : modifications de fonctionnalités existantes
- `Deprecated` : fonctionnalités qui seront supprimées
- `Removed` : fonctionnalités supprimées
- `Fixed` : corrections de bugs
- `Security` : corrections de vulnérabilités
