# Plan de Correction - Chargement des Templates

## Problème Identifié

Le système de templates possède des fichiers pré-construits (49 fichiers pour `supabase-fullstack`) qui ne sont **jamais chargés** quand l'utilisateur sélectionne un template. Seul le prompt textuel est envoyé au LLM.

---

## Architecture Cible

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FLUX ACTUEL (CASSÉ)                          │
├─────────────────────────────────────────────────────────────────────┤
│  User Click → TemplatePills → prompt seul → LLM → génère from scratch │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        FLUX CORRIGÉ                                  │
├─────────────────────────────────────────────────────────────────────┤
│  User Click → TemplatePills                                          │
│       │                                                              │
│       ├── Si templateDir existe:                                     │
│       │       │                                                      │
│       │       ├── 1. Appel API /api/templates/:id                   │
│       │       ├── 2. Charger fichiers depuis le serveur             │
│       │       ├── 3. Injecter dans WebContainer/Workbench           │
│       │       └── 4. Envoyer prompt de bienvenue (optionnel)        │
│       │                                                              │
│       └── Sinon:                                                     │
│               └── Comportement actuel (prompt → LLM)                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Roadmap de Développement

### Phase 1: API de Chargement des Templates
**Durée estimée: Sprint 1**

#### 1.1 Créer l'endpoint API `/api/templates/$id`
- **Fichier:** `app/routes/api.templates.$id.ts`
- **Fonction:**
  - Recevoir l'ID du template (ex: `supabase-fullstack`)
  - Lire récursivement tous les fichiers du dossier template
  - Retourner un JSON avec la structure des fichiers

```typescript
// Structure de réponse
interface TemplateFilesResponse {
  templateId: string;
  files: Array<{
    path: string;      // "src/App.tsx"
    content: string;   // contenu du fichier
    type: 'file' | 'directory';
  }>;
  metadata: {
    name: string;
    description: string;
    totalFiles: number;
  };
}
```

#### 1.2 Créer le service de lecture des templates
- **Fichier:** `app/lib/.server/templates/template-loader.ts`
- **Fonctions:**
  - `loadTemplateFiles(templateDir: string): Promise<TemplateFile[]>`
  - `getTemplateMetadata(templateId: string): TemplateMetadata`
  - Gestion des erreurs (template non trouvé, fichier corrompu)

---

### Phase 2: Intégration Workbench
**Durée estimée: Sprint 1-2**

#### 2.1 Modifier le WorkbenchStore
- **Fichier:** `app/lib/stores/workbench.ts`
- **Nouvelles méthodes:**
  - `loadTemplateFiles(files: TemplateFile[]): void`
  - `clearAndLoadTemplate(files: TemplateFile[]): void`
  - Synchronisation avec WebContainer

#### 2.2 Créer un hook `useTemplateLoader`
- **Fichier:** `app/lib/hooks/useTemplateLoader.ts`
- **Fonctions:**
  - `loadTemplate(templateId: string): Promise<void>`
  - État de chargement (loading, error, success)
  - Gestion du cache

---

### Phase 3: Modification du Flux UI
**Durée estimée: Sprint 2**

#### 3.1 Modifier TemplatePills.tsx
```typescript
// Avant
const handleTemplateClick = (template: ProjectTemplate) => {
  onSelectTemplate(template.prompt);
};

// Après
const handleTemplateClick = async (template: ProjectTemplate) => {
  if (hasTemplateFiles(template)) {
    // Charger les fichiers pré-construits
    await onLoadTemplate(template.id, template.templateDir);
    // Optionnel: envoyer un message de bienvenue
    onSelectTemplate(`Template ${template.name} chargé! Comment puis-je vous aider?`);
  } else {
    // Comportement actuel
    onSelectTemplate(template.prompt);
  }
};
```

#### 3.2 Modifier BaseChat.tsx
- Ajouter la prop `onLoadTemplate`
- Appeler le hook `useTemplateLoader`
- Gérer l'état de chargement (spinner pendant le load)

#### 3.3 Ajouter un indicateur visuel
- Spinner pendant le chargement
- Message de confirmation "Template chargé"
- Animation de transition vers le workbench

---

### Phase 4: Synchronisation WebContainer
**Durée estimée: Sprint 2-3**

#### 4.1 Écriture des fichiers dans WebContainer
- **Fichier:** `app/lib/webcontainer/template-sync.ts`
- **Fonctions:**
  - `writeTemplateToContainer(files: TemplateFile[]): Promise<void>`
  - `installDependencies(): Promise<void>`
  - Exécuter `npm install` automatiquement après chargement

#### 4.2 Gestion du package.json
- Détecter automatiquement le `package.json`
- Lancer l'installation des dépendances
- Afficher la progression dans le terminal

---

### Phase 5: Tests & Validation
**Durée estimée: Sprint 3**

#### 5.1 Tests Unitaires
- `template-loader.spec.ts` - Lecture des fichiers
- `useTemplateLoader.spec.ts` - Hook de chargement
- `workbench.spec.ts` - Intégration workbench

#### 5.2 Tests d'Intégration
- Test E2E: Click template → Fichiers chargés → Workbench affiché
- Test de performance: Chargement de 49 fichiers < 2 secondes

#### 5.3 Tests Manuels
- [ ] Tester tous les templates avec `templateDir`
- [ ] Tester les templates sans `templateDir` (comportement inchangé)
- [ ] Tester sur différentes tailles d'écran
- [ ] Tester avec connexion lente

---

## Fichiers à Créer/Modifier

### Nouveaux Fichiers
| Fichier | Description |
|---------|-------------|
| `app/routes/api.templates.$id.ts` | Endpoint API pour charger les templates |
| `app/lib/.server/templates/template-loader.ts` | Service de lecture des fichiers |
| `app/lib/.server/templates/types.ts` | Types TypeScript |
| `app/lib/hooks/useTemplateLoader.ts` | Hook React pour le chargement |
| `app/lib/webcontainer/template-sync.ts` | Sync avec WebContainer |

### Fichiers à Modifier
| Fichier | Modification |
|---------|--------------|
| `app/components/chat/TemplatePills.tsx` | Ajouter logique de chargement |
| `app/components/chat/BaseChat.tsx` | Intégrer le hook et gérer le loading |
| `app/lib/stores/workbench.ts` | Ajouter méthode loadTemplateFiles |
| `app/lib/templates/index.ts` | Exporter les types nécessaires |

---

## Dépendances Techniques

### Côté Serveur
- `fs/promises` - Lecture asynchrone des fichiers
- `path` - Manipulation des chemins
- `glob` ou `fast-glob` - Pattern matching pour les fichiers

### Côté Client
- Fetch API - Appel à `/api/templates/:id`
- WebContainer API - Écriture des fichiers
- nanostores - Gestion de l'état

---

## Risques & Mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Fichiers template trop volumineux | Performance | Compression gzip, streaming |
| Fichiers binaires (images) | Encodage | Base64 ou URLs séparées |
| Erreur de lecture serveur | Crash | Try/catch + fallback au prompt |
| WebContainer non disponible | Blocage | Vérification préalable |

---

## Critères de Succès

1. **Fonctionnel:**
   - [ ] Click sur "Supabase Full-Stack" → 49 fichiers chargés dans le workbench
   - [ ] Le projet est fonctionnel (npm install + npm run dev)
   - [ ] Templates sans `templateDir` fonctionnent comme avant

2. **Performance:**
   - [ ] Chargement < 3 secondes pour 50 fichiers
   - [ ] Pas de freeze de l'UI pendant le chargement

3. **UX:**
   - [ ] Indicateur de chargement visible
   - [ ] Message de confirmation après chargement
   - [ ] Workbench s'ouvre automatiquement

---

## Ordre d'Implémentation Recommandé

```
1. [API] Créer api.templates.$id.ts
      ↓
2. [Service] Créer template-loader.ts
      ↓
3. [Hook] Créer useTemplateLoader.ts
      ↓
4. [UI] Modifier TemplatePills.tsx + BaseChat.tsx
      ↓
5. [Store] Modifier workbench.ts
      ↓
6. [WebContainer] Créer template-sync.ts
      ↓
7. [Tests] Écrire les tests
      ↓
8. [QA] Validation manuelle
```

---

## Estimation Totale

| Phase | Complexité | Priorité |
|-------|------------|----------|
| Phase 1: API | Moyenne | P0 - Critique |
| Phase 2: Workbench | Haute | P0 - Critique |
| Phase 3: UI | Basse | P1 - Important |
| Phase 4: WebContainer | Haute | P0 - Critique |
| Phase 5: Tests | Moyenne | P1 - Important |

---

## Notes Additionnelles

### Option A: Chargement Synchrone (Simple)
- Charger tous les fichiers d'un coup
- Plus simple à implémenter
- Risque de timeout pour gros templates

### Option B: Chargement Streaming (Avancé)
- Charger les fichiers par batch
- Afficher la progression en temps réel
- Plus complexe mais meilleure UX

**Recommandation:** Commencer par Option A, optimiser vers Option B si nécessaire.
