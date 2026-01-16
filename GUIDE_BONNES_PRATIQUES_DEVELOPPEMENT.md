# Guide Complet des Bonnes Pratiques de Développement Logiciel

> **Document de référence** pour construire un projet SaaS professionnel, évolutif et crédible.
> Dernière mise à jour : Décembre 2025

---

## Table des Matières

1. [Architecture Logicielle](#1-architecture-logicielle)
2. [Organisation des Fichiers et Dossiers](#2-organisation-des-fichiers-et-dossiers)
3. [Principes SOLID](#3-principes-solid)
4. [Qualité du Code](#4-qualité-du-code)
5. [Sécurité (OWASP 2025)](#5-sécurité-owasp-2025)
6. [Stratégie de Tests](#6-stratégie-de-tests)
7. [CI/CD et DevOps](#7-cicd-et-devops)
8. [Code Reviews et Pull Requests](#8-code-reviews-et-pull-requests)
9. [Documentation](#9-documentation)
10. [Checklist de Validation](#10-checklist-de-validation)

---

## 1. Architecture Logicielle

### 1.1 Clean Architecture

La Clean Architecture, popularisée par Robert C. Martin, divise l'application en **4 couches distinctes** :

```
┌─────────────────────────────────────────────────────┐
│                  Frameworks & Drivers                │
│    (Web, UI, DB, External APIs, Devices)            │
├─────────────────────────────────────────────────────┤
│                Interface Adapters                    │
│    (Controllers, Presenters, Gateways)              │
├─────────────────────────────────────────────────────┤
│                   Use Cases                          │
│    (Application Business Rules)                      │
├─────────────────────────────────────────────────────┤
│                    Entities                          │
│    (Enterprise Business Rules)                       │
└─────────────────────────────────────────────────────┘
```

**Principe fondamental** : La logique métier ne doit JAMAIS dépendre de l'infrastructure.

#### Couches détaillées :

| Couche | Responsabilité | Exemples |
|--------|----------------|----------|
| **Entities** | Règles métier fondamentales | User, Product, Order |
| **Use Cases** | Cas d'utilisation spécifiques | CreateUser, ProcessPayment |
| **Interface Adapters** | Conversion de données | Controllers, Repositories |
| **Frameworks** | Outils externes | Express, PostgreSQL, React |

### 1.2 Règles de Dépendance

```
Les dépendances pointent TOUJOURS vers l'intérieur :

    Frameworks → Adapters → Use Cases → Entities
         ↓           ↓           ↓
    (dépend de) (dépend de) (dépend de)
```

**Important** : Ne pas implémenter Clean Architecture pour des applications CRUD simples. Commencer simple et refactorer quand la complexité augmente.

---

## 2. Organisation des Fichiers et Dossiers

### 2.1 Structure Backend Recommandée

```
src/
├── config/                 # Configuration (env, database, etc.)
│   ├── database.ts
│   ├── environment.ts
│   └── index.ts
│
├── modules/               # Organisation par fonctionnalité (Feature-Based)
│   ├── auth/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── dto/
│   │   ├── entities/
│   │   ├── tests/
│   │   └── index.ts
│   │
│   ├── users/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── dto/
│   │   ├── entities/
│   │   ├── tests/
│   │   └── index.ts
│   │
│   └── payments/
│       └── ...
│
├── shared/                # Code partagé entre modules
│   ├── middlewares/
│   ├── utils/
│   ├── exceptions/
│   ├── guards/
│   └── decorators/
│
├── infrastructure/        # Implémentations techniques
│   ├── database/
│   ├── cache/
│   ├── queue/
│   └── external-services/
│
├── app.ts                 # Point d'entrée application
└── main.ts               # Bootstrap
```

### 2.2 Structure Frontend Recommandée

```
src/
├── assets/               # Ressources statiques
│   ├── images/
│   ├── fonts/
│   └── styles/
│
├── components/           # Composants réutilisables
│   ├── ui/              # Composants de base (Button, Input, Modal)
│   ├── layout/          # Composants de mise en page
│   └── common/          # Composants partagés
│
├── features/            # Organisation par fonctionnalité
│   ├── auth/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── store/
│   │   └── types/
│   │
│   ├── dashboard/
│   └── settings/
│
├── hooks/               # Hooks globaux
├── services/            # Services API
├── store/               # State management global
├── types/               # Types TypeScript globaux
├── utils/               # Fonctions utilitaires
├── constants/           # Constantes
├── routes/              # Configuration routing
└── App.tsx
```

### 2.3 Conventions de Nommage

| Type | Convention | Exemple |
|------|------------|---------|
| **Fichiers composants** | PascalCase | `UserProfile.tsx` |
| **Fichiers utilitaires** | camelCase | `formatDate.ts` |
| **Dossiers** | kebab-case | `user-profile/` |
| **Constantes** | SCREAMING_SNAKE_CASE | `MAX_RETRY_COUNT` |
| **Interfaces/Types** | PascalCase avec préfixe I ou suffixe | `IUserService` ou `UserDTO` |
| **Tests** | nom.test.ts ou nom.spec.ts | `user.service.test.ts` |

---

## 3. Principes SOLID

### 3.1 Single Responsibility Principle (SRP)

> **Une classe ne doit avoir qu'une seule raison de changer.**

```typescript
// ❌ MAUVAIS : Une classe qui fait tout
class UserService {
  createUser(data: UserDTO) { /* ... */ }
  sendWelcomeEmail(user: User) { /* ... */ }
  generatePDF(user: User) { /* ... */ }
  validateCreditCard(card: string) { /* ... */ }
}

// ✅ BON : Responsabilités séparées
class UserService {
  createUser(data: UserDTO) { /* ... */ }
}

class EmailService {
  sendWelcomeEmail(user: User) { /* ... */ }
}

class PDFService {
  generateUserReport(user: User) { /* ... */ }
}

class PaymentValidator {
  validateCreditCard(card: string) { /* ... */ }
}
```

### 3.2 Open/Closed Principle (OCP)

> **Ouvert à l'extension, fermé à la modification.**

```typescript
// ❌ MAUVAIS : Modification nécessaire pour chaque nouveau type
class PaymentProcessor {
  process(payment: Payment) {
    if (payment.type === 'credit') { /* ... */ }
    else if (payment.type === 'paypal') { /* ... */ }
    else if (payment.type === 'crypto') { /* ... */ } // Nouvelle modification
  }
}

// ✅ BON : Extension sans modification
interface PaymentStrategy {
  process(payment: Payment): Promise<Result>;
}

class CreditCardPayment implements PaymentStrategy {
  process(payment: Payment): Promise<Result> { /* ... */ }
}

class PayPalPayment implements PaymentStrategy {
  process(payment: Payment): Promise<Result> { /* ... */ }
}

// Ajouter un nouveau type = créer une nouvelle classe
class CryptoPayment implements PaymentStrategy {
  process(payment: Payment): Promise<Result> { /* ... */ }
}
```

### 3.3 Liskov Substitution Principle (LSP)

> **Les objets dérivés doivent pouvoir remplacer les objets de base.**

```typescript
// ❌ MAUVAIS : Le carré ne peut pas substituer le rectangle
class Rectangle {
  constructor(protected width: number, protected height: number) {}
  setWidth(w: number) { this.width = w; }
  setHeight(h: number) { this.height = h; }
  area() { return this.width * this.height; }
}

class Square extends Rectangle {
  setWidth(w: number) { this.width = this.height = w; } // Casse le comportement
  setHeight(h: number) { this.width = this.height = h; }
}

// ✅ BON : Interface commune
interface Shape {
  area(): number;
}

class Rectangle implements Shape {
  constructor(private width: number, private height: number) {}
  area() { return this.width * this.height; }
}

class Square implements Shape {
  constructor(private side: number) {}
  area() { return this.side * this.side; }
}
```

### 3.4 Interface Segregation Principle (ISP)

> **Les clients ne doivent pas dépendre d'interfaces qu'ils n'utilisent pas.**

```typescript
// ❌ MAUVAIS : Interface trop large
interface Worker {
  work(): void;
  eat(): void;
  sleep(): void;
}

class Robot implements Worker {
  work() { /* ... */ }
  eat() { throw new Error('Robots cannot eat'); } // Problème !
  sleep() { throw new Error('Robots cannot sleep'); }
}

// ✅ BON : Interfaces séparées
interface Workable {
  work(): void;
}

interface Eatable {
  eat(): void;
}

interface Sleepable {
  sleep(): void;
}

class Human implements Workable, Eatable, Sleepable {
  work() { /* ... */ }
  eat() { /* ... */ }
  sleep() { /* ... */ }
}

class Robot implements Workable {
  work() { /* ... */ }
}
```

### 3.5 Dependency Inversion Principle (DIP)

> **Dépendre des abstractions, pas des concrétions.**

```typescript
// ❌ MAUVAIS : Dépendance directe
class UserService {
  private database = new PostgreSQLDatabase(); // Couplage fort

  getUser(id: string) {
    return this.database.query(`SELECT * FROM users WHERE id = ${id}`);
  }
}

// ✅ BON : Injection de dépendance
interface Database {
  query(sql: string): Promise<any>;
}

class UserService {
  constructor(private database: Database) {} // Injection

  getUser(id: string) {
    return this.database.query(`SELECT * FROM users WHERE id = ${id}`);
  }
}

// Utilisable avec n'importe quelle implémentation
const userService = new UserService(new PostgreSQLDatabase());
const userServiceMongo = new UserService(new MongoDBAdapter());
```

---

## 4. Qualité du Code

### 4.1 Configuration ESLint + Prettier (2025)

**Installation :**
```bash
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
npm install -D prettier eslint-config-prettier eslint-plugin-prettier
npm install -D husky lint-staged
```

**eslint.config.mjs (Flat Config ESLint 9+) :**
```javascript
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  prettier,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'warn',
    },
  }
);
```

**prettier.config.mjs :**
```javascript
export default {
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'es5',
  printWidth: 100,
  bracketSpacing: true,
  arrowParens: 'avoid',
};
```

### 4.2 Pre-commit Hooks

**package.json :**
```json
{
  "scripts": {
    "lint": "eslint . --fix",
    "format": "prettier --write .",
    "type-check": "tsc --noEmit",
    "prepare": "husky install"
  },
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md}": [
      "prettier --write"
    ]
  }
}
```

### 4.3 Règles de Code Propre

| Règle | Description |
|-------|-------------|
| **DRY** | Don't Repeat Yourself - Éviter la duplication |
| **KISS** | Keep It Simple, Stupid - Garder le code simple |
| **YAGNI** | You Aren't Gonna Need It - Ne pas anticiper inutilement |
| **Fonctions courtes** | Maximum 20-30 lignes par fonction |
| **Nommage explicite** | Le nom doit révéler l'intention |
| **Pas de magic numbers** | Utiliser des constantes nommées |
| **Early return** | Retourner tôt pour éviter l'imbrication |
| **Pure functions** | Préférer les fonctions sans effets de bord |

**Exemple Early Return :**
```typescript
// ❌ MAUVAIS
function processOrder(order: Order) {
  if (order) {
    if (order.items.length > 0) {
      if (order.isPaid) {
        // logique principale
      }
    }
  }
}

// ✅ BON
function processOrder(order: Order) {
  if (!order) return;
  if (order.items.length === 0) return;
  if (!order.isPaid) return;

  // logique principale
}
```

---

## 5. Sécurité (OWASP 2025)

### 5.1 OWASP Top 10 - 2025

| Rang | Vulnérabilité | Description |
|------|---------------|-------------|
| **A01** | Broken Access Control | Contrôle d'accès défaillant |
| **A02** | Cryptographic Failures | Échecs cryptographiques |
| **A03** | Injection | SQL, NoSQL, OS, LDAP injection |
| **A04** | Insecure Design | Conception non sécurisée |
| **A05** | Security Misconfiguration | Mauvaise configuration |
| **A06** | Vulnerable Components | Composants vulnérables |
| **A07** | Auth Failures | Échecs d'authentification |
| **A08** | Software Data Integrity | Intégrité des données |
| **A09** | Logging Failures | Échecs de journalisation |
| **A10** | SSRF | Server-Side Request Forgery |

### 5.2 Mesures de Protection

#### A01 - Broken Access Control
```typescript
// ✅ Implémenter RBAC (Role-Based Access Control)
@Guard(RolesGuard)
@Roles('admin')
async deleteUser(userId: string) {
  // Vérifier que l'utilisateur a les droits
}

// ✅ Principe du moindre privilège
// Refuser par défaut, autoriser explicitement
```

#### A02 - Cryptographic Failures
```typescript
// ✅ Utiliser des algorithmes modernes
import { hash, compare } from 'bcrypt';

const SALT_ROUNDS = 12;

async function hashPassword(password: string): Promise<string> {
  return hash(password, SALT_ROUNDS);
}

// ✅ TLS 1.3 pour le transport
// ✅ AES-256 pour le chiffrement au repos
// ✅ Rotation régulière des clés
```

#### A03 - Injection
```typescript
// ❌ JAMAIS : Concaténation SQL
const query = `SELECT * FROM users WHERE id = '${userId}'`;

// ✅ TOUJOURS : Requêtes paramétrées
const user = await prisma.user.findUnique({
  where: { id: userId }
});

// ✅ Validation des entrées
import { z } from 'zod';

const UserInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  age: z.number().int().positive().max(150),
});
```

#### A05 - Security Misconfiguration
```typescript
// ✅ Headers de sécurité
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: true,
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: true,
  dnsPrefetchControl: true,
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: true,
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: true,
  referrerPolicy: true,
  xssFilter: true,
}));

// ✅ CORS configuré strictement
app.use(cors({
  origin: ['https://votredomaine.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));
```

#### Gestion des Secrets
```typescript
// ❌ JAMAIS : Secrets en dur
const API_KEY = 'sk-1234567890';

// ✅ TOUJOURS : Variables d'environnement
const API_KEY = process.env.API_KEY;

// ✅ Utiliser un gestionnaire de secrets (Vault, AWS Secrets Manager)
// ✅ Ne jamais committer de fichiers .env
```

### 5.3 Checklist Sécurité

- [ ] Authentification multi-facteurs (MFA)
- [ ] Sessions avec expiration et rotation
- [ ] Rate limiting sur les endpoints sensibles
- [ ] Validation de toutes les entrées utilisateur
- [ ] Échappement des sorties (XSS)
- [ ] Headers de sécurité HTTP
- [ ] HTTPS obligatoire
- [ ] Audit régulier des dépendances (`npm audit`)
- [ ] Logs de sécurité et monitoring
- [ ] Politique de mots de passe robuste

---

## 6. Stratégie de Tests

### 6.1 Pyramide des Tests

```
                    ┌─────────┐
                    │   E2E   │  5-10%
                    │  Tests  │
                   ─┴─────────┴─
                  ┌─────────────┐
                  │ Integration │  15-20%
                  │    Tests    │
                 ─┴─────────────┴─
                ┌─────────────────┐
                │    Unit Tests   │  70-80%
                │                 │
                └─────────────────┘
```

### 6.2 Tests Unitaires

**Outils recommandés :** Jest, Vitest

```typescript
// user.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserService } from './user.service';

describe('UserService', () => {
  let userService: UserService;
  let mockUserRepository: MockUserRepository;

  beforeEach(() => {
    mockUserRepository = {
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };
    userService = new UserService(mockUserRepository);
  });

  describe('createUser', () => {
    it('should create a user with valid data', async () => {
      // Arrange
      const userData = { email: 'test@example.com', name: 'Test User' };
      mockUserRepository.create.mockResolvedValue({ id: '1', ...userData });

      // Act
      const result = await userService.createUser(userData);

      // Assert
      expect(result).toEqual({ id: '1', ...userData });
      expect(mockUserRepository.create).toHaveBeenCalledWith(userData);
    });

    it('should throw error for invalid email', async () => {
      // Arrange
      const userData = { email: 'invalid-email', name: 'Test User' };

      // Act & Assert
      await expect(userService.createUser(userData)).rejects.toThrow('Invalid email');
    });
  });
});
```

### 6.3 Tests d'Intégration

```typescript
// auth.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { setupTestDatabase, teardownTestDatabase } from './helpers';

describe('Auth API Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'SecureP@ss123',
          name: 'New User',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('user.id');
      expect(response.body.user.email).toBe('newuser@example.com');
    });

    it('should reject duplicate email', async () => {
      // First registration
      await request(app).post('/api/auth/register').send({
        email: 'duplicate@example.com',
        password: 'SecureP@ss123',
        name: 'User 1',
      });

      // Second registration with same email
      const response = await request(app).post('/api/auth/register').send({
        email: 'duplicate@example.com',
        password: 'SecureP@ss123',
        name: 'User 2',
      });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already exists');
    });
  });
});
```

### 6.4 Tests E2E

**Outils recommandés :** Playwright, Cypress

```typescript
// checkout.e2e.test.ts
import { test, expect } from '@playwright/test';

test.describe('Checkout Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login avant chaque test
    await page.goto('/login');
    await page.fill('[data-testid="email"]', 'test@example.com');
    await page.fill('[data-testid="password"]', 'password123');
    await page.click('[data-testid="submit"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('should complete a purchase successfully', async ({ page }) => {
    // Ajouter un produit au panier
    await page.goto('/products');
    await page.click('[data-testid="product-1"] [data-testid="add-to-cart"]');

    // Aller au checkout
    await page.click('[data-testid="cart-icon"]');
    await page.click('[data-testid="checkout-button"]');

    // Remplir les informations de paiement
    await page.fill('[data-testid="card-number"]', '4242424242424242');
    await page.fill('[data-testid="expiry"]', '12/25');
    await page.fill('[data-testid="cvv"]', '123');

    // Confirmer
    await page.click('[data-testid="confirm-payment"]');

    // Vérifier le succès
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    await expect(page).toHaveURL(/\/orders\/\w+/);
  });
});
```

### 6.5 Couverture de Code

**Objectif : 70-80% de couverture**

```json
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: ['node_modules/', 'tests/', '**/*.d.ts'],
      thresholds: {
        lines: 70,
        branches: 70,
        functions: 70,
        statements: 70,
      },
    },
  },
});
```

---

## 7. CI/CD et DevOps

### 7.1 Pipeline GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '20'

jobs:
  # Job 1: Lint et Type Check
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run ESLint
        run: npm run lint

      - name: Run Type Check
        run: npm run type-check

      - name: Check Formatting
        run: npm run format:check

  # Job 2: Tests unitaires et intégration
  test:
    runs-on: ubuntu-latest
    needs: quality
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run Unit Tests
        run: npm run test:unit -- --coverage

      - name: Run Integration Tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgres://test:test@localhost:5432/test

      - name: Upload Coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

  # Job 3: Tests E2E
  e2e:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Build Application
        run: npm run build

      - name: Run E2E Tests
        run: npm run test:e2e

      - name: Upload E2E Report
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/

  # Job 4: Security Scan
  security:
    runs-on: ubuntu-latest
    needs: quality
    steps:
      - uses: actions/checkout@v4

      - name: Run npm audit
        run: npm audit --audit-level=high

      - name: Run Snyk Security Scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

  # Job 5: Build et Deploy
  deploy:
    runs-on: ubuntu-latest
    needs: [test, e2e, security]
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Deploy to Production
        run: |
          # Votre script de déploiement
          echo "Deploying to production..."
```

### 7.2 Structure des Branches

```
main (production)
  │
  └── develop (intégration)
        │
        ├── feature/user-authentication
        ├── feature/payment-integration
        ├── bugfix/login-error
        └── hotfix/critical-security-patch
```

**Règles :**
- `main` : Code en production, protégé
- `develop` : Branche d'intégration
- `feature/*` : Nouvelles fonctionnalités
- `bugfix/*` : Corrections de bugs
- `hotfix/*` : Corrections urgentes de production

---

## 8. Code Reviews et Pull Requests

### 8.1 Taille des Pull Requests

| Taille | Lignes | Recommandation |
|--------|--------|----------------|
| **XS** | < 50 | Idéal |
| **S** | 50-200 | Bon |
| **M** | 200-400 | Acceptable |
| **L** | 400-800 | À éviter |
| **XL** | > 800 | Diviser obligatoirement |

**Règle d'or :** Une PR doit pouvoir être revue en moins de 15 minutes.

### 8.2 Template de Pull Request

```markdown
## Description
<!-- Décrivez brièvement les changements -->

## Type de changement
- [ ] Bug fix
- [ ] Nouvelle fonctionnalité
- [ ] Breaking change
- [ ] Refactoring
- [ ] Documentation

## Comment tester ?
<!-- Étapes pour tester les changements -->
1.
2.
3.

## Checklist
- [ ] Mon code suit les conventions du projet
- [ ] J'ai ajouté des tests
- [ ] Tous les tests passent
- [ ] J'ai mis à jour la documentation si nécessaire
- [ ] J'ai vérifié qu'il n'y a pas de conflits

## Screenshots (si applicable)
<!-- Ajoutez des captures d'écran -->

## Issues liées
Closes #123
```

### 8.3 Guide du Reviewer

**Ce qu'il faut vérifier :**

1. **Fonctionnalité** : Le code fait-il ce qu'il est censé faire ?
2. **Design** : Le code est-il bien conçu et s'intègre-t-il à l'architecture ?
3. **Complexité** : Un autre développeur comprendrait-il facilement ?
4. **Tests** : Les tests sont-ils appropriés et couvrent-ils les cas limites ?
5. **Nommage** : Les noms sont-ils clairs et descriptifs ?
6. **Commentaires** : Les commentaires sont-ils nécessaires et utiles ?
7. **Style** : Le code respecte-t-il les conventions ?
8. **Sécurité** : Y a-t-il des vulnérabilités potentielles ?

**Communication constructive :**
```
❌ "C'est faux, refais-le."
✅ "Je suggère d'utiliser X car cela améliorerait Y."

❌ "Ce code est illisible."
✅ "Pourrais-tu extraire cette logique dans une fonction nommée pour améliorer la lisibilité ?"
```

### 8.4 CODEOWNERS

```
# .github/CODEOWNERS

# Équipe backend pour les fichiers API
/src/api/          @team/backend
/src/services/     @team/backend

# Équipe frontend pour les composants
/src/components/   @team/frontend
/src/pages/        @team/frontend

# Équipe DevOps pour la CI/CD
/.github/          @team/devops
/docker/           @team/devops

# Lead technique pour les changements critiques
/src/core/         @lead-developer
/src/security/     @lead-developer @security-team
```

---

## 9. Documentation

### 9.1 Documentation du Code

**README.md minimal :**
```markdown
# Nom du Projet

Description courte du projet.

## Prérequis

- Node.js >= 20
- PostgreSQL >= 15
- Redis >= 7

## Installation

```bash
git clone https://github.com/votre-repo.git
cd votre-repo
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

## Scripts disponibles

| Script | Description |
|--------|-------------|
| `npm run dev` | Lance le serveur de développement |
| `npm run build` | Compile pour la production |
| `npm run test` | Lance tous les tests |
| `npm run lint` | Vérifie le code avec ESLint |

## Structure du projet

[Voir la documentation d'architecture](./docs/architecture.md)

## Contribution

[Voir le guide de contribution](./CONTRIBUTING.md)

## Licence

MIT
```

### 9.2 Documentation API (OpenAPI)

```yaml
# openapi.yaml
openapi: 3.1.0
info:
  title: Mon API SaaS
  version: 1.0.0
  description: API pour la gestion des utilisateurs et des ressources

servers:
  - url: https://api.example.com/v1
    description: Production
  - url: http://localhost:3000/v1
    description: Development

paths:
  /users:
    get:
      summary: Liste tous les utilisateurs
      tags: [Users]
      security:
        - bearerAuth: []
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
      responses:
        '200':
          description: Liste des utilisateurs
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/User'
                  pagination:
                    $ref: '#/components/schemas/Pagination'

components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
          format: uuid
        email:
          type: string
          format: email
        name:
          type: string
        createdAt:
          type: string
          format: date-time
      required:
        - id
        - email
        - name

  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

### 9.3 Commentaires dans le Code

```typescript
// ❌ MAUVAIS : Commentaire inutile
// Incrémente i
i++;

// ❌ MAUVAIS : Commentaire qui décrit le "quoi"
// Parcourt la liste des utilisateurs
users.forEach(user => processUser(user));

// ✅ BON : Commentaire qui explique le "pourquoi"
// On utilise setTimeout car l'API de paiement nécessite un délai
// de 100ms minimum entre les requêtes pour éviter le rate limiting
await delay(100);

// ✅ BON : JSDoc pour les fonctions publiques
/**
 * Calcule le prix total avec les taxes et remises applicables.
 *
 * @param items - Liste des articles du panier
 * @param couponCode - Code promo optionnel
 * @returns Le prix total en centimes
 * @throws {InvalidCouponError} Si le code promo est invalide
 *
 * @example
 * const total = calculateTotal([{ price: 1000, qty: 2 }], 'SAVE10');
 * // Returns: 1800 (2000 - 10%)
 */
function calculateTotal(items: CartItem[], couponCode?: string): number {
  // ...
}
```

---

## 10. Checklist de Validation

### 10.1 Avant de Commencer un Projet

- [ ] Structure de dossiers définie
- [ ] Conventions de nommage documentées
- [ ] ESLint + Prettier configurés
- [ ] Git hooks configurés (husky + lint-staged)
- [ ] Template de PR créé
- [ ] Pipeline CI/CD de base en place
- [ ] Documentation de base (README, CONTRIBUTING)
- [ ] Environnements définis (.env.example)

### 10.2 Avant Chaque Commit

- [ ] Code lint sans erreurs
- [ ] Tests passent
- [ ] Pas de console.log ou code de debug
- [ ] Pas de secrets en dur
- [ ] Message de commit clair et descriptif

### 10.3 Avant Chaque Merge

- [ ] PR de taille raisonnable (< 400 lignes)
- [ ] Tests ajoutés pour les nouvelles fonctionnalités
- [ ] Code review approuvée
- [ ] CI pipeline vert
- [ ] Documentation mise à jour si nécessaire
- [ ] Pas de conflits avec la branche cible

### 10.4 Revue de Sécurité Régulière

- [ ] `npm audit` sans vulnérabilités critiques
- [ ] Dépendances à jour
- [ ] Secrets rotés régulièrement
- [ ] Logs de sécurité vérifiés
- [ ] Backups testés
- [ ] Tests de pénétration planifiés

---

## Sources et Références

### Organisation du Code
- [MIT Broad Institute - File Structure](https://mitcommlab.mit.edu/broad/commkit/file-structure/)
- [DEV Community - Folder Structure Best Practices](https://dev.to/mattqafouri/projects-folder-structures-best-practices-g9d)
- [GeeksforGeeks - File and Folder Organization](https://www.geeksforgeeks.org/javascript/file-and-folder-organization-best-practices-for-web-development/)

### Architecture et SOLID
- [DigitalOcean - SOLID Design Principles](https://www.digitalocean.com/community/conceptual-articles/s-o-l-i-d-the-first-five-principles-of-object-oriented-design)
- [Medium - Clean Architecture and SOLID Principles](https://medium.com/@unaware_harry/a-deep-dive-into-clean-architecture-and-solid-principles-dcdcec5db48a)
- [Medium - SOLID Principles: Clean Architecture in Practice](https://medium.com/@raissa.puti/solid-principles-clean-architecture-in-practice-55c696fba9e6)

### Sécurité
- [OWASP Top Ten 2025](https://owasp.org/www-project-top-ten/)
- [OWASP Web Security Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [Aikido - OWASP Top 10 2025 Changes](https://www.aikido.dev/blog/owasp-top-10-2025-changes-for-developers)
- [OWASP Secure Coding Practices](https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/)

### Qualité du Code
- [Better Stack - Prettier vs ESLint](https://betterstack.com/community/guides/scaling-nodejs/prettier-vs-eslint/)
- [Finn Nannestad - Linting and Formatting TypeScript 2025](https://finnnannestad.com/blog/linting-and-formatting)
- [Microsoft Tech Community - ESLint, Prettier and Build Tools](https://techcommunity.microsoft.com/blog/educatordeveloperblog/supercharge-your-typescript-workflow-eslint-prettier-and-build-tools/4375295)

### Tests
- [Talent500 - Unit, Integration, and E2E Testing 2025](https://talent500.com/blog/fullstack-app-testing-unit-integration-e2e-2025/)
- [Bunnyshell - E2E Testing Best Practices 2025](https://www.bunnyshell.com/blog/best-practices-for-end-to-end-testing-in-2025/)
- [Apptension - SaaS Testing Best Practices](https://www.apptension.com/blog-posts/saas-testing)

### CI/CD
- [DevOps.com - CI/CD with GitHub Actions](https://devops.com/streamlining-ci-cd-building-efficient-pipelines-with-github-actions-for-modern-devops/)
- [GitHub Blog - Build CI/CD Pipeline](https://github.blog/enterprise-software/ci-cd/build-ci-cd-pipeline-github-actions-four-steps/)
- [NetApp - GitHub Actions Best Practices](https://www.netapp.com/learn/cvo-blg-5-github-actions-cicd-best-practices/)

### Code Reviews
- [Swarmia - Complete Guide to Code Reviews](https://www.swarmia.com/blog/a-complete-guide-to-code-reviews/)
- [Rewind - Best Practices for Reviewing PRs](https://rewind.com/blog/best-practices-for-reviewing-pull-requests-in-github/)
- [HeySopa - Pull Request Best Practices 2025](https://www.heysopa.com/post/pull-request-best-practices)

### Documentation
- [Theneo - API Documentation Best Practices 2025](https://www.theneo.io/blog/api-documentation-best-practices-guide-2025)
- [Postman - API Documentation](https://www.postman.com/api-platform/api-documentation/)
- [Kong - Guide to API Documentation](https://konghq.com/blog/learning-center/guide-to-api-documentation)

---

> **Ce document est un guide vivant.** Il doit être mis à jour régulièrement pour refléter les évolutions des bonnes pratiques et les besoins spécifiques de votre projet.
