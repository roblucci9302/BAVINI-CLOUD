# ADR-002: WebContainer Runtime

## Statut

Accepté

## Date

2024-10

## Contexte

BAVINI permet aux utilisateurs de développer des applications web dans le navigateur. Pour cela, il faut pouvoir :

1. Exécuter Node.js et npm
2. Servir des applications sur un port local
3. Installer des dépendances npm
4. Exécuter des commandes shell

Les options traditionnelles (serveur distant, Docker) posent des problèmes de latence, coût, et sécurité.

## Décision

Utiliser **WebContainer** de StackBlitz comme runtime d'exécution.

### Qu'est-ce que WebContainer ?

WebContainer est un environnement Node.js complet qui s'exécute entièrement dans le navigateur grâce à WebAssembly. Il fournit :

- Node.js runtime
- npm/pnpm/yarn
- Système de fichiers virtuel
- Serveur HTTP
- Terminal interactif

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Navigateur                           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                      WebContainer                        ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  ││
│  │  │   Node.js   │  │ File System │  │   npm/pnpm      │  ││
│  │  │  (WASM)     │  │  (Virtual)  │  │                 │  ││
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  ││
│  │                                                          ││
│  │  ┌─────────────────────────────────────────────────────┐││
│  │  │              HTTP Server (preview)                  │││
│  │  │              localhost:3000                         │││
│  │  └─────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    BAVINI Frontend                       ││
│  │  ┌─────────┐  ┌─────────────┐  ┌───────────────────┐   ││
│  │  │  Chat   │  │   Editor    │  │     Preview       │   ││
│  │  └─────────┘  └─────────────┘  └───────────────────┘   ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Intégration dans BAVINI

```typescript
// Initialisation
import { WebContainer } from '@webcontainer/api';

const webcontainer = await WebContainer.boot();

// Monter des fichiers
await webcontainer.mount({
  'package.json': {
    file: { contents: '{ "name": "app" }' }
  }
});

// Exécuter des commandes
const process = await webcontainer.spawn('npm', ['install']);
process.output.pipeTo(new WritableStream({
  write(chunk) { console.log(chunk); }
}));

// Serveur de preview
webcontainer.on('server-ready', (port, url) => {
  // Afficher dans l'iframe de preview
});
```

## Conséquences

### Positives

1. **Zero latence réseau** : Tout s'exécute localement
2. **Sécurité** : Sandboxé dans le navigateur, pas d'accès au système hôte
3. **Pas de serveur** : Réduit les coûts d'infrastructure
4. **Expérience fluide** : Installation npm quasi-instantanée (cache local)
5. **Compatibilité** : Support de la majorité des packages npm

### Négatives

1. **Limitations navigateur** : Pas d'accès aux APIs natives (fs, network bind)
2. **Performances** : Plus lent que Node.js natif pour les opérations lourdes
3. **Mémoire** : Consomme beaucoup de RAM du navigateur
4. **Compatibilité packages** : Certains packages avec binaires natifs ne fonctionnent pas

### Packages non supportés

- Packages avec binaires natifs (sharp, bcrypt)
- Packages nécessitant l'accès au réseau bas niveau
- Packages utilisant des workers Node.js natifs

## Alternatives considérées

### 1. Serveur Node.js distant

Exécuter Node.js sur un serveur et streamer les résultats.

**Rejeté car** :
- Latence réseau pour chaque opération
- Coût de serveurs par utilisateur
- Complexité de gestion des sessions

### 2. Docker dans le navigateur

Utiliser un runtime Docker en WASM.

**Rejeté car** :
- Trop lourd (plusieurs centaines de Mo)
- Temps de démarrage trop long
- Complexité accrue

### 3. Firecracker MicroVMs

VMs légères pour chaque utilisateur.

**Rejeté car** :
- Nécessite une infrastructure serveur
- Coût non négligeable
- Latence réseau

## Configuration requise

- Navigateur moderne (Chrome 89+, Firefox 89+, Safari 15+)
- SharedArrayBuffer et Cross-Origin Isolation
- Minimum 4 Go de RAM

## Références

- [WebContainer API Docs](https://webcontainers.io/api)
- [StackBlitz WebContainer](https://blog.stackblitz.com/posts/introducing-webcontainers/)
- Code source : `app/lib/webcontainer/`
