# Licences des Composants Tiers

Ce document liste les composants tiers utilisés dans BAVINI et leurs licences respectives.

---

## Bolt.new

BAVINI est dérivé de Bolt.new, un projet open source développé par StackBlitz.

**Copyright:** Copyright (c) 2024 StackBlitz, Inc.
**Licence:** MIT License
**Source:** https://github.com/stackblitz/bolt.new

### Texte complet de la licence MIT

```
MIT License

Copyright (c) 2024 StackBlitz, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Dépendances NPM

Les dépendances npm utilisées dans ce projet sont sous leurs licences respectives.

### Résumé des Licences

| Type de Licence | Nombre de Packages |
|-----------------|-------------------|
| MIT | 88 |
| Apache-2.0 | 6 |
| BSD-2-Clause | 3 |
| BSD-3-Clause | 1 |
| Unlicense | 1 |
| Artistic-2.0 | 1 |

### Principales Dépendances

| Package | Licence | Description |
|---------|---------|-------------|
| @remix-run/cloudflare | MIT | Framework Remix pour Cloudflare |
| @remix-run/react | MIT | Composants React pour Remix |
| react | MIT | Bibliothèque UI React |
| framer-motion | MIT | Bibliothèque d'animations |
| @codemirror/* | MIT | Éditeur de code |
| shiki | MIT | Coloration syntaxique |
| nanostores | MIT | Gestion d'état |
| ai | MIT | SDK Vercel AI |
| @ai-sdk/anthropic | MIT | Intégration Claude |
| xterm | MIT | Terminal web |
| unocss | MIT | Framework CSS utilitaire |

### Vérification des Licences

Pour obtenir la liste complète et à jour des dépendances et leurs licences, exécutez :

```bash
npx license-checker --summary
```

Pour vérifier la conformité avec les licences permissives uniquement :

```bash
npx license-checker --onlyAllow "MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;Unlicense;CC0-1.0;0BSD;Artistic-2.0"
```

---

## Note sur la Conformité

Toutes les dépendances tierces utilisées dans BAVINI sont sous licences permissives (MIT, Apache-2.0, BSD) qui permettent :
- L'utilisation commerciale
- La modification
- La distribution
- L'utilisation privée

Aucune dépendance sous licence copyleft (GPL, LGPL, AGPL) n'est utilisée dans ce projet.

---

*Document mis à jour le 20 décembre 2025*
