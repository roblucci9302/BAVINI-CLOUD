# ADR-005: Intégration du Plugin Frontend-Design Anthropic

## Statut

Accepté et Implémenté

## Date

2026-01-20

## Contexte

BAVINI nécessite un système pour guider la génération d'interfaces créatives et distinctives. Deux approches étaient possibles :

1. **Design Context System** (approche custom) - Génération algorithmique de palettes et styles basée sur le type de projet
2. **Plugin Anthropic frontend-design** - Guidelines philosophiques officielles pour la créativité

### Problèmes avec l'approche custom

- ~2000 lignes de code à maintenir
- Palettes déterministes (mêmes inputs = mêmes outputs)
- Designs prévisibles et "génériques IA"
- Complexité algorithmique non nécessaire

### Avantages du plugin Anthropic

- Guidelines officielles maintenues par Anthropic
- Focus sur la créativité, pas sur les règles
- ~150 lignes d'intégration seulement
- Designs uniques à chaque génération

## Décision

Intégrer le plugin officiel **frontend-design** de Anthropic dans l'architecture de prompts BAVINI.

### Architecture Implémentée

```
┌─────────────────────────────────────────────────────────────────┐
│                    ARCHITECTURE DESIGN GUIDELINES               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  .claude/skills/frontend-design/SKILL.md                        │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────┐                   │
│  │  SkillLoader (app/lib/skills/)          │                   │
│  │  - loadFrontendDesignSkill()            │                   │
│  │  - formatSkillContent()                 │                   │
│  │  - Cache en mémoire avec TTL            │                   │
│  └─────────────────────────────────────────┘                   │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────┐                   │
│  │  DesignGuidelinesStore (nanostores)     │                   │
│  │  - designGuidelinesEnabledStore: atom   │                   │
│  │  - guidelinesLevelStore: atom           │                   │
│  │  - Persistance localStorage             │                   │
│  └─────────────────────────────────────────┘                   │
│       │                                                         │
│       ├──────────────────┬──────────────────┐                  │
│       ▼                  ▼                  ▼                  │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐            │
│  │ coder-   │      │orchestr- │      │ Settings │            │
│  │ prompt   │      │ ator     │      │ UI       │            │
│  │          │      │ prompt   │      │          │            │
│  └──────────┘      └──────────┘      └──────────┘            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Composants Créés

| Fichier | Rôle |
|---------|------|
| `app/lib/skills/skill-loader.ts` | Charge et parse SKILL.md avec cache |
| `app/lib/skills/index.ts` | Barrel exports |
| `app/lib/stores/design-guidelines.ts` | État avec nanostores + persistance |
| `app/lib/agents/prompts/design-guidelines-prompt.ts` | Injection dynamique dans prompts |
| `app/components/settings/SettingsModal.tsx` | UI toggle + sélecteur niveau |

### Composants Modifiés

| Fichier | Modification |
|---------|-------------|
| `app/lib/agents/prompts/coder-prompt.ts` | `getCoderSystemPrompt()` avec injection |
| `app/lib/agents/prompts/orchestrator-prompt.ts` | `getOrchestratorSystemPrompt()` avec instructions |
| `app/lib/agents/agents/coder-agent.ts` | Support config dans constructeur |
| `app/lib/agents/agents/orchestrator.ts` | Support config dans constructeur |

### Niveaux de Guidelines

| Niveau | Description | Tokens estimés |
|--------|-------------|----------------|
| `minimal` | Désactivé | 0 |
| `standard` | Guidelines essentielles | ~500 |
| `full` | Guidelines complètes | ~1200 |

## Conséquences

### Positives

1. **Créativité accrue** - Designs uniques et mémorables
2. **Maintenance réduite** - Guidelines maintenues par Anthropic
3. **Flexibilité** - Toggle ON/OFF par utilisateur
4. **Performance** - Cache avec TTL, lazy loading
5. **Testabilité** - 54 tests unitaires couvrent l'intégration
6. **Compatibilité** - Fonctionne avec single-agent et multi-agent

### Négatives

1. **Tokens supplémentaires** - ~500-1200 tokens par requête UI (mitigé par niveau "standard")
2. **Dépendance externe** - SKILL.md doit être présent (mitigé par fallback hardcodé)

### Impact sur les coûts

Avec le niveau "standard" par défaut :
- +500 tokens input par requête UI
- Coût estimé : ~$0.0015 par requête
- Impact négligeable sur le coût total

## Alternatives Considérées

### 1. Design Context System (Custom)

Génération algorithmique de palettes basée sur le type de projet.

**Avantages** :
- Contrôle total sur la logique
- Déterministe (reproductible)

**Inconvénients** :
- Code complexe (~2000 lignes)
- Designs prévisibles
- Maintenance lourde

**Décision** : Abandonné car les designs étaient trop "génériques IA".

### 2. Pas de guidelines (Claude natif)

Laisser Claude générer librement sans guidance.

**Avantages** :
- Zéro surcoût tokens
- Zéro maintenance

**Inconvénients** :
- Résultats inconsistants
- Tendance aux "defaults" (Inter, blue-500, etc.)

**Décision** : Insuffisant pour la qualité attendue.

### 3. Guidelines hardcodées dans les prompts

Intégrer les guidelines directement sans chargement dynamique.

**Avantages** :
- Simple à implémenter
- Pas de I/O fichier

**Inconvénients** :
- Duplication si SKILL.md existe déjà
- Pas de mise à jour automatique
- Pas de personnalisation utilisateur

**Décision** : Trop rigide.

## Tests

L'intégration est couverte par :

| Suite | Fichier | Tests |
|-------|---------|-------|
| Skill Loader | `skill-loader.spec.ts` | 24 tests |
| Design Store | `design-guidelines.spec.ts` | 12 tests |
| Prompt Injection | `design-guidelines-prompt.spec.ts` | 14 tests |
| Integration | `agent-prompts-integration.spec.ts` | 11 tests |
| UI Settings | `DesignGuidelinesSettings.spec.tsx` | 5 tests |
| E2E | `design-guidelines.spec.ts` | 12 tests |

**Total** : 78 tests couvrant l'intégration complète.

## Références

- Plugin Anthropic : `.claude/skills/frontend-design/SKILL.md`
- Documentation : `docs/FRONTEND-DESIGN-PLUGIN-INTEGRATION-PLAN.md`
- Code source : `app/lib/skills/`, `app/lib/stores/design-guidelines.ts`
