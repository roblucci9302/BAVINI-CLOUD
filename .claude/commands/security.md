# /security Command

> Effectuer un audit de sécurité complet

## Usage

```
/security [scope optionnel]
```

## Exemples

```
/security                          # Audit complet du projet
/security app/routes/              # Audit des routes API
/security app/lib/persistence/     # Audit de la persistence
```

## Ce que fait cette commande

1. **Scan** le code pour les vulnérabilités:
   - Secrets hardcodés
   - SQL injection
   - XSS
   - Path traversal
   - CSRF
   - Missing validation
   - Insecure dependencies

2. **Catégorise** par sévérité:
   - CRITICAL
   - HIGH
   - MEDIUM
   - LOW

3. **Produit** un rapport avec:
   - Localisation exacte (fichier:ligne)
   - Description du problème
   - Remediation suggérée
   - Références (OWASP, etc.)

## Agent utilisé

**security-reviewer** (Model: opus)

## Patterns recherchés

```typescript
// Secrets
grep -r "sk-ant-" "api_key.*=" "password.*="

// SQL Injection
/`SELECT.*\$\{/
/`INSERT.*\$\{/

// XSS
/innerHTML\s*=/
/dangerouslySetInnerHTML/

// Path Traversal
/\.\.\/|\.\.\\/ dans les paths
```

## Quand utiliser

- Avant mise en production
- Après ajout de routes API
- Après modifications auth/authz
- Audits périodiques
- Après incident sécurité
