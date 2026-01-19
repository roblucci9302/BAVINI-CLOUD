# Coding Style Rules

> Standards de code pour BAVINI

## TypeScript Strict

```typescript
// tsconfig.json doit avoir:
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

## Règles Fondamentales

### 1. Pas de `any`

```typescript
// ❌ INTERDIT
function process(data: any) { }
const result = response as any;

// ✅ CORRECT
function process(data: unknown) {
  if (isValidData(data)) {
    // data est maintenant typé
  }
}

// Si vraiment nécessaire, justifier avec commentaire
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const legacy: any = oldAPI.data; // Legacy API non typée
```

### 2. Immutabilité

```typescript
// ❌ MUTATION
const arr = [1, 2, 3];
arr.push(4);

const obj = { a: 1 };
obj.b = 2;

// ✅ IMMUTABLE
const arr = [1, 2, 3];
const newArr = [...arr, 4];

const obj = { a: 1 };
const newObj = { ...obj, b: 2 };

// Pour les stores
store.setKey('field', newValue); // Pas store.get().field = newValue
```

### 3. Early Returns

```typescript
// ❌ NESTING PROFOND
function process(user) {
  if (user) {
    if (user.isActive) {
      if (user.hasPermission) {
        return doWork(user);
      }
    }
  }
  return null;
}

// ✅ EARLY RETURNS
function process(user) {
  if (!user) return null;
  if (!user.isActive) return null;
  if (!user.hasPermission) return null;

  return doWork(user);
}
```

### 4. Fonctions Pures

```typescript
// ❌ EFFET DE BORD
let counter = 0;
function increment() {
  counter++;
  return counter;
}

// ✅ PURE
function increment(counter: number): number {
  return counter + 1;
}
```

### 5. Noms Explicites

```typescript
// ❌ CRYPTIQUE
const d = new Date();
const u = users.filter(u => u.a);
function calc(x, y) { }

// ✅ EXPLICITE
const createdAt = new Date();
const activeUsers = users.filter(user => user.isActive);
function calculateTotal(price: number, quantity: number) { }
```

### 6. Pas de Magic Numbers

```typescript
// ❌ MAGIC NUMBER
if (retries < 3) { }
setTimeout(fn, 5000);

// ✅ CONSTANTE NOMMÉE
const MAX_RETRIES = 3;
const TIMEOUT_MS = 5000;

if (retries < MAX_RETRIES) { }
setTimeout(fn, TIMEOUT_MS);
```

### 7. Logger au lieu de console.log

```typescript
// ❌ EN PRODUCTION
console.log('Debug:', data);

// ✅ CORRECT
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('MyModule');
logger.debug('Processing data:', data);
logger.info('Operation completed');
logger.error('Failed:', error);
```

## Structure de Fichiers

### Taille Maximum

- **Idéal**: 200-400 lignes
- **Maximum**: 800 lignes (cas exceptionnels justifiés)

### Organisation

```typescript
// 1. Imports (groupés)
import { useState, useEffect } from 'react';           // React
import { atom, map } from 'nanostores';                // External
import { createScopedLogger } from '~/utils/logger';   // Internal

// 2. Types/Interfaces
interface Props { }
type State = { };

// 3. Constants
const MAX_ITEMS = 100;

// 4. Helper functions (si petites)
function formatData(data: Data): string { }

// 5. Main export
export function MyComponent(props: Props) { }

// 6. Sub-components (si petits)
function SubComponent() { }
```

## React Patterns

### Composants

```typescript
// Props interface nommée
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

// Functional component avec types
export function Button({ label, onClick, variant = 'primary' }: ButtonProps) {
  return (
    <button
      className={`btn btn-${variant}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
```

### Hooks

```typescript
// Custom hooks préfixés par "use"
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
```

## Exports

```typescript
// Préférer named exports
export function myFunction() { }
export const MY_CONSTANT = 42;
export interface MyInterface { }

// Barrel exports dans index.ts
// lib/utils/index.ts
export { formatDate } from './format';
export { validateInput } from './validation';
export type { ValidationResult } from './types';
```

## Comments

```typescript
// ❌ COMMENTAIRE INUTILE
// Increment i by 1
i++;

// ✅ COMMENTAIRE UTILE
// We need to wait for the WebContainer to boot before accessing the filesystem
// See: https://webcontainers.io/guides/quickstart
await webcontainer.boot();

// JSDoc pour API publique
/**
 * Compiles a Vue SFC to JavaScript.
 * @param source - The Vue SFC source code
 * @param filename - The filename for source maps
 * @returns Compiled JavaScript code
 * @throws {CompilationError} If the SFC is invalid
 */
export async function compileVue(source: string, filename: string): Promise<string> {
```
