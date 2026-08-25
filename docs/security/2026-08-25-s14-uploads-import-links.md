# S14 security review: uploads, import and links

- **Date:** 2026-08-25
- **Reviewer:** persona `06-security-and-privacy.md`, the first of S14's three
  owners. Not the gate, not release 2.0.0, not the release verdict lines;
  those are the Integration Steward's and Imran's halves.
- **Tree reviewed:** `v2-build` at `48183c8`, in a worktree branched from it.
  S11 was live on `s11-surfaces` and unmerged, so nothing this file says
  describes S11's client work.
- **Location of this file:** proposed, not ratified. See "Where this record
  lives" at the end.

## Why this file exists

Protocol section 2 names five state sources and SESSION-LOG is deliberately
not one of them, so a review recorded only in the log does not stop the next
session redoing it from scratch. A verdict of "I looked and it was fine" is
worth nothing the day after it is written, because the next reader cannot tell
what was looked at. So this file records **what was examined**, **against
which clause**, and **on what date**, including and especially the surfaces
that were clean, because clean is the expensive result to reproduce and the
one most likely to be redone.

Findings that must not regress are owed acceptance criteria. Grepping
`app/tests/` for `AC-` is a named state source, so a criterion is the
strongest anti-redo record available. This file proposes them; it does not
author them. Protocol section 8 puts acceptance tests with
`11-adversarial-test.md` exclusively.

## Method, and what was deliberately not done

**The test suite was not run.** S11 was mid-gate on this machine with a vitest
leg in flight and commit charge at about 81% of 33.9 GB against a recorded
failure threshold near 90%, above which `npm test` dies at collection with
"Fatal process out of memory: Zone" and reads as broken code. A second suite
would also have risked taking S11's leg down. The review is therefore reading,
grepping and mechanical sweeps over the source, plus inspection of an existing
compiled artifact. Where a question could only be settled by execution it is
marked as such rather than guessed.

`npm ci` was not run either: nothing here needed it.

Three mechanical sweeps were used and are reproducible:

1. **Route sweep.** For every `router.get|post|patch|put|delete(` in
   `app/src/server/routes/*.ts` and `app/src/server/auth/router.ts`, check
   whether `requireSession`, `requireCsrf` and a rate limiter appear in the
   handler chain.
2. **SQL sweep.** Extract every `` sql`...` `` template in
   `app/src/server/**` and flag any statement touching `tasks`, `folders`,
   `comments`, `page_blocks`, `shelves`, `steps`, `my_day_entries` or `files`
   that carries no viewer predicate. 65 were flagged; each was then read in
   context.
3. **Build inspection.** Grep the compiled `dist/` in the main checkout
   (built 2026-08-25 01:58) for the development-login module.

## Surfaces examined and found clean

Each row is a surface, the clause it was checked against, and what was
actually verified. Date on all rows: 2026-08-25, tree `48183c8`.

### The 10.2 chokepoint

| Surface | Clause | What was verified |
| - | - | - |
| Every route in `app/src/server/routes/*.ts` and `auth/router.ts` | 10.1 | The route sweep found **exactly three routes without `requireSession`**, and all three are the unauthenticated doors by design: `GET /auth/google`, `GET /auth/google/callback`, `POST /auth/dev-login`. No data route is reachable without a session |
| Every mutating route | 11.6 | The same sweep found **exactly one mutation without `requireCsrf`**, `POST /auth/dev-login`, which precedes any session and is absent from production builds. Every other POST, PATCH, PUT and DELETE carries it |
| Every mutating route | 10.4 | The same sweep found **exactly one mutation without a rate limiter**, the same dev-login route |
| `accessOf`, [folders.ts:52](app/src/server/domain/folders.ts:52) | 10.2 | Joins `folder_members` on the viewer and filters `deleted_at IS NULL`; returns `null` for nonexistent and inaccessible alike, which is the 404-not-403 answer at its source |
| The 65 statements the SQL sweep flagged | 10.2 | Every one is a second-stage statement inside a transaction whose first statement was a scoped resolver (`accessOf`, `accessibleTask`, `shelfView`) or is itself scoped by a column the sweep's regex missed. Spot-verified in full for `shelfView` ([shelves.ts:52](app/src/server/domain/shelves.ts:52), `AND user_id = viewer`), `patchShelf` ([shelves.ts:107](app/src/server/domain/shelves.ts:107), `FOR UPDATE` on a viewer-scoped row), `restoreTask` and `restoreFolder` ([trash.ts:88](app/src/server/domain/trash.ts:88), both joining `folder_members` before the unscoped UPDATE), and the page and shelf page routes ([workshop.ts:99](app/src/server/routes/workshop.ts:99) onward, each resolving access before delegating). **The pattern is two-stage and it holds; a future statement that skips stage one would not be visible to this sweep, which is an argument for the structural criterion proposed below** |
| Card reads | 10.2 | `readCards` joins `folder_members` ([cards.ts:161](app/src/server/views/cards.ts:161)); search runs through it |
| SQL construction, whole server | 10.2 | `sql.raw` appears **once** in `app/src/server/**`, at [sessions.ts:38](app/src/server/auth/sessions.ts:38), interpolating the module constant `30`. Every other statement binds through drizzle's `sql` template. No injection surface found |
| `searchPattern` [search.ts:57](app/src/server/views/search.ts:57) | 10.3 | Escapes `\`, `%` and `_` before the value is bound, so a query cannot smuggle LIKE wildcards |

### Uploads (7.15, 10.3, 10.2)

| Surface | Clause | What was verified |
| - | - | - |
| `POST /files` [files.ts:170](app/src/server/routes/files.ts:170) | 10.2 | Scope is resolved before shape: `createFile` calls `accessOf` and answers `folder_not_found` before judging the body, so a folder the viewer cannot read answers 404 without revealing whether the body was acceptable |
| Quota | 10.3 (D5) | 1 GB per owner, checked inside the transaction behind `SELECT 1 FROM users WHERE id = viewer FOR UPDATE`, so two uploads racing the last megabyte serialize ([files.ts:139](app/src/server/domain/files.ts:139)). Answers 413 with section 9's copy, which is the one limit 10.3 does not make a 422 |
| Downscale | 7.15 | Images pass through sharp once, `resize({fit:'inside', withoutEnlargement:true})` to 2048px longest edge, and `toBuffer()` **re-encodes**. Re-encoding is what defeats a polyglot: a GIF-then-HTML file cannot survive the round trip with its HTML tail |
| Image kind allowlist | 4.16 | `RASTER_MIMES` is an exact-match set of png, jpeg, webp, gif, avif ([files.ts:52](app/src/server/domain/files.ts:52)). `image/svg+xml` is refused, which is the load-bearing line: SVG decodes like an image and serves like a scriptable document on Dana's own origin |
| Decompression bomb | not specified | sharp's default `limitInputPixels` (about 0.268 gigapixels) throws on a pixel-flood image, `downscaled()` catches it and returns `null`, and the route answers 422 `not_an_image`. **This protection is a library default, not a written decision.** Setting `limitInputPixels: false` would reopen it silently |
| Authenticated serving | 7.15, 10.2 | `GET /files/:id` is behind `requireSession`; `serveFile` requires membership of the file's folder, and answers `null` (404) for nonexistent, inaccessible and trashed-folder alike ([files.ts:180](app/src/server/domain/files.ts:180)) |
| No public URL | 7.15 | The object store writes to `DANA_FILES_DIR` or a directory under the OS temp path ([index.ts](app/src/server/index.ts)); `express.static` serves only `dist/client`. No route serves the store directory, and the client reaches bytes only through `/api/v1/files/:id` with `credentials: 'same-origin'` ([http.ts:124](app/src/client/api/http.ts:124)). The two `<img src>` sites, [BlocksEditor.tsx:313](app/src/client/components/page/BlocksEditor.tsx:313) and [IdentityHead.tsx:91](app/src/client/components/page/IdentityHead.tsx:91), are same-origin API paths that carry the session cookie |
| Stored-XSS on serving | S4 review's condition | `X-Content-Type-Options: nosniff` on every served file, and `Content-Disposition: attachment` for kind `file`, `inline` for the rest. This is sound but it rests on **one predicate**, `inline = served.kind !== 'file'` ([files.ts:227](app/src/server/routes/files.ts:227)), because kind `file` is the only kind whose mime is unconstrained (`mimeMatchesKind` returns `true` for it). The image kinds are re-encoded raster only and `voice` must be `audio/*`, neither of which renders as a document |
| Filename in the header | S4 review's condition | Control characters (`<32`, `127`) and `"` are stripped, so CRLF header injection and quoted-string escape are both closed. Backslash is not stripped; a trailing `\` produces a malformed but unexploitable quoted-string, since nothing follows it on the line. Recorded as cosmetic, not routed |
| Object key safety | 4.16 | The key is the database-minted uuid, never caller input, and `createDiskStore` additionally applies `path.basename` ([store.ts:36](app/src/server/files/store.ts:36)) |
| File row mutability | 4.16 | `files` rows are **inserted and deleted only**; there is no `UPDATE files` anywhere in the server. A file's `folder_id` and `kind` are therefore immutable, so an upload cannot later be widened out of its folder |
| Cover reference | 4.3 | `patchFolderProfile` requires the named cover to be a file of kind `cover` or `image` **in that same folder** ([folders.ts:248](app/src/server/domain/folders.ts:248)), so a cover reference cannot smuggle a read |
| Deletion | 7.15 | Uploader or folder owner deletes; everyone else meets not-found, so ownership is invisible to those without it |

### Import (7.16, 10.3)

| Surface | Clause | What was verified |
| - | - | - |
| `importWorkflowBody` [workflows.ts](app/src/shared/workflows.ts) | 7.16 | Refusal is the schema's shape rather than a scrubbing pass: zod strips every key the objects do not name, so ids, members, statuses and dates are not rejected so much as never read. Caps: 50 folders as the array's `.max`, 500 blocks across folders in a `superRefine` |
| `importWorkflow` [acts.ts:259](app/src/server/domain/acts.ts:259) | 7.16 | Every row is created for the importer: `owner_id`, `assignee_id` and `created_by` are all the viewer, membership is inserted for the viewer alone, tasks land pending and undated. The 200-custom-folder cap of 10.3 is enforced inside the transaction behind `FOR UPDATE` on the user row |
| Import is behind the full chain | 10.1, 11.6, 10.4 | `requireSession`, `requireCsrf`, `mutationLimit` ([workshop.ts:370](app/src/server/routes/workshop.ts:370)) |

Two caps do **not** behave as 10.3 states them; see findings F-5 and F-6.

### Links and redirects (11.6)

| Surface | Clause | What was verified |
| - | - | - |
| Every `res.redirect` in the server | 11.6 | There are **exactly three**, and none takes a target from the request: `/?signin=failed` (module constant, [pages.ts:173](app/src/server/auth/pages.ts:173)), the issuer's authorization URL built from configuration, and `/app`. No `Location` header is set anywhere else |
| `callbackUrl` [oidc.ts:78](app/src/server/auth/oidc.ts:78) | 11.6, AC-109 | A pure function of `appOrigin`. A crafted `Host` or `X-Forwarded-Host` moves nothing, and the same value is used for the authorization request and the token exchange |
| The callback's URL rebuild | 11.6 | `currentUrl` is built from `callbackUrl(config)` and only the **search string** is copied from `req.originalUrl` ([router.ts:239](app/src/server/auth/router.ts:239)). Host and path cannot be influenced |
| `tz` | 7.1, 11.6 | Validated through the shared IANA validator and stored on the in-memory pending record; it never rides `redirect_uri` and never composes into a redirect target |
| Client hrefs | 9.1 | Every `href` in `app/src/client` is an internal path builder or `signInHref`, itself `/api/v1/auth/google?tz=` with the zone `encodeURIComponent`d ([LandingPage.tsx:738](app/src/client/pages/LandingPage.tsx:738)). No user-authored URL is rendered as a link anywhere |
| HTML injection | 9.x | **No `dangerouslySetInnerHTML` and no `innerHTML` anywhere in `app/src/client`.** The one server-rendered page escapes all three of its interpolations ([pages.ts:144](app/src/server/auth/pages.ts:144)) and its values are section 9 constants, so no address or user content reaches it |

### The dev-login exclusion (11.6, 11.15)

This is a build-time mechanism and never a runtime guard, and 11.15 records
why: tsc emits a tsconfig-excluded file whenever any resolvable import
references it, literal dynamic `import()` included. All four conditions were
verified, the last against a real artifact rather than by reasoning:

1. `tsconfig.build.json` excludes `src/server/auth/dev-login*`.
2. The loader uses a computed specifier, `['./dev','login.js'].join('-')`
   ([router.ts:107](app/src/server/auth/router.ts:107)), so no resolvable
   import names the module.
3. The loader treats a failed load as the route not existing and answers 404.
4. **The compiled artifact genuinely lacks it.** `app/dist/`, built
   2026-08-25 01:58 from this tree, contains no
   `dist/src/server/auth/dev-login.js`; the only surviving references in
   `dist/src/server/auth/router.js` are the assembled specifier, the
   environment-variable read and the route registration, all of which resolve
   to a 404 without the module. `dist/src/server/views/explain.js` is absent on
   the same terms, and no `*.test.js` shipped.

AC-114 already asserts this structurally by compiling the build inside the
test and interrogating the output, which is the strongest form available and
should not be weakened.

### The logging boundary (10.5)

| Surface | Clause | What was verified |
| - | - | - |
| `createSecurityLogger` [log.ts](app/src/server/security/log.ts) | 10.5 | Every method takes a closed field set and emits a whitelist. Task titles, notes, step titles, invite addresses, tokens and session identifiers have **no parameter through which they can reach a line**. Free-text values that do exist (`reason`, `template`, `missing`) are regex-clamped to identifier shapes or replaced with `'other'` |
| `safeStack` | 10.5 | Error **messages** are dropped, keeping only the class name and code frames, because a driver's message can carry its full SQL and bound values |
| Log emission outside the policy module | 10.5 | Three sites: [notify/index.ts:119](app/src/server/notify/index.ts:119) and [notify/resend.ts:101,120](app/src/server/notify/resend.ts:101). All three emit only `template`, `configured` or `missing`, and the logger they receive from `createApp` is a wrapper that forwards exactly those three keys into `securityLog.operation`. No recipient address crosses |
| `requestError` path field | 10.5 | Logs the **route pattern** (`req.baseUrl + req.route.path`, or the literal `'unmatched'`), never the URL ([request-errors.ts:14](app/src/server/observability/request-errors.ts:14)), so no id and no query string, and a search query cannot reach a log line |
| Sentry seam | 10.5, 11.12 | `sendDefaultPii: false`, `maxBreadcrumbs: 0`, `defaultIntegrations: false`, and `beforeSend` deletes `request`, `user`, `contexts`, `extra` and `breadcrumbs`. `sanitizedError` sends a new Error whose message is a constant; only the class name and stack frames survive ([error-tracker.ts](app/src/server/observability/error-tracker.ts)) |
| Axiom mirror | 11.12 | Receives the same pino records the policy module produced; no separate emission path |

### The auth module (10.1, 11.6), re-verified in passing

Not S14's clause, but it is this persona's own boundary and the review read it
whole, so the result is recorded rather than left implicit. All clean:

- State, nonce and PKCE S256 on every authorization request, all three
  validated single-use at the callback through `authorizationCodeGrant`'s
  `expectedState`, `expectedNonce` and `pkceCodeVerifier`.
- The pending record is bound to one browser through an httpOnly cookie and is
  `take()`n, so a replay finds nothing; `sweep()` on every create and take
  bounds the map against an endpoint anyone can call.
- `enableNonRepudiationChecks` is passed to discovery, which is what makes the
  ID token's signature actually verified: openid-client 6 does not do it by
  default in the code flow. The reasoning is recorded in
  [oidc.ts](app/src/server/auth/oidc.ts) and is worth not undoing.
- Session identifiers are 32 CSPRNG bytes; only the sha256 digest is stored
  (10.1), so a stolen backup grants no sessions. The CSRF token is
  `HMAC(sessionToken, 'dana.csrf.v1')`, one-way, so the readable cookie cannot
  be turned back into the httpOnly one.
- `requireCsrf` compares against **what this session's token implies**, not
  against the cookie the same request carried, which is what makes double
  submit resistant to an attacker who can set cookies.
- 401 precedes 403 (`requireSession` before `requireCsrf`), so a caller with
  no session is never told that a CSRF token was all they lacked.
- `resolveSession` rolls expiry and tests it **in one UPDATE's WHERE clause**,
  which makes the renew-then-check ordering bug unexpressible rather than
  merely avoided, and refuses a scrubbed user's rows independently of
  revocation having run.
- `Secure` is unconditional on all three cookies, never derived from the
  request's transport.
- `clearSessionCookies` drops queued `Set-Cookie` lines first, so a logout
  response cannot also hand back a fresh 30-day cookie.
- No Google access, refresh or ID token is persisted: the tokens are locals
  inside the callback.
- Every callback refusal path answers a browser, and every one of them is a
  refusal rather than a 5xx, because all of them are attacker-reachable input.

## Findings

Severity is this reviewer's judgement. None of these is a remote-code or
account-takeover class finding; the two that matter most are privacy and
retention.

### F-1. Account deletion does not destroy the account's files, and its avatar stays readable

**Severity: moderate. Privacy. Route to the Integration Steward.**

`deleteAccountData` ([accountDeletion.ts](app/src/server/domain/accountDeletion.ts))
runs 8.10's steps 1 to 6 and touches `invites`, `folders`, `folder_members`,
`connections` and `my_day_entries`. It never touches `files`. `handleDeleteMe`
([account.ts](app/src/server/auth/account.ts)) then scrubs the users row and
destroys every session.

Nothing cleans up the person's uploads, and three facts combine so that this is
not merely untidy:

1. `files_owner_id_fkey` is `ON DELETE RESTRICT`
   ([0003_v2_expand.sql:66](app/db/migrations/0003_v2_expand.sql:66)), and 8.10
   **scrubs** the users row rather than deleting it, so no cascade fires.
2. The avatar row carries `folder_id IS NULL`, and `serveFile` grants read on
   any `folder_id IS NULL` file to **any signed-in account** ("a file with no
   folder is readable by any signed-in account, profile pictures being what
   member lists render").
3. The id was published: `users.avatar_url` is `/api/v1/files/<id>` and is
   returned in `/me` and rendered in rosters, so every person who ever shared a
   folder with the deleted account holds the id already.

So after "delete my account", the person's profile photograph is still served
at its old URL to anyone who saw it before, and every file they uploaded stays
in the object store indefinitely. 8.10's promise is that deletion empties the
personal data; this is a hole in that promise that section 8.10 did not
anticipate because `files` (4.16) arrived with RFC 0005, after it.

**Recommendation.** Add a step to 8.10's transaction that deletes the user's
`files` rows and removes their objects from the store, and amend 8.10 to name
it. The module is `03-collaboration-and-permissions.md`'s, the object store is
`10-platform.md`'s, and the 8.10 amendment is a spec change, so all three legs
go through the Steward. This reviewer did not edit across the line.

Note for whoever implements it: the object removals must sit outside the
transaction's commit path in the same shape `deleteFile` already uses (remove
bytes only after the rows commit), and a folder transferred away at step 2
keeps its files, which is correct.

### F-2. Hard-deleting a folder orphans its bytes forever

**Severity: moderate. Retention and unbounded storage growth. Route to the Integration Steward.**

`files_folder_id_fkey` is `ON DELETE CASCADE`
([0003_v2_expand.sql:67](app/db/migrations/0003_v2_expand.sql:67)). Two paths
hard-delete a folder row: the 30-day Trash purge
([pass.ts:329](app/src/server/scheduler/pass.ts:329)) and the sole-owner delete
inside account deletion ([folders.ts:370](app/src/server/domain/folders.ts:370)).
Both drop the `files` rows by cascade, and **neither calls `store.remove`**.

Consequences, in order of how much they matter:

- A person empties their Trash expectations: the folder is gone, its rows are
  gone, and the photographs and voice notes that were in it are still on the
  disk, with nothing left that knows they exist.
- The store grows without bound on a paid persistent disk, and nothing will
  ever reclaim it, because the rows that named the objects are the only index.
- Quota is released correctly, so this does not show up as a user-visible
  fault. It is invisible until the disk fills.

This is not an access finding: `serveFile` reads the row first, so the orphans
are unreachable through the API.

**Recommendation.** Collect the file ids before each hard delete and remove
their objects after the delete commits, in both paths. The purge is
`10-platform.md`'s (11.7) and the account-deletion path is
`03-collaboration-and-permissions.md`'s. A sweeper that reconciles the store
against the table is the alternative and is worse, because it needs a second
authority. Route through the Steward.

### F-3. The boot guard accepts a door that a production build does not have

**Severity: low, and it fails closed. Correctness defect in a guard. Route to the Integration Steward.**

`assertSignInIsPossible()` ([index.ts](app/src/server/index.ts)) returns early
when `DANA_DEV_LOGIN === '1'`, on the reasoning that sign-in has two doors and
one of them is enough. But 11.6 makes the development login **absent from the
compiled output**, and F-4's verification above confirms it genuinely is. So a
production deploy carrying only `DANA_DEV_LOGIN=1` and none of the Google trio:

- passes the guard,
- boots and answers `/api/health` with 200, so the host promotes it,
- 404s on `POST /auth/dev-login`, because the computed import fails,
- and 500s on `GET /auth/google`, because `authConfigFromEnvironment` throws.

That is exactly the failure the guard's own comment says it exists to prevent:
"a deploy carrying a typo in an environment variable went green and only the
first person to try signing in found out." The guard is correct in development
and wrong in the one environment it was written for.

**Recommendation.** Make the guard's dev-login branch conditional on the module
actually being loadable, or simply require the Google trio whenever
`NODE_ENV === 'production'`. `app/src/server/index.ts` is `10-platform.md`'s
path, so this is a routed request, not an edit.

### F-4. No response security headers anywhere

**Severity: low as things stand, but it is defence the application has none of. This is a spec gap, not a deviation. Route to the Integration Steward under protocol section 6, "the spec is silent on something you need".**

`app.disable('x-powered-by')` is the entirety of the server's response-header
posture. There is no Content-Security-Policy, no `frame-ancestors` or
X-Frame-Options, no Referrer-Policy, and no HSTS; `helmet` is not a dependency.
Section 10 names no response header, so nothing is being violated.

What makes this low rather than high, verified rather than assumed:

- The client has no `dangerouslySetInnerHTML` and no `innerHTML` at all, and
  React escapes by default, so there is no known injection for a CSP to
  backstop.
- Session cookies are `SameSite=Lax`, so a cross-site iframe of `/app` is not
  sent the session and renders signed out. Clickjacking has little to steal.
- Uploaded bytes already carry `nosniff` and, for the one unconstrained kind,
  `Content-Disposition: attachment`.

What it costs to have none: the upload serving path's safety rests on a single
predicate (recorded above), and a CSP is exactly the second line that makes one
predicate's failure survivable.

**Recommendation.** Adopt `frame-ancestors 'none'`, a `default-src 'self'`
CSP sized to the client's actual needs, `Referrer-Policy:
strict-origin-when-cross-origin`, and HSTS at the edge. Because section 10 is
silent, adopting them means **a sentence in 10.x first** and then a criterion,
or a recorded decision not to. Either outcome is fine; the unrecorded silence
is not.

### F-5. 10.3's 500-block import cap is unreachable, and over-size answers 400 rather than 422

**Severity: low, and it fails closed more strictly than specified. Contract-versus-behaviour divergence. Route to the Integration Steward, thence `04-api-and-contract.md`.**

`express.json()` is mounted with no `limit` ([index.ts](app/src/server/index.ts)),
so the default 100 kB applies to every request body. A workflow file at 10.3's
stated ceiling is 500 blocks of up to 4000 characters, which is up to about
2 MB. Such a file never reaches `importWorkflowBody`: the body parser refuses
it, and `createRequestErrorHandler` maps `entity.too.large` to **400
"Malformed request body."**, not the "422 with the field named" that 10.3 fixes
for every limit but the storage quota.

AC-201 does not catch this because its over-caps case is 51 empty folders,
which is a few hundred bytes and passes the parser, reaching the schema and
earning its 422 honestly.

Protocol section 1: a deviation that is not recorded in the specification is a
defect even when the code works. This one works in the safe direction, which is
why it needs recording rather than repair in a hurry.

**Recommendation.** Either raise `express.json({ limit })` above the largest
legal workflow file so 10.3's cap is the thing that actually refuses, or amend
10.3 to state the body limit and the 400 as the real contract. This reviewer
prefers the first, because a cap stated in the limits table that no request can
reach is a cap that reads as enforced and is not.

### F-6. The import's task array is uncapped

**Severity: low. Same routing as F-5.**

`importFolder.tasks` ([workflows.ts](app/src/shared/workflows.ts)) carries no
`.max()`, and 10.3's import row caps folders and blocks and says nothing about
tasks. What actually bounds a hostile file is again the undocumented 100 kB
body limit, roughly six thousand minimal titles, each becoming an INSERT inside
one transaction.

This is bounded and not presently dangerous. It is recorded because the bound
is accidental: it lives in a parser default that F-5 may well raise, and
raising it would silently widen this at the same time.

**Recommendation.** State a task cap in 10.3's import row and add `.max()` to
the schema, and decide it together with F-5 rather than separately.

### F-7. The upload path buffers the whole body before it judges the quota

**Severity: low. Observation with a recommendation; no defect claimed.**

`multer.memoryStorage()` with `limits: { fileSize: 25 MB, files: 1 }` buffers
the payload in the process, and the 1 GB quota is checked only afterwards, as
is sharp's decode. The only thing bounding the rate is the shared
`generalMutations` limiter at 120 per minute, which **does** run before multer
(the handler chain is `requireSession, requireCsrf, mutationLimit, parsed(...)`,
verified by reading the route), so a rate-limited request is refused before any
buffering. Worst case is therefore 120 attempts of up to 25 MB per minute per
account, on the single instance 11.1 fixes, all of them refused at 413 if the
account is already at quota.

**Recommendation.** Give uploads their own limiter, tighter than the general
mutation quota. The limiter module `app/src/server/security/rate-limit.ts` is
this persona's and the addition is small; the route it must be applied at is
`10-platform.md`'s, so the wiring is a routed request. Also worth writing down,
next to the sharp call: the decompression-bomb protection is
`limitInputPixels`' library default, and a future `limitInputPixels: false`
would remove it with nothing to notice.

## Proposed acceptance criteria

**This reviewer did not author these and must not.** Protocol section 8 gives
acceptance tests to `11-adversarial-test.md` exclusively. What follows is the
proposal, with the property each is meant to pin, offered to that persona
through the Steward.

**Numbering starts at AC-230, not AC-228.** The highest criterion in
`docs/spec/12-acceptance-criteria.md`, in RFC 0005 and in `app/tests/` at
`48183c8` is AC-227, and S11 holds AC-228 and AC-229 on an unmerged branch.
Confirm against the merged tree before assigning.

| Proposed | Property it pins | Why it must not regress |
| - | - | - |
| AC-230 | `GET /api/v1/files/:id` with no session answers 401, not 200 | AC-195 tests member against outsider and both are signed in, so a regression that dropped `requireSession` from the files router would pass every criterion in the suite while serving every upload to the internet |
| AC-231 | An upload declaring `kind: image` with `image/svg+xml` is refused 422, and so is a raster file whose bytes are a polyglot with an HTML tail, which is stored re-encoded | The `RASTER_MIMES` allowlist and sharp's re-encode are the whole defence against a scriptable document on Dana's own origin. AC-194 only exercises `application/pdf`, which is not the attack |
| AC-232 | A served kind `file` carries `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`; a served image carries `nosniff` and `inline` | The single predicate `inline = served.kind !== 'file'` is what keeps an unconstrained mime from rendering. Nothing asserts it today |
| AC-233 | Uploading past the 1 GB quota answers 413 with section 9's copy, and the refused bytes create no row | The quota's refusal path is untested; a regression in the `FOR UPDATE` ordering would show up as a silent overrun |
| AC-234 | After `DELETE /me`, the deleted account's avatar id answers 404 to a signed-in account that previously held it, and the account's files rows are gone | Pins F-1 once fixed. This is the criterion that stops the fix regressing, and it is the one this review most wants to exist |
| AC-235 | After a folder is purged from Trash, its objects are absent from the store | Pins F-2 once fixed. Requires a store seam the test can inspect, which `AppOptions.fileStore` already provides |
| AC-236 | Structural: every mutating route on the mounted application answers 403 without an `X-CSRF-Token`, and 401 with no session, enumerated over the router rather than sampled | The route sweep in this file is a one-day result that decays the moment a router is added. AC-114's precedent shows a structural criterion is acceptable and is far stronger than a sampled one. This is the single criterion that would make this whole review unnecessary to repeat |
| AC-237 | A workflow file at 10.3's stated block ceiling either imports or is refused 422 naming the field, matching whichever way F-5 is resolved | Pins the resolution of F-5 so the limits table and the behaviour cannot drift apart again |

AC-236 is the one worth arguing for hardest. Everything else in this file is a
snapshot; AC-236 is the part that keeps being true.

## Findings this review did not close, and whose they are

| Item | Disposition |
| - | - |
| **`GOOGLE_CLIENT_SECRET` committed at `bf90c0a` and still in history.** Correction to the briefing, verified at `48183c8`: `app/.env` is **already untracked on `v2-build`**, by commit `b9b2cfa`, "fix: untrack app/.env and restore the .env ignore rules on v2-build", which is an ancestor of the head. `git ls-files` at this tree matches only `app/.env.example`. PR #9 (`claude/untrack-app-env`) does the same thing on its own branch and its open state no longer gates anything on `v2-build`. **Untracking is not rotation and the secret remains reachable in history at `bf90c0a`.** Rotation is Imran's and was not attempted | Imran. Not closed |
| Two frozen section 7 widenings owed to Imran: `created_by` on TaskCard, and `section_block_id` on the folder read | Imran. Not security items, recorded here only so this file is not read as their absence |
| F-1, F-2, F-3, F-5, F-6, and the F-7 recommendation | Integration Steward, with the routing named in each finding. None was edited across the boundary |
| F-4 | Integration Steward as a specification gap, per protocol section 6 |
| The eight proposed criteria | `11-adversarial-test.md`, through the Steward |

## Where this record lives

**This is an escalation, not this reviewer's call**, and the file's own path is
part of what is being escalated: no persona owns a security-review-record path,
and `docs/rfcs/` is the Steward's.

The recommendation, and the reason for it:

- Keep this file at `docs/security/<date>-<subject>.md`, dated in its name so a
  second review appends rather than overwrites.
- **Point at it from RFC 0004's S14 row**, because the active RFC's
  implementation plan is one of the five state sources protocol section 2
  names. A pointer from there makes the record reachable by the rule rather
  than by luck, which is the whole difference between a record and a file
  nobody finds.
- The SESSION-LOG row is written as well, but it is explicitly not relied on:
  section 2 leaves SESSION-LOG out of the five deliberately, and a record that
  lives only there does not stop a redo.

The Steward may prefer a different path. What this review asks is that whatever
path is chosen is pointed at from a state source, because a security record
that is only findable by knowing it exists has the same value as no record.
