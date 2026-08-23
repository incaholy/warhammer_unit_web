import js from '@eslint/js'
import globals from 'globals'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      // Accessibility as a lint rule, not a convention (ROADMAP F7). The code
      // already complies -- correct roles, ARIA state, a focus trap, live regions
      // -- so this costs no refactor and keeps that true for the next component.
      // A linter is a floor, not a ceiling: it catches missing semantics, never a
      // bad focus order or an unusable flow.
      jsxA11y.flatConfigs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Calibration, not suppression. `Input` is this repo's control primitive, so
      // a <label> wrapping one *is* associated; the plugin cannot see through a
      // custom component. And a labelled scrollable area is a `region`, which is
      // a legitimate place for tabIndex={0} (a keyboard user must be able to
      // reach and scroll it -- WCAG 2.1.1).
      'jsx-a11y/label-has-associated-control': ['error', { controlComponents: ['Input'] }],
      'jsx-a11y/no-noninteractive-tabindex': [
        'error',
        { tags: [], roles: ['tabpanel', 'region'], allowExpressionValues: true },
      ],
    },
  },

  // ---- Layering, enforced (ROADMAP F3) ----
  // SPEC.md and ARCHITECTURE.md state these rules in prose, and prose does not
  // fail a build. Every rule below is true of the code today, which is exactly
  // when enforcement is cheap: it costs one config change and no refactoring.
  // Wait until there are violations and the rule has quietly stopped being true.

  // One HTTP call site. Everything else goes through a resource function.
  // Caveat worth knowing: this catches the bare `fetch` identifier, not
  // `window.fetch` or `globalThis.fetch` -- a determined violation can still get
  // through, so this raises the floor rather than sealing the door.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/api/client.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            'Only src/api/client.ts calls fetch. Add a resource function in src/api/ and a hook in queries.ts.',
        },
      ],
    },
  },

  // Views and UI dispatch intent; they do not fetch and they do not hold the
  // token. `ApiError` and types are not data access, so they stay allowed.
  // Tests are exempt: they legitimately reach for `tokenStore` to set up a session.
  {
    files: ['src/views/**/*.{ts,tsx}', 'src/ui/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/api/client'],
              importNames: [
                'apiGet',
                'apiPost',
                'apiPostForm',
                'apiPatch',
                'apiDelete',
                'tokenStore',
              ],
              message:
                'Views and UI go through a query hook (src/api/queries.ts), never the HTTP client directly. Importing ApiError or a type is fine.',
            },
            {
              group: [
                '**/api/armies',
                '**/api/units',
                '**/api/factions',
                '**/api/inventory',
                '**/api/auth',
              ],
              message:
                'Views and UI use a hook from src/api/queries.ts, not a resource module directly -- otherwise the call escapes the cache and its invalidation.',
            },
            {
              group: ['@tanstack/react-query'],
              message:
                'No inline useQuery/useMutation in a component: server state lives in src/api/queries.ts so its key comes from the factory and its invalidation is declared in one place.',
            },
          ],
        },
      ],
    },
  },

  // A lower layer may not import a higher one. This is the direction the backend's
  // import-linter contract enforces (app.api > app.core.services > app.core.db);
  // the concept transfers exactly even though the tool differs.
  {
    files: ['src/api/**/*.{ts,tsx}', 'src/lib/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/views/**', '**/ui/**', '**/auth/**'],
              message:
                'The data and helper layers must not depend on the view layer. Dependencies point one way: views -> hooks -> resources -> client.',
            },
          ],
        },
      ],
    },
  },
])
