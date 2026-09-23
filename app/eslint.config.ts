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
  agreed: this fails the build.

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
  /*
  One door to the API, enforced rather than described (issue #72).

  `src/client/api/http.ts` is where two of section 7's obligations are met,
  and both are properties of every request rather than of any one call site:
  every view request carries `tz` (7.0), and every mutation echoes the CSRF
  token (11.6's double submit). A `fetch` written anywhere else in the client
  meets neither, and what that looks like from outside is a 403 or a 422 -
  which reads as a backend fault and lands on the backend's desk.

  **The file's own header has claimed for months that nothing else calls
  `fetch`, and it was false the whole time**: `components/folder-cover.tsx`
  carried a second call until #42 removed it. That is the argument for a rule
  rather than a sentence. A comment is the weakest guard this repository has,
  and it has already shipped a bug to a session that believed one.

  Written as a syntax selector rather than `no-restricted-globals` because the
  hazard is the call and not the reference: `window.fetch`, `globalThis.fetch`
  and `self.fetch` are the same act spelled differently, and a member
  expression is invisible to a rule that only knows about bare identifiers.
  `self` is in the list because a service worker is the one place in this
  client where it is the idiomatic spelling, and 10.6 puts a worker here.

  **What it does not catch, said rather than left to be discovered: an alias.**
  `const g = fetch` and then `g(url)` passes, as does any indirection through a
  variable, a property or a callback, because a syntax selector reads the shape
  of the call and not what the identifier resolves to. Catching that needs
  type-aware linting, which is a different rule and a different cost, and it is
  out of scope here on the ground that the fault this exists to stop is
  somebody reaching for `fetch` without thinking about the CSRF header - which
  is written as a plain call every time. An alias is a deliberate act, and a
  deliberate act is what code review is for.
  */
  {
    files: ['src/client/**/*.{ts,tsx}'],
    ignores: ['src/client/api/http.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression > Identifier.callee[name='fetch'], " +
            "CallExpression > MemberExpression.callee[object.name='window'][property.name='fetch'], " +
            "CallExpression > MemberExpression.callee[object.name='globalThis'][property.name='fetch'], " +
            "CallExpression > MemberExpression.callee[object.name='self'][property.name='fetch']",
          message:
            'Only src/client/api/http.ts may call fetch. It is where the CSRF header (11.6) and the tz parameter (7.0) are added, once, for every request; a fetch anywhere else silently skips both and the server answers 403 or 422.',
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
