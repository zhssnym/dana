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
  /*
  The boundary between the two halves of the application, enforced rather than
  agreed. CODEOWNERS asks for a review; this fails the build.

  Every one of these three rules describes what the code already does, checked
  file by file before they were written: no client file imports the server or
  the database, no server file imports the client, and nothing in shared/
  imports anything but zod and its own siblings. So nothing here is a fix. It
  is a fence around a property the repository already has, put up while it is
  still free to put up.

  The typescript-eslint version of the rule rather than the core one, because
  the core rule does not see `import type`, and a type import across this
  boundary is the same mistake wearing a hat: it compiles the two halves
  together in the reader's head even when it emits nothing.

  shared/ is the seam and stays importable from both sides. That is its job.
  */
  {
    files: ['src/client/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/server/**', '**/server'],
              message:
                'The client cannot import the server. Everything the browser needs from the API is typed in src/shared/, and every call goes through src/client/api/http.ts.',
            },
            {
              group: ['**/db/**', '**/db/*'],
              message:
                'The client cannot reach the database. The API is the only path to data (spec section 7).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/server/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/client/**', '**/client'],
              message:
                'The server cannot import the client. Anything both sides need belongs in src/shared/.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/shared/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/server/**', '**/client/**', '**/db/**'],
              message:
                'src/shared/ is the contract both sides import, so it must depend on neither. It imports zod and its own siblings, nothing else.',
            },
          ],
        },
      ],
    },
  },
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
