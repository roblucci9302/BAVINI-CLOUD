# Security Rules

> Règles de sécurité NON-NÉGOCIABLES pour BAVINI

## Pré-Commit Checklist

Avant CHAQUE commit, vérifier:

- [ ] **Secrets**: Aucun secret hardcodé (API keys, passwords, tokens)
- [ ] **Validation**: Tous les inputs utilisateur sont validés
- [ ] **SQL**: Queries paramétrées (pas de string concatenation)
- [ ] **XSS**: HTML sanitisé avant injection
- [ ] **CSRF**: Protection activée sur mutations
- [ ] **Auth**: Vérification authentification/autorisation
- [ ] **Rate Limit**: Limites sur endpoints sensibles
- [ ] **Errors**: Messages d'erreur ne révèlent pas d'info sensible

## Gestion des Secrets

### ❌ INTERDIT

```typescript
// JAMAIS faire ça
const apiKey = "sk-ant-api03-xxxxx";
const dbPassword = "super_secret_123";
const token = "ghp_xxxxxxxxxxxx";
```

### ✅ OBLIGATOIRE

```typescript
// Toujours utiliser les variables d'environnement
const apiKey = process.env.ANTHROPIC_API_KEY;

// Valider leur présence
if (!apiKey) {
  throw new Error('ANTHROPIC_API_KEY environment variable is required');
}

// Pour le client-side, utiliser VITE_ prefix
const publicKey = import.meta.env.VITE_PUBLIC_KEY;
```

## Validation des Inputs

### Pattern Zod

```typescript
import { z } from 'zod';

// Définir le schema
const UserInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  age: z.number().int().positive().optional(),
});

// Valider
function handleInput(rawInput: unknown) {
  const result = UserInputSchema.safeParse(rawInput);

  if (!result.success) {
    throw new ValidationError(result.error.message);
  }

  return result.data; // Typé correctement
}
```

## SQL Injection Prevention

### ❌ VULNÉRABLE

```typescript
// JAMAIS construire des queries avec des strings
const query = `SELECT * FROM users WHERE id = '${userId}'`;
const query = "SELECT * FROM users WHERE name = '" + userName + "'";
```

### ✅ SÉCURISÉ

```typescript
// Toujours utiliser des paramètres
const result = await db.query(
  'SELECT * FROM users WHERE id = $1 AND status = $2',
  [userId, status]
);

// Avec PGlite
const result = await pglite.query(
  'SELECT * FROM checkpoints WHERE chat_id = $1',
  [chatId]
);
```

## XSS Prevention

### ❌ DANGEREUX

```typescript
// JAMAIS injecter du HTML non sanitisé
element.innerHTML = userContent;
<div dangerouslySetInnerHTML={{ __html: userContent }} />
```

### ✅ SÉCURISÉ

```typescript
// Utiliser un sanitizer
import DOMPurify from 'dompurify';

element.innerHTML = DOMPurify.sanitize(userContent);

// Ou utiliser textContent pour du texte pur
element.textContent = userContent;

// React échappe par défaut
<div>{userContent}</div> // Safe
```

## Path Traversal

### ❌ VULNÉRABLE

```typescript
const filePath = `/uploads/${req.params.filename}`;
// Un attaquant peut envoyer "../../../etc/passwd"
```

### ✅ SÉCURISÉ

```typescript
import path from 'path';

function safeFilePath(userInput: string, baseDir: string): string {
  // Extraire juste le nom de fichier
  const filename = path.basename(userInput);

  // Vérifier pas de traversal
  if (filename.includes('..') || filename.includes('/')) {
    throw new Error('Invalid filename');
  }

  // Construire le path safe
  const fullPath = path.join(baseDir, filename);

  // Vérifier que le résultat est bien dans baseDir
  if (!fullPath.startsWith(baseDir)) {
    throw new Error('Path traversal detected');
  }

  return fullPath;
}
```

## Protocole Incident Sécurité

Si une vulnérabilité est détectée:

1. **STOP** - Arrêter tout développement
2. **ASSESS** - Évaluer la sévérité (CRITICAL/HIGH/MEDIUM/LOW)
3. **CONTAIN** - Invalider credentials compromis si nécessaire
4. **FIX** - Corriger la vulnérabilité
5. **SCAN** - Rechercher des patterns similaires dans tout le codebase
6. **REVIEW** - Post-mortem si CRITICAL/HIGH
7. **DOCUMENT** - Mettre à jour les règles si nouveau pattern
