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
])
