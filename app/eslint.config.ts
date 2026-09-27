import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import type { Linter } from 'eslint'

const SERVER_NO_CLIENT = {
  group: ['**/client/**', '**/client'],
  message:
    'The server cannot import the client. Anything both sides need belongs in src/shared/.',
}

/*
Brick walls for src/server/domain (the approved project model, step 2).

Each domain module belongs to one brick, and a brick imports only its own
modules and the bricks below it. The order, lowest first:

  kernel < activity < access < files < projects < documents < tasks
         < threads < views < flows

Every domain import is a same-directory `./x.js` specifier, so each block is
an allowlist: forbid `./*`, then un-forbid the modules the brick may reach.
A new file not listed below falls into the default block and may import only
the kernel, so the wall fails closed; add the file to its brick.
Any other spelling of a domain path (`../domain/x.js`) is refused, and so
is every server module outside the domain that imports it, for the bricks
below the lowest brick it reaches. src/server/security reaches no domain
module, so it stays open.

**Every block repeats SERVER_NO_CLIENT.** In flat config a later block that
sets the same rule replaces its options for the files it matches, so a block
without it would silently lift the server-to-client wall for those files.
*/
const BRICKS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['kernel', ['fractional-index', 'document-hash', 'document-outline']],
  ['activity', ['events', 'mentions']],
  ['access', ['folder-access', 'responsibility', 'invites', 'connections']],
  ['files', ['files']],
  // Labels are Folder-scoped, and folders.ts seeds them, so they sit here
  // rather than with tasks.
  ['projects', ['folders', 'page-tree', 'project-tabs', 'page-order', 'shelves', 'labels']],
  // The body writer (document-body) and every applier that calls it.
  ['documents', ['document-body', 'pages', 'page-document', 'task-document', 'shelf-document']],
  ['tasks', ['tasks', 'task-order', 'task-dependencies', 'task-dependency-counts']],
  ['threads', ['consultation', 'consultation-hooks', 'consultation-input', 'comments']],
  ['views', ['references', 'backlinks', 'bundle', 'covers', 'place-descriptions']],
  ['flows', ['acts', 'export', 'account-deletion', 'trash']],
]

/* Named exceptions, each with the step that removes it. */
const BRICK_EXCEPTIONS: Readonly<Record<string, readonly string[]>> = {
  // documents -> tasks: a Work page writes Task blocks through createTaskIn.
  // Step 4 left this in place: its registry covers what a body stores, not
  // who writes a Task. Step 6 (Tasks become leaves) rewrites how a body holds
  // Tasks, and that change inverts this call or keeps it named here.
  pages: ['./tasks.js'],
  'page-document': ['./tasks.js'],
  // tasks -> views: the hand order is the Folder page's own list query, and
  // moving it would split that order from its view. Step 5 revisits it.
  'task-order': ['../views/lists.js'],
}

function brickWall(
  files: string[],
  allowed: readonly string[],
  belowViews: boolean,
  belowDocuments: boolean,
  extra: readonly string[] = [],
): Linter.Config {
  return {
    files,
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            SERVER_NO_CLIENT,
            {
              group: [
                './*',
                ...allowed.map((m) => `!./${m}.js`),
                ...extra.filter((s) => s.startsWith('./')).map((s) => `!${s}`),
              ],
              message:
                'Brick wall: a domain module imports only its own brick and the bricks below it (see BRICKS in eslint.config.ts). Move the code down, or list a new file in its brick.',
            },
            {
              // The allowlist above sees only `./x.js`, so any spelling that
              // leaves the directory and climbs back in (`../domain/x.js`,
              // `../../server/domain/x.js`) is refused outright.
              group: ['**/domain', '**/domain/**', '../domain/*'],
              message:
                'Brick wall: import a sibling domain module as `./x.js`, never by a path that climbs back into src/server/domain.',
            },
            {
              group: [
                '../routes/*',
                '../scheduler/*',
                '../auth/*',
                '../sample/*',
                '!../sample/people.js',
                '../index.js',
                // time/generation.js copies a Task document (documents brick)
                // and time/index.js re-exports it, so both sit above every
                // brick below documents. The pure calendar helpers stay open.
                ...(belowDocuments ? ['../time/generation.js', '../time/index.js'] : []),
                ...(belowViews ? ['../views/*'] : []),
                ...extra.filter((s) => s.startsWith('../')).map((s) => `!${s}`),
              ],
              message:
                'Brick wall: the domain sits below routes, the scheduler, auth, the sample workspace, the server entry, (below the documents brick) time/generation and time/index, and (below the views brick) views. Those import the domain, never the reverse.',
            },
          ],
        },
      ],
    },
  }
}

function brickWalls(): Linter.Config[] {
  const kernel = BRICKS.find(([name]) => name === 'kernel')?.[1] ?? []
  const out: Linter.Config[] = [brickWall(['src/server/domain/**/*.ts'], kernel, true, true)]
  const viewsRank = BRICKS.findIndex(([name]) => name === 'views')
  const documentsRank = BRICKS.findIndex(([name]) => name === 'documents')
  BRICKS.forEach(([, modules], rank) => {
    const allowed = BRICKS.slice(0, rank + 1).flatMap(([, m]) => m)
    const belowViews = rank < viewsRank
    const belowDocuments = rank < documentsRank
    const plain = modules.filter((m) => !(m in BRICK_EXCEPTIONS))
    if (plain.length > 0) {
      out.push(brickWall(plain.map((m) => `src/server/domain/${m}.ts`), allowed, belowViews, belowDocuments))
    }
    for (const m of modules.filter((m) => m in BRICK_EXCEPTIONS)) {
      out.push(brickWall([`src/server/domain/${m}.ts`], allowed, belowViews, belowDocuments, BRICK_EXCEPTIONS[m]))
    }
  })
  return out
}

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
        { patterns: [SERVER_NO_CLIENT] },
      ],
    },
  },
  ...brickWalls(),
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
