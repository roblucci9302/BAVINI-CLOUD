# BAVINI - Guide Beta Testeur

> **Version Beta** - Janvier 2026
> Merci de participer au test de BAVINI !

---

## Qu'est-ce que BAVINI ?

BAVINI est un **environnement de développement web propulsé par l'IA**. Décrivez ce que vous voulez créer, et BAVINI génère le code et vous montre un aperçu en temps réel.

**Comparable à :** Bolt.new, Lovable, Replit AI

---

## Comment accéder

**URL :** `[URL fournie par l'équipe]`

Aucune inscription requise pour le beta test.

---

## Scénarios à tester

### Test 1 : Composant simple (2 min)
```
Crée un bouton React bleu avec un effet hover qui devient violet
```
**Vérifier :**
- [ ] Le code se génère
- [ ] Le preview s'affiche
- [ ] Le bouton fonctionne dans le preview

### Test 2 : Landing page (5 min)
```
Crée une landing page moderne pour une app de productivité avec :
- Hero section avec titre accrocheur
- 3 features avec icônes
- Section pricing avec 3 plans
- Footer avec liens
```
**Vérifier :**
- [ ] Toutes les sections sont générées
- [ ] Le design est cohérent
- [ ] Le responsive fonctionne (tester mobile dans le preview)

### Test 3 : Formulaire interactif (5 min)
```
Crée un formulaire de contact avec validation :
- Champs : nom, email, message
- Validation en temps réel
- Message de succès après soumission
```
**Vérifier :**
- [ ] La validation fonctionne
- [ ] Les erreurs s'affichent correctement
- [ ] Le formulaire est accessible (navigation clavier)

### Test 4 : Itération (3 min)
Après avoir généré quelque chose, demandez une modification :
```
Change la couleur principale en vert et ajoute une animation au bouton
```
**Vérifier :**
- [ ] BAVINI comprend le contexte précédent
- [ ] Les modifications sont appliquées correctement

### Test 5 : Cas complexe (optionnel, 10 min)
```
Crée un dashboard admin avec :
- Sidebar de navigation
- Header avec avatar utilisateur
- Cartes de statistiques
- Graphique simple (barres ou lignes)
- Table de données avec pagination
```

---

## Comment remonter un bug

### Option 1 : Formulaire rapide
Envoyez un message avec :
1. **Ce que vous avez fait** (le prompt envoyé)
2. **Ce qui s'est passé** (erreur, comportement inattendu)
3. **Ce que vous attendiez**
4. **Screenshot** si possible

### Option 2 : Template de bug report
```
## Bug Report

**Prompt envoyé :**
[Copiez votre prompt ici]

**Comportement observé :**
[Décrivez ce qui s'est passé]

**Comportement attendu :**
[Décrivez ce que vous attendiez]

**Navigateur :** Chrome/Firefox/Safari + version
**Device :** Desktop/Mobile

**Screenshot :**
[Joindre si possible]
```

### Où envoyer ?
- Email : `[email du développeur]`
- Ou : `[lien vers formulaire/Discord/autre]`

---

## Limites connues (ne pas reporter comme bugs)

| Limitation | Détail |
|------------|--------|
| **Backend Node.js** | Le mode "Browser Build" ne supporte pas les serveurs Node.js (Express, etc.). Utilisez des APIs externes. |
| **Packages natifs** | Les packages npm avec du code C++ ne fonctionnent pas (sharp, bcrypt, etc.) |
| **Fichiers volumineux** | Limite de 5MB par fichier |
| **Base de données** | Pas de PostgreSQL/MySQL local. Utilisez Supabase ou des APIs. |
| **Temps de génération** | Les projets complexes peuvent prendre 30-60 secondes |

---

## Évaluation finale

Après vos tests, merci de noter BAVINI :

### Score global (1-10)
`___` / 10

### Questions rapides

1. **Qualité du code généré ?**
   - [ ] Excellent - Production-ready
   - [ ] Bon - Quelques ajustements nécessaires
   - [ ] Moyen - Beaucoup de corrections à faire
   - [ ] Mauvais - Inutilisable

2. **Facilité d'utilisation ?**
   - [ ] Très facile
   - [ ] Facile
   - [ ] Moyen
   - [ ] Difficile

3. **Utiliseriez-vous BAVINI pour un vrai projet ?**
   - [ ] Oui, absolument
   - [ ] Oui, pour des prototypes
   - [ ] Peut-être
   - [ ] Non

4. **Qu'est-ce qui manque le plus ?**
   ```
   [Votre réponse]
   ```

5. **Recommanderiez-vous BAVINI à un collègue ?**
   - [ ] Oui
   - [ ] Non
   - Pourquoi ? `_______________`

---

## Merci !

Votre feedback est précieux pour améliorer BAVINI.

**Contact :** `[email/contact du développeur]`

---

*BAVINI Beta v0.1 - Janvier 2026*
