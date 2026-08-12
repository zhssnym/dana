import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // Playwright writes generated bundles into its html report, and eslint .
  // would otherwise lint them as if someone here had written them.
  {
    ignores: [
      'dist/**',
      '.data/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // An underscore prefix marks a parameter a signature requires but the
      // body does not, like the four-argument Express error handler.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
)
