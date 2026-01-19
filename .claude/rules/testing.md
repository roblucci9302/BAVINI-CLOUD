# Testing Rules

> Standards de test pour BAVINI

## Coverage Requirements

| Type | Minimum | Target |
|------|---------|--------|
| **Unit Tests** | 80% | 90% |
| **Integration** | 70% | 80% |
| **E2E** | Critical paths | All flows |

## Types de Tests

### Unit Tests (Vitest)

Tester les fonctions et composants isolément.

```typescript
// Fichier: utils/format.spec.ts
import { describe, it, expect } from 'vitest';
import { formatDate, formatCurrency } from './format';

describe('formatDate', () => {
  it('should format ISO date to locale string', () => {
    expect(formatDate('2024-01-15')).toBe('15/01/2024');
  });

  it('should return empty string for invalid date', () => {
    expect(formatDate('invalid')).toBe('');
  });
});
```

### Integration Tests (Vitest + Testing Library)

Tester les interactions entre composants.

```typescript
// Fichier: components/Editor.integration.spec.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Editor } from './Editor';
import { workbenchStore } from '~/lib/stores/workbench';

describe('Editor Integration', () => {
  it('should update store when content changes', async () => {
    render(<Editor />);

    const editor = screen.getByRole('textbox');
    await fireEvent.change(editor, { target: { value: 'new content' } });

    expect(workbenchStore.unsavedFiles.get().size).toBeGreaterThan(0);
  });
});
```

### E2E Tests (Playwright)

Tester les flows utilisateur complets.

```typescript
// Fichier: e2e/chat-flow.spec.ts
import { test, expect } from '@playwright/test';

test('user can send message and receive response', async ({ page }) => {
  await page.goto('/');

  // Send message
  await page.fill('[data-testid="chat-input"]', 'Create a React component');
  await page.click('[data-testid="send-button"]');

  // Wait for response
  await expect(page.locator('[data-testid="assistant-message"]')).toBeVisible({
    timeout: 30000,
  });

  // Verify code was generated
  await expect(page.locator('[data-testid="code-block"]')).toBeVisible();
});
```

## TDD Workflow

```
1. Écrire le test FIRST
2. Voir le test échouer (RED)
3. Écrire le code minimal pour passer (GREEN)
4. Refactorer (REFACTOR)
5. Vérifier coverage >= 80%
```

## Naming Conventions

```typescript
// Pattern: should_[action]_when_[condition]
describe('Calculator', () => {
  it('should_return_sum_when_adding_two_numbers', () => { });
  it('should_throw_when_dividing_by_zero', () => { });
  it('should_handle_negative_numbers', () => { });
});

// Ou format BDD
describe('Calculator', () => {
  describe('add', () => {
    it('returns the sum of two positive numbers', () => { });
    it('handles negative numbers correctly', () => { });
  });
});
```

## Mocking Rules

### Quand mocker

- ✅ APIs externes
- ✅ Timers (setTimeout, setInterval)
- ✅ Random values
- ✅ Date/Time
- ✅ Workers (dans certains cas)

### Quand NE PAS mocker

- ❌ Logique métier interne
- ❌ Transformations de données simples
- ❌ State stores (sauf isolation nécessaire)

### Exemple de Mock

```typescript
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock fetch
vi.mock('~/utils/fetch', () => ({
  fetchAPI: vi.fn(),
}));

import { fetchAPI } from '~/utils/fetch';

describe('MyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call API with correct params', async () => {
    (fetchAPI as vi.Mock).mockResolvedValue({ data: 'test' });

    await myService.getData();

    expect(fetchAPI).toHaveBeenCalledWith('/api/data', {
      method: 'GET',
    });
  });
});
```

## Test Structure

```typescript
describe('ModuleName', () => {
  // Setup commun
  beforeAll(() => { /* Setup once */ });
  beforeEach(() => { /* Setup each test */ });
  afterEach(() => { /* Cleanup each test */ });
  afterAll(() => { /* Cleanup once */ });

  describe('methodName', () => {
    it('should do X when Y', () => {
      // Arrange
      const input = createTestInput();

      // Act
      const result = methodName(input);

      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

## Commands

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# With coverage
pnpm test:coverage

# Specific file
pnpm test path/to/file.spec.ts

# Run E2E
pnpm exec playwright test
```

## Quand les Tests Échouent

1. **Lire le message d'erreur** complètement
2. **Vérifier l'isolation** (mocks, beforeEach cleanup)
3. **Vérifier les assertions** (ordre, valeurs exactes)
4. **FIX THE CODE, NOT THE TEST** (sauf si le test est incorrect)
5. Si bloqué, utiliser `/tdd` pour assistance
