# ADR-001: Architecture Multi-Agents

## Statut

Accepté

## Date

2024-12

## Contexte

BAVINI est un environnement de développement web alimenté par l'IA. Le système initial utilisait un seul prompt monolithique pour générer du code, ce qui présentait des limitations :

1. **Complexité croissante** : Un seul prompt ne peut pas gérer efficacement toutes les tâches (exploration, codage, tests, déploiement)
2. **Manque de spécialisation** : Différentes tâches nécessitent différentes approches et prompts système
3. **Difficulté de contrôle** : L'utilisateur ne peut pas intervenir sur des actions spécifiques
4. **Scalabilité limitée** : Impossible d'exécuter des tâches en parallèle

## Décision

Implémenter une architecture multi-agents avec 8 agents spécialisés orchestrés par un agent central.

### Agents implémentés

| Agent | Responsabilité |
|-------|---------------|
| **Orchestrator** | Analyse les requêtes, planifie, délègue aux autres agents |
| **Explore** | Exploration du codebase, recherche de fichiers, analyse de structure |
| **Coder** | Création et modification de code source |
| **Builder** | Gestion des dépendances, build, configuration |
| **Tester** | Écriture et exécution de tests |
| **Deployer** | Déploiement, configuration serveur, preview |
| **Reviewer** | Revue de code, suggestions d'amélioration |
| **Fixer** | Correction de bugs, résolution d'erreurs |

### Composants de l'architecture

```
┌─────────────────────────────────────────────────────┐
│                    Orchestrator                      │
│              (Planification & Décision)              │
└────────────┬────────────────────────────────────────┘
             │
    ┌────────▼────────┐
    │  Tool Registry  │ ← Outils partagés (shell, files, etc.)
    └────────┬────────┘
             │
┌────────────▼─────────────────────────────────────────┐
│                  Agent Registry                       │
├─────────┬─────────┬─────────┬─────────┬─────────────┤
│ Explore │  Coder  │ Builder │ Tester  │ Deployer... │
└─────────┴─────────┴─────────┴─────────┴─────────────┘
             │
    ┌────────▼────────┐
    │ Action Validator│ ← Validation des actions avant exécution
    └─────────────────┘
```

## Conséquences

### Positives

1. **Spécialisation** : Chaque agent a un prompt optimisé pour sa tâche
2. **Parallélisation** : Plusieurs agents peuvent travailler simultanément
3. **Contrôle granulaire** : L'utilisateur peut approuver/rejeter des actions individuelles
4. **Extensibilité** : Nouveaux agents facilement ajoutables
5. **Traçabilité** : Logs par agent pour le débogage

### Négatives

1. **Complexité accrue** : Plus de code à maintenir
2. **Latence** : Communication entre agents ajoute du délai
3. **Cohérence** : Risque de décisions contradictoires entre agents
4. **Coût** : Plus d'appels API pour les décisions de l'orchestrateur

### Mitigation des risques

- **Cohérence** : L'orchestrateur maintient un contexte partagé
- **Latence** : Exécution parallèle quand possible
- **Complexité** : Tests unitaires exhaustifs pour chaque agent

## Alternatives considérées

### 1. Agent unique avec outils

Un seul agent avec accès à tous les outils.

**Rejeté car** : Prompt trop large, performances dégradées sur tâches complexes.

### 2. Agents sans orchestrateur

Agents communiquant directement entre eux.

**Rejeté car** : Difficile à coordonner, risque de boucles infinies.

### 3. Pipeline fixe

Séquence fixe d'agents (explore → code → test → deploy).

**Rejeté car** : Pas assez flexible pour les cas d'usage variés.

## Références

- [Anthropic Multi-Agent Systems](https://docs.anthropic.com/claude/docs/multi-agent)
- [OpenAI Assistants API](https://platform.openai.com/docs/assistants)
- Code source : `app/lib/agents/`
