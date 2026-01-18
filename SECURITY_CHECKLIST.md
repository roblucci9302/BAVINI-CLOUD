# Security Checklist - BAVINI

## Checklist Obligatoire Avant Commit

Vérifier **CHAQUE** point avant de valider du code :

### 1. NO SECRETS
- [ ] Aucun secret hardcodé (API keys, passwords, tokens)
- [ ] Utilisation de `process.env` pour tous les credentials
- [ ] Fichier `.env` présent dans `.gitignore`

### 2. INPUT VALIDATION
- [ ] Tous les inputs utilisateur sont validés
- [ ] Utilisation de schémas de validation (Zod, Yup, etc.)
- [ ] Types stricts pour les données entrantes

### 3. SQL INJECTION
- [ ] Requêtes paramétrées uniquement
- [ ] Jamais de concaténation de strings dans les queries
- [ ] ORM/Query builder utilisé correctement

### 4. XSS PREVENTION
- [ ] HTML échappé avant affichage
- [ ] Utilisation de `dangerouslySetInnerHTML` avec sanitization
- [ ] CSP headers configurés

### 5. CSRF PROTECTION
- [ ] Tokens CSRF sur les mutations (POST, PUT, DELETE)
- [ ] SameSite cookie policy configurée
- [ ] Origin/Referer validés

### 6. AUTH/AUTHZ
- [ ] Authentification vérifiée sur les routes protégées
- [ ] Autorisations vérifiées (rôles, permissions)
- [ ] Sessions sécurisées (httpOnly, secure cookies)

### 7. RATE LIMITING
- [ ] Limites sur les endpoints d'authentification
- [ ] Limites sur les API publiques
- [ ] Protection contre le brute force

### 8. ERROR HANDLING
- [ ] Messages d'erreur génériques pour l'utilisateur
- [ ] Pas de stack traces en production
- [ ] Logs détaillés côté serveur uniquement

---

## Gestion des Secrets

```typescript
// CORRECT
const apiKey = process.env.API_KEY;
if (!apiKey) {
  throw new Error('API_KEY is required');
}

// INCORRECT - JAMAIS faire cela
const apiKey = 'sk-1234567890abcdef'; // SECRET EXPOSE!
```

---

## Protocole Incident Sécurité

Si une vulnérabilité est détectée :

1. **STOP** - Arrêter immédiatement le travail en cours
2. **ESCALADE** - Signaler le problème à l'équipe
3. **REMEDIATION** - Corriger les vulnérabilités critiques AVANT de continuer
4. **ROTATION** - Si credentials exposés → rotation immédiate
5. **SCAN** - Vérifier le reste du codebase pour vulnérabilités similaires

---

## Niveaux de Sévérité

| Niveau | Description | Action |
|--------|-------------|--------|
| **CRITICAL** | Faille exploitable immédiatement | STOP TOUT - Correction immédiate |
| **HIGH** | Vulnérabilité sérieuse | Corriger avant merge |
| **MEDIUM** | Risque modéré | Corriger dans le sprint |
| **LOW** | Amélioration | Ajouter au backlog |

---

## Fichiers Sensibles - JAMAIS Commiter

- `.env`, `.env.local`, `.env.production`
- `credentials.json`, `secrets.json`
- `*.pem`, `*.key`, `id_rsa`
- Fichiers contenant des tokens/clés API

---

## Outils Recommandés

- **npm audit** - Vérification des dépendances
- **eslint-plugin-security** - Détection statique de vulnérabilités
- **OWASP ZAP** - Tests de pénétration
- **Snyk** - Monitoring continu des vulnérabilités

---

## Références

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE - Common Weakness Enumeration](https://cwe.mitre.org/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
