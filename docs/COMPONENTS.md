# Documentation des Composants BAVINI

Guide de référence pour les composants React du projet BAVINI.

## Table des Matières

- [Composants Chat](#composants-chat)
- [Composants Agent](#composants-agent)
- [Composants Workbench](#composants-workbench)
- [Composants UI](#composants-ui)

---

## Composants Chat

### AssistantMessage

Affiche un message de l'assistant avec support Markdown et actions.

```tsx
import { AssistantMessage } from '~/components/chat/AssistantMessage';

<AssistantMessage
  content="Voici le code généré..."
  annotations={[{ type: 'artifact', id: 'file-1' }]}
/>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `content` | `string` | Contenu Markdown du message |
| `annotations` | `Annotation[]` | Annotations (artifacts, citations) |

**Fichier:** `app/components/chat/AssistantMessage.tsx`

---

### BaseChat

Composant principal du chat, gère l'input, les messages et le streaming.

```tsx
import { BaseChat } from '~/components/chat/BaseChat';

<BaseChat
  messages={messages}
  isStreaming={isStreaming}
  onSubmit={handleSubmit}
/>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `messages` | `Message[]` | Liste des messages |
| `isStreaming` | `boolean` | Indicateur de streaming en cours |
| `onSubmit` | `(content: string) => void` | Handler d'envoi |
| `onStop` | `() => void` | Handler d'arrêt |
| `enhancingPrompt` | `boolean` | Mode amélioration de prompt |

**Fichier:** `app/components/chat/BaseChat.tsx`

---

### CodeBlock

Bloc de code avec coloration syntaxique et bouton de copie.

```tsx
import { CodeBlock } from '~/components/chat/CodeBlock';

<CodeBlock
  code="const x = 1;"
  language="typescript"
/>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `code` | `string` | Code à afficher |
| `language` | `string` | Langage pour la coloration |

**Fichier:** `app/components/chat/CodeBlock.tsx`

---

### Markdown

Rendu Markdown avec support GFM, code blocks, et liens.

```tsx
import { Markdown } from '~/components/chat/Markdown';

<Markdown content="# Titre\n\nParagraphe avec **gras**." />
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `content` | `string` | Contenu Markdown brut |
| `html` | `boolean` | Autoriser le HTML (défaut: false) |

**Fichier:** `app/components/chat/Markdown.tsx`

---

### SendButton

Bouton d'envoi avec états loading et désactivé.

```tsx
import SendButton from '~/components/chat/SendButton.client';

<SendButton
  show={true}
  isStreaming={false}
  onClick={handleSend}
/>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `show` | `boolean` | Afficher le bouton |
| `isStreaming` | `boolean` | En cours de streaming |
| `onClick` | `() => void` | Handler de clic |

**Fichier:** `app/components/chat/SendButton.client.tsx`

---

### Artifact

Affiche un artifact (fichier généré) avec preview et actions.

```tsx
import { Artifact } from '~/components/chat/Artifact';

<Artifact
  artifact={{
    id: 'file-1',
    title: 'Button.tsx',
    type: 'file',
  }}
/>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `artifact` | `ArtifactData` | Données de l'artifact |
| `onOpen` | `() => void` | Handler d'ouverture dans l'éditeur |

**Fichier:** `app/components/chat/Artifact.tsx`

---

## Composants Agent

### AgentStatusBadge

Badge affichant le statut d'un agent avec indicateur animé.

```tsx
import { AgentStatusBadge } from '~/components/agent/AgentStatusBadge';

<AgentStatusBadge
  status="executing"
  agentType="coder"
  activeAgents={['coder', 'builder']}
/>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `status` | `AgentStatus` | Statut ('idle', 'executing', 'thinking', etc.) |
| `agentType` | `AgentType` | Type d'agent actif |
| `activeAgents` | `AgentType[]` | Liste des agents actifs |
| `onStop` | `() => void` | Handler d'arrêt (optionnel) |

**Fichier:** `app/components/agent/AgentStatusBadge.tsx`

---

### AgentActivityLog

Affiche les logs d'activité des agents en temps réel.

```tsx
import { AgentActivityLog } from '~/components/agent/AgentActivityLog';

<AgentActivityLog
  logs={agentLogs}
  onFilterChange={handleFilter}
/>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `logs` | `LogEntry[]` | Logs à afficher |
| `filter` | `string` | Filtre par agent/niveau |
| `onFilterChange` | `(filter: string) => void` | Handler de filtre |

**Fichier:** `app/components/agent/AgentActivityLog.tsx`

---

### ActionApprovalModal

Modal pour approuver/rejeter les actions proposées par les agents.

```tsx
import { ActionApprovalModal } from '~/components/agent/ActionApprovalModal';

<ActionApprovalModal
  isOpen={showModal}
  batch={pendingBatch}
  onApproveAll={handleApproveAll}
  onRejectAll={handleRejectAll}
  onApproveSelected={handleApproveSelected}
/>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `isOpen` | `boolean` | Modal ouvert |
| `batch` | `PendingActionBatch` | Batch d'actions en attente |
| `onApproveAll` | `() => void` | Approuver toutes les actions |
| `onRejectAll` | `() => void` | Rejeter toutes les actions |
| `onApproveSelected` | `(ids: string[]) => void` | Approuver sélection |

**Fichier:** `app/components/agent/ActionApprovalModal.tsx`

---

### AgentChatIntegration

Intégration complète du système d'agents dans le chat.

```tsx
import { AgentChatIntegration } from '~/components/agent/AgentChatIntegration';

<AgentChatIntegration
  chatId={currentChatId}
  onAgentResponse={handleResponse}
/>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `chatId` | `string` | ID du chat actuel |
| `onAgentResponse` | `(response: AgentResponse) => void` | Handler de réponse |

**Fichier:** `app/components/agent/AgentChatIntegration.tsx`

---

## Composants Workbench

### Preview

Iframe de prévisualisation avec barre d'adresse et contrôles.

```tsx
import { Preview } from '~/components/workbench/Preview';

<Preview
  url="http://localhost:3000"
  isLoading={false}
  onRefresh={handleRefresh}
/>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `url` | `string` | URL à afficher |
| `isLoading` | `boolean` | Chargement en cours |
| `onRefresh` | `() => void` | Handler de rafraîchissement |
| `onUrlChange` | `(url: string) => void` | Handler de changement d'URL |

**Fichier:** `app/components/workbench/Preview.tsx`

---

### DeviceSelector

Sélecteur de device pour la prévisualisation responsive.

```tsx
import { DeviceSelector } from '~/components/workbench/DeviceSelector';

<DeviceSelector
  selectedDevice={device}
  onDeviceChange={setDevice}
  isRotated={false}
  onRotate={handleRotate}
/>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `selectedDevice` | `DeviceType` | Device sélectionné |
| `onDeviceChange` | `(device: DeviceType) => void` | Handler de changement |
| `isRotated` | `boolean` | Orientation paysage |
| `onRotate` | `() => void` | Handler de rotation |

**Devices disponibles:**
- `none` - Pleine largeur
- `phone-portrait` - 375x667
- `phone-landscape` - 667x375
- `tablet-portrait` - 768x1024
- `tablet-landscape` - 1024x768

**Fichier:** `app/components/workbench/DeviceSelector.tsx`

---

### DeviceFrame

Conteneur avec bordures et dimensions de device.

```tsx
import { DeviceFrame } from '~/components/workbench/DeviceFrame';

<DeviceFrame device="phone-portrait" isRotated={false}>
  <iframe src="..." />
</DeviceFrame>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `device` | `DeviceType` | Type de device |
| `isRotated` | `boolean` | Rotation appliquée |
| `children` | `ReactNode` | Contenu à encadrer |

**Fichier:** `app/components/workbench/DeviceFrame.tsx`

---

### PortDropdown

Dropdown pour sélectionner le port de prévisualisation.

```tsx
import { PortDropdown } from '~/components/workbench/PortDropdown';

<PortDropdown
  activePort={3000}
  ports={[3000, 3001, 8080]}
  onPortChange={setActivePort}
/>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `activePort` | `number` | Port actuellement actif |
| `ports` | `number[]` | Liste des ports disponibles |
| `onPortChange` | `(port: number) => void` | Handler de changement |

**Fichier:** `app/components/workbench/PortDropdown.tsx`

---

## Composants UI

### Dialog

Composant de dialogue modal avec overlay et animations.

```tsx
import { Dialog, DialogTitle, DialogDescription, DialogButton } from '~/components/ui/Dialog';

<Dialog onClose={handleClose} onBackdrop={handleClose}>
  <DialogTitle>Confirmer</DialogTitle>
  <DialogDescription>Êtes-vous sûr?</DialogDescription>
  <DialogButton type="primary" onClick={handleConfirm}>
    Confirmer
  </DialogButton>
  <DialogButton type="secondary" onClick={handleClose}>
    Annuler
  </DialogButton>
</Dialog>
```

**Props Dialog:**
| Prop | Type | Description |
|------|------|-------------|
| `children` | `ReactNode` | Contenu du dialogue |
| `className` | `string` | Classes CSS additionnelles |
| `onClose` | `() => void` | Handler de fermeture |
| `onBackdrop` | `() => void` | Handler de clic sur l'overlay |

**Props DialogButton:**
| Prop | Type | Description |
|------|------|-------------|
| `type` | `'primary' \| 'secondary' \| 'danger'` | Style du bouton |
| `onClick` | `() => void` | Handler de clic |
| `children` | `ReactNode` | Contenu du bouton |

**Fichier:** `app/components/ui/Dialog.tsx`

---

### IconButton

Bouton avec icône UnoCSS et états hover/disabled.

```tsx
import { IconButton } from '~/components/ui/IconButton';

<IconButton
  icon="i-ph:gear-six-duotone"
  title="Paramètres"
  onClick={handleClick}
  size="md"
/>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `icon` | `string` | Classe d'icône UnoCSS |
| `title` | `string` | Tooltip/accessibilité |
| `onClick` | `() => void` | Handler de clic |
| `size` | `'sm' \| 'md' \| 'lg' \| 'xl'` | Taille (défaut: 'md') |
| `disabled` | `boolean` | Désactivé |
| `className` | `string` | Classes additionnelles |

**Fichier:** `app/components/ui/IconButton.tsx`

---

### ErrorBoundary

Capture les erreurs React et affiche un fallback.

```tsx
import { ErrorBoundary, MinimalErrorFallback } from '~/components/ui/ErrorBoundary';

<ErrorBoundary
  fallback={<MinimalErrorFallback />}
  onError={(error, info) => console.error(error)}
>
  <MonComposant />
</ErrorBoundary>
```

**Props ErrorBoundary:**
| Prop | Type | Description |
|------|------|-------------|
| `children` | `ReactNode` | Composants à protéger |
| `fallback` | `ReactNode` | UI de fallback (optionnel) |
| `onError` | `(error, info) => void` | Callback d'erreur |

**Props MinimalErrorFallback:**
| Prop | Type | Description |
|------|------|-------------|
| `onRetry` | `() => void` | Handler de retry (optionnel) |

**Fichier:** `app/components/ui/ErrorBoundary.tsx`

---

### Slider

Sélecteur binaire animé (toggle entre deux options).

```tsx
import { Slider, type SliderOptions } from '~/components/ui/Slider';

const options: SliderOptions<'left' | 'right'> = {
  left: { value: 'left', text: 'Option A' },
  right: { value: 'right', text: 'Option B' },
};

<Slider
  selected="left"
  options={options}
  setSelected={setSelected}
/>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `selected` | `T` | Valeur sélectionnée |
| `options` | `SliderOptions<T>` | Configuration des options |
| `setSelected` | `(value: T) => void` | Handler de sélection |

**Fichier:** `app/components/ui/Slider.tsx`

---

### ThemeSwitch

Bouton de bascule thème clair/sombre.

```tsx
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';

<ThemeSwitch className="ml-2" />
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `className` | `string` | Classes CSS additionnelles |

**Comportement:** Lit et modifie `themeStore`. Affiche lune (light) ou soleil (dark).

**Fichier:** `app/components/ui/ThemeSwitch.tsx`

---

## Bonnes Pratiques

### Mémoisation

Tous les composants exportés utilisent `React.memo()` pour optimiser les re-renders :

```tsx
export const MonComposant = memo(({ prop }: Props) => {
  return <div>{prop}</div>;
});
```

### Stores Nanostores

Les composants se connectent aux stores via `useStore` :

```tsx
import { useStore } from '@nanostores/react';
import { chatStore } from '~/lib/stores/chat';

function MonComposant() {
  const chatState = useStore(chatStore);
  return <div>{chatState.mode}</div>;
}
```

### Icônes UnoCSS

Les icônes utilisent les classes Iconify via UnoCSS :

```tsx
// Phosphor Icons (préfixe i-ph:)
<span className="i-ph:house-duotone" />

// Lucide Icons (préfixe i-lucide:)
<span className="i-lucide:settings" />
```

### Accessibilité

- Tous les boutons interactifs ont un attribut `title` ou `aria-label`
- Les modals gèrent correctement le focus trap
- Les couleurs respectent les contrastes WCAG
