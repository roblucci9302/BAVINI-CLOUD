import blitzPlugin from '@blitz/eslint-plugin';
import { jsFileExtensions } from '@blitz/eslint-plugin/dist/configs/javascript.js';
import { getNamingConventionRule, tsFileExtensions } from '@blitz/eslint-plugin/dist/configs/typescript.js';

export default [
  {
    ignores: ['**/dist', '**/node_modules', '**/.wrangler', '**/bolt/build'],
  },
  ...blitzPlugin.configs.recommended(),
  {
    rules: {
      '@blitz/catch-error-name': 'off',
      '@blitz/comment-syntax': 'off',
      '@blitz/block-scope-case': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  // Règles assouplies pour le système multi-agent (code généré/expérimental)
  {
    files: ['app/lib/agents/**/*.ts', 'app/lib/agents/**/*.tsx', 'app/lib/agents/**/*.spec.ts'],
    rules: {
      '@blitz/comment-syntax': 'off',
      '@blitz/block-scope-case': 'off',
      'multiline-comment-style': 'off',
      '@blitz/newline-before-return': 'off',
      'padding-line-between-statements': 'off',
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-imports': 'off',
      'no-case-declarations': 'off',
      'consistent-return': 'off',
    },
  },
  {
    files: ['**/*.tsx'],
    rules: {
      ...getNamingConventionRule({}, true),
    },
  },
  {
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    files: [...tsFileExtensions, ...jsFileExtensions, '**/*.tsx'],
    ignores: ['functions/*', 'app/lib/agents/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../'],
              message: `Relative imports are not allowed. Please use '~/' instead.`,
            },
          ],
        },
      ],
    },
  },
];
