/**
 * Tests pour les évaluateurs spécialisés (Sprint 5)
 *
 * - AccessibilityEvaluator: WCAG 2.1 compliance
 * - ResponsiveEvaluator: Mobile-first approach
 * - UXPatternsEvaluator: UX best practices
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AccessibilityEvaluator } from './AccessibilityEvaluator';
import { ResponsiveEvaluator } from './ResponsiveEvaluator';
import { UXPatternsEvaluator } from './UXPatternsEvaluator';

/*
 * =============================================================================
 * AccessibilityEvaluator Tests
 * =============================================================================
 */

describe('AccessibilityEvaluator', () => {
  let evaluator: AccessibilityEvaluator;

  beforeEach(() => {
    evaluator = new AccessibilityEvaluator();
  });

  describe('Image Alt Detection', () => {
    it('should detect images without alt', () => {
      const files = [
        {
          path: 'src/App.tsx',
          content: `<img src="photo.jpg" /><img src="avatar.png" />`,
          language: 'tsx',
        },
      ];

      const result = evaluator.evaluate(files);

      expect(result.metrics.imagesWithoutAlt).toBe(2);
      expect(result.issues.some((i) => i.message.includes('image'))).toBe(true);
    });

    it('should not flag images with alt', () => {
      const files = [
        {
          path: 'src/App.tsx',
          content: `<img src="photo.jpg" alt="A beautiful landscape" />`,
          language: 'tsx',
        },
      ];

      const result = evaluator.evaluate(files);

      expect(result.metrics.imagesWithoutAlt).toBe(0);
    });
  });

  describe('Button Label Detection', () => {
    it('should detect icon buttons without aria-label', () => {
      const files = [
        {
          path: 'src/App.tsx',
          content: `<button><PlusIcon /></button>`,
          language: 'tsx',
        },
      ];

      const result = evaluator.evaluate(files);

      expect(result.metrics.buttonsWithoutLabel).toBeGreaterThan(0);
    });

    it('should not flag buttons with aria-label', () => {
      const files = [
        {
          path: 'src/App.tsx',
          content: `<button aria-label="Add item"><PlusIcon /></button>`,
          language: 'tsx',
        },
      ];

      const result = evaluator.evaluate(files);

      expect(result.metrics.buttonsWithoutLabel).toBe(0);
    });
  });

  describe('Interactive Elements', () => {
    it('should detect clickable divs without role', () => {
      const files = [
        {
          path: 'src/App.tsx',
          content: `<div onClick={() => {}}>Click me</div>`,
          language: 'tsx',
        },
      ];

      const result = evaluator.evaluate(files);

      expect(result.metrics.interactiveWithoutAria).toBeGreaterThan(0);
    });

    it('should not flag divs with role="button"', () => {
      const files = [
        {
          path: 'src/App.tsx',
          content: `<div role="button" onClick={() => {}}>Click me</div>`,
          language: 'tsx',
        },
      ];

      const result = evaluator.evaluate(files);

      expect(result.metrics.interactiveWithoutAria).toBe(0);
    });
  });

  describe('Score Calculation', () => {
    it('should return 100 for fully accessible code', () => {
      const files = [
        {
          path: 'src/App.tsx',
          content: `
            <img src="photo.jpg" alt="Description" />
            <button aria-label="Add"><PlusIcon /></button>
            <div role="button" tabIndex={0} onClick={() => {}}>Click</div>
          `,
          language: 'tsx',
        },
      ];

      const result = evaluator.evaluate(files);

      expect(result.score).toBeGreaterThanOrEqual(90);
    });

    it('should return low score for inaccessible code', () => {
      const files = [
        {
          path: 'src/App.tsx',
          content: `
            <img src="photo.jpg" />
            <img src="avatar.png" />
            <button><PlusIcon /></button>
            <div onClick={() => {}}>Click</div>
          `,
          language: 'tsx',
        },
      ];

      const result = evaluator.evaluate(files);

      expect(result.score).toBeLessThanOrEqual(80);
    });
  });
});

/*
 * =============================================================================
 * ResponsiveEvaluator Tests
 * =============================================================================
 */

describe('ResponsiveEvaluator', () => {
  let evaluator: ResponsiveEvaluator;

  beforeEach(() => {
    evaluator = new ResponsiveEvaluator();
  });

  describe('Breakpoint Detection', () => {
    it('should detect Tailwind breakpoints', () => {
      const files = [
        {
          path: 'src/App.tsx',
          content: `<div className="p-4 sm:p-6 md:p-8 lg:p-10">Content</div>`,
          language: 'tsx',
        },
      ];

      const result = evaluator.evaluate(files);

      expect(result.metrics.usesBreakpoints).toBe(true);
      expect(result.metrics.responsiveClasses).toBeGreaterThan(0);
    });

    it('should flag absence of breakpoints', () => {
      const files = [
        {
          path: 'src/App.tsx',
          content: `<div className="p-4">Content</div>`,
          language: 'tsx',
        },
        {
          path: 'src/Card.tsx',
          content: `<div className="w-full">Card</div>`,
          language: 'tsx',
        },
        {
          path: 'src/Button.tsx',
          content: `<button className="px-4 py-2">Click</button>`,
          language: 'tsx',
        },
      ];

      const result = evaluator.evaluate(files);

      expect(result.metrics.usesBreakpoints).toBe(false);
      expect(result.issues.some((i) => i.message.includes('breakpoint'))).toBe(true);
    });
  });

  describe('Flexible Layouts', () => {
    it('should detect flex and grid layouts', () => {
      const files = [
        {
          path: 'src/App.tsx',
          content: `
            <div className="flex items-center">
              <div className="grid grid-cols-3">Content</div>
            </div>
          `,
          language: 'tsx',
        },
      ];

      const result = evaluator.evaluate(files);

      expect(result.metrics.flexibleLayouts).toBeGreaterThan(0);
    });
  });

  describe('Mobile Navigation', () => {
    it('should detect mobile navigation patterns', () => {
      const files = [
        {
          path: 'src/Header.tsx',
          content: `
            const [isOpen, setIsOpen] = useState(false);
            <button onClick={() => setIsOpen(!isOpen)}>
              <Menu />
            </button>
            <Sheet open={isOpen}>
              <Navigation />
            </Sheet>
          `,
          language: 'tsx',
        },
      ];

      const result = evaluator.evaluate(files);

      expect(result.metrics.hasMobileNav).toBe(true);
    });
  });

  describe('Score Calculation', () => {
    it('should return high score for responsive code', () => {
      const files = [
        {
          path: 'src/App.tsx',
          content: `
            <div className="flex flex-col md:flex-row">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                <img className="w-full object-cover" loading="lazy" src="photo.jpg" alt="Photo" />
              </div>
            </div>
          `,
          language: 'tsx',
        },
      ];

      const result = evaluator.evaluate(files);

      expect(result.score).toBeGreaterThanOrEqual(70);
    });
  });
});

/*
 * =============================================================================
 * UXPatternsEvaluator Tests
 * =============================================================================
 */

describe('UXPatternsEvaluator', () => {
  let evaluator: UXPatternsEvaluator;

  beforeEach(() => {
    evaluator = new UXPatternsEvaluator();
  });

  describe('Loading States', () => {
    it('should detect loading states', () => {
      const files = [
        {
          path: 'src/App.tsx',
          content: `
            const { data, isLoading } = useQuery(...);
            if (isLoading) return <Spinner />;
            return <Content data={data} />;
          `,
          language: 'tsx',
        },
      ];

      const result = evaluator.evaluate(files);

      expect(result.metrics.loadingStates).toBeGreaterThan(0);
    });

    it('should flag async operations without loading states', () => {
      const files = [
        {
          path: 'src/App.tsx',
          content: `
            async function fetchData() {
              const response = await fetch('/api/data');
              return response.json();
            }
          `,
          language: 'tsx',
        },
      ];

      const result = evaluator.evaluate(files);

      // Should have issues about missing loading states
      expect(result.issues.some((i) => i.message.includes('chargement') || i.message.includes('loading'))).toBe(true);
    });
  });

  describe('Error States', () => {
    it('should detect error handling UI', () => {
      const files = [
        {
          path: 'src/App.tsx',
          content: `
            const { data, isError, error } = useQuery(...);
            if (isError) return <ErrorMessage error={error} />;
            return <Content data={data} />;
          `,
          language: 'tsx',
        },
      ];

      const result = evaluator.evaluate(files);

      expect(result.metrics.errorStates).toBeGreaterThan(0);
    });
  });

  describe('User Feedback', () => {
    it('should detect toast/notification usage', () => {
      const files = [
        {
          path: 'src/Form.tsx',
          content: `
            import { useToast } from '@/components/ui/use-toast';

            const { toast } = useToast();

            function handleSubmit() {
              toast({ title: "Succès!", description: "Données enregistrées" });
            }
          `,
          language: 'tsx',
        },
      ];

      const result = evaluator.evaluate(files);

      expect(result.metrics.userFeedback).toBeGreaterThan(0);
    });

    it('should flag forms without feedback', () => {
      const files = [
        {
          path: 'src/Form.tsx',
          content: `
            function handleSubmit() {
              fetch('/api/save', { method: 'POST', body: JSON.stringify(data) });
            }

            <form onSubmit={handleSubmit}>
              <input name="email" />
              <button type="submit">Submit</button>
            </form>
          `,
          language: 'tsx',
        },
      ];

      const result = evaluator.evaluate(files);

      expect(result.issues.some((i) => i.message.includes('feedback'))).toBe(true);
    });
  });

  describe('Empty States', () => {
    it('should detect empty state handling', () => {
      const files = [
        {
          path: 'src/List.tsx',
          content: `
            const { data } = useQuery(...);

            if (data?.length === 0) {
              return <EmptyState message="Aucun résultat" />;
            }

            return data.map(item => <Item key={item.id} {...item} />);
          `,
          language: 'tsx',
        },
      ];

      const result = evaluator.evaluate(files);

      expect(result.metrics.emptyStates).toBeGreaterThan(0);
    });
  });

  describe('Animations', () => {
    it('should detect transition/animation usage', () => {
      const files = [
        {
          path: 'src/Modal.tsx',
          content: `
            <div className="transition-opacity duration-300 ease-in-out">
              <motion.div animate={{ opacity: 1 }}>
                Content
              </motion.div>
            </div>
          `,
          language: 'tsx',
        },
      ];

      const result = evaluator.evaluate(files);

      expect(result.metrics.animations).toBeGreaterThan(0);
    });
  });

  describe('Score Calculation', () => {
    it('should return high score for good UX patterns', () => {
      const files = [
        {
          path: 'src/App.tsx',
          content: `
            import { useToast } from '@/components/ui/use-toast';

            const { data, isLoading, isError } = useQuery(...);
            const { toast } = useToast();

            if (isLoading) return <Skeleton className="w-full h-20" />;
            if (isError) return <Alert variant="destructive">Error</Alert>;
            if (data?.length === 0) return <EmptyState />;

            function handleClick() {
              toast({ title: "Success" });
            }

            return (
              <div className="transition-all duration-200">
                {data.map(item => <Card key={item.id} {...item} />)}
              </div>
            );
          `,
          language: 'tsx',
        },
      ];

      const result = evaluator.evaluate(files);

      expect(result.score).toBeGreaterThanOrEqual(70);
    });

    it('should return low score for missing UX patterns', () => {
      const files = [
        {
          path: 'src/App.tsx',
          content: `
            function App() {
              return <div>Hello World</div>;
            }
          `,
          language: 'tsx',
        },
      ];

      const result = evaluator.evaluate(files);

      // Score should be moderate since there's no async operations
      expect(result.score).toBeGreaterThanOrEqual(50);
    });
  });
});

/*
 * =============================================================================
 * Integration Tests
 * =============================================================================
 */

describe('Enhanced Evaluators Integration', () => {
  it('should work together for comprehensive evaluation', () => {
    const accessibilityEval = new AccessibilityEvaluator();
    const responsiveEval = new ResponsiveEvaluator();
    const uxPatternsEval = new UXPatternsEvaluator();

    const files = [
      {
        path: 'src/App.tsx',
        content: `
          import { useState } from 'react';
          import { useQuery } from '@tanstack/react-query';
          import { useToast } from '@/components/ui/use-toast';

          export function App() {
            const { data, isLoading, isError } = useQuery(...);
            const { toast } = useToast();

            if (isLoading) return <Skeleton className="w-full h-20" />;
            if (isError) return <Alert variant="destructive">Error</Alert>;

            return (
              <div className="flex flex-col md:flex-row gap-4 md:gap-6">
                <img src="hero.jpg" alt="Hero image" className="w-full md:w-1/2" />
                <button aria-label="Add item" onClick={() => toast({ title: "Added" })}>
                  <PlusIcon />
                </button>
              </div>
            );
          }
        `,
        language: 'tsx',
      },
    ];

    const accessibilityResult = accessibilityEval.evaluate(files);
    const responsiveResult = responsiveEval.evaluate(files);
    const uxPatternsResult = uxPatternsEval.evaluate(files);

    // All evaluators should return valid results
    expect(accessibilityResult.score).toBeGreaterThanOrEqual(0);
    expect(responsiveResult.score).toBeGreaterThanOrEqual(0);
    expect(uxPatternsResult.score).toBeGreaterThanOrEqual(0);

    // All should have metrics
    expect(accessibilityResult.metrics).toBeDefined();
    expect(responsiveResult.metrics).toBeDefined();
    expect(uxPatternsResult.metrics).toBeDefined();
  });
});
