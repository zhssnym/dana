# Security

This file gives the security rules that the code cannot show quickly. The code holds the
detail. If this file and the code disagree, the code is correct, and you must correct this
file.

## Sign-in

- Dana signs people in with Google OpenID Connect only.
- Dana asks for the scopes `openid email profile` and no others. These three scopes are
  non-sensitive, so Google's Limited Use rules and security assessment stay out of scope.
- A fourth scope is a product decision. It changes what Google requires from Dana.
- Each sign-in has a state, a nonce and a PKCE (S256) challenge.
- Dana refuses a Google account with an unverified email. Dana shows an explanation page and
  makes no session.
- The account identity is the Google subject (`users.google_sub`). The email address is not
  the identity.
- Dana never joins two accounts because their email addresses match. A new Google subject
  with a verified email that a live account holds gets a refusal page. Dana makes no rows,
  links nothing and starts no session.
  An automatic join can give one person the account of another, and nobody can undo it.
- Dana never normalises email addresses. Dana compares the lowercase address byte for byte.
  Thus `a.b@gmail.com` and `ab@gmail.com` are two different addresses in Dana.
- The development login exists only when `DANA_DEV_LOGIN=1`. A production build has no
  development login module, so the route cannot exist in production.

## Sessions and cookies

- Sessions are rows in the `sessions` table on the server.
- The session cookie holds a random, opaque token. The database keeps only the sha256 digest
  of that token. Thus a copy of the database gives nobody a session.
- A session expires 30 days after the last authenticated request. Each authenticated request
  moves the expiry forward. A request never renews an expired session.
- The session cookie is httpOnly, Secure and SameSite=Lax. Strict drops the cookie on
  the redirect back from Google.
- The server always sets Secure. TLS stops at the edge, so the process sees only plain HTTP.
- The cookie is host-only. Never set a Domain attribute. A session works on one host only,
  so the deployment must redirect every other host to the canonical host (`APP_ORIGIN`).
- Sign-out deletes that one session. Account deletion deletes all sessions of the user at
  once, in the same transaction as the deletion.

## CSRF

- Every POST, PATCH, PUT and DELETE must have a session check and a CSRF check.
- Dana uses a double-submit token. The client can read the `dana_csrf` cookie, and it sends
  the value in the `X-CSRF-Token` header.
- The CSRF token is an HMAC of the session token. The server stores no copy. Nobody can get
  the session token from the CSRF token.
- A bad or absent CSRF token gets 403.
- Every GET without a session gets 401. The only public routes are the health probe, the two
  sign-in routes and the CSP report endpoint.
- The test `tests/security/session-and-csrf-sweep.test.ts` checks these rules on
  every mounted route. A new public route needs an entry there with its reason.

## Authorization

No single middleware checks access. Each route and each domain function must check access
itself. Dana has two mechanisms, and a new route needs both:

- **Queries.** Folder reads join `visible_folder_members` on the viewer. This view reads
  `folder_members` for ordinary projects and root grants for profile Docs. A query without
  this join can return another person's rows. Personal label queries filter on
  `owner_user_id`.
- **Gates.** Each mutation and each route with an id must call an `accessOf(...)` gate
  (`src/server/domain/folder-access.ts`) before it touches rows. Nothing adds the gate
  for you.
- **DMs.** A new DM checks current shared project membership for both people. Each
  message read and write checks the two participant IDs on the conversation row.
  This participant check replaces `accessOf(...)` because a DM has no folder.
- **Bio.** A Team member can read a person's Bio in the current project. Only that
  person can change it. Full control and project ownership grant no Bio write access.
  Earlier project Bio text stays on the membership with its recorded attribution.
- **Profile Docs.** Each root is a real Doc project. Its child pages inherit its access.
  A person-owned root starts with Only me. Its owner manages the audience and grants.
  A project-managed root starts with project members. Current Full control members
  manage it. The project owner retains read access. A child has no separate audience.
  A grant change also controls direct pages, files, search, references, history,
  notifications and exports. Profile Docs do not create Tasks or Discussions.

Rules for ids:

- Never trust a `folder_id`, `task_id`, `user_id` or `file_id` from the client without a
  gate. Database constraints are the last defence, not the first.
- An id in the query string or the body needs its own gate in the handler that reads it.
- The test `tests/security/authorization-sweep.test.ts` calls each route with an
  id in its path as a signed-in stranger. Each new route of this kind needs a row in its
  table. The sweep cannot see ids in the query string or the body.

What a caller gets:

- **404**: the caller cannot see the thing. A refusal must never confirm that a thing
  exists, so an inaccessible resource gets 404, never 403.
- **403**: the caller can see the thing, but cannot do the act. An example is a member below
  the access level that the act needs.
- **422**: the caller can see the thing, but the request puts it in the wrong place. An
  example is a folder label on a task in a different folder.

## Limits

- The server enforces every input limit. The numbers live in `src/shared/` and in the
  domain modules. A change to a limit is a product change.
- A value above its limit gets 422 with the field name.
- An upload or copy above the storage quota of the account gets 413.
- The JSON parser refuses a body above its size limit with 400, before it reads a field.
- A cap on a count must take a lock in the same transaction as the insert. Without the lock,
  two parallel requests at the limit can both read the count and both insert.
- Lists have a row cap and a `truncated` flag, but no pagination. Dana assumes data at
  personal scale. The folder list has no cap.

## Rate limits

- `RATE_LIMIT_POLICY` in `src/server/security/rate-limit.ts` holds all the numbers.
- Per user: invites, search, general mutations and data export.
- Per client address: the two sign-in routes and CSP reports. These routes have no session
  to key on. Each sign-in route has its own counter, so an attack on one route cannot block
  the other.
- Invite resend has a state guard, not a rate limit: one resend per invite in each window.
- All other routes have no limit.
- A refusal is 429 with `Retry-After`.
- The counters are in the memory of one process. A second instance needs a shared store.
- `createApp` sets `trust proxy` to 1, for the one proxy in front of the process (the
  Render edge).
  - Never set it to `true`. Then the client writes its own address, and the address limits
    stop nobody.
  - If you put a proxy or a CDN in front of the edge, you must increase the number.
- Many people behind one NAT share one address. They can reach the sign-in limit together.

## Logs

- Each log line must go through the logger in `src/server/security/log.ts`. Each event
  takes a closed set of fields, so other data has no path into the log.
- Dana must never log:
  - user content: task titles, notes, step titles, comments, page text, file names
  - email addresses and email bodies
  - OAuth tokens, session tokens and CSRF tokens
  - request bodies, query strings, or any other value that a caller sent
- Log ids and counts instead. For example, an invite event has the invite id, not the email
  address.
- For a request with undeclared fields, log the route template and the key names only. The
  logger writes `other` for a key name that is not snake_case. A caller chooses key names,
  and a key name can be a token.
- For a CSP report, log the directive, the scheme and host of the blocked URI, and the
  document path without its query string. Never log the script sample.
- Keep logs for 30 days.
- Dana has no analytics and no tracking.

## Privacy

- Dana sets only the cookies that sign-in and security need. Thus Dana shows no cookie
  banner. Before you add analytics, advertising or another cookie that is not necessary,
  add a consent step.
- `src/client/pages/LegalPage.tsx` names each provider, cookie and retention period. When
  one of them changes, update that page in the same PR.

## Response headers and CSP

- `securityHeaders` in `createApp` (`src/server/index.ts`) sets the headers on every
  response, before every handler. Thus errors also have them. The comment above it gives
  the reason for each CSP source.
- The edge sets HSTS. The process never sets it.
- The file routes keep their own stricter headers (nosniff, attachment). The global headers
  never weaken them.
- Keep the CSP as narrow as the client needs. Add a source only for a thing the product
  does, and write its reason in the comment.
- `script-src` is `'self'` plus the hash of the inline theme script in `index.html`.
  Never add `'unsafe-inline'`, `blob:` or `data:` to `script-src`.
- Dana permits `blob:` and `data:` only for bytes that the page already holds: images,
  media and the crop `fetch()`.
- Admit a third-party host only when it is fixed and trusted. If a host comes from runtime
  data, such as a cover photo search result, proxy it through the Dana origin.
- The service worker falls back to `script-src`. Check the worker after each change to
  `script-src`.
- The theme hash needs LF line endings (`.gitattributes`). A CRLF copy of `index.html`
  gives a different hash, and production then blocks the theme script with no error.
- `npm run dev` sends no CSP. Test each CSP change on the production build in a real
  browser.
- The browser reports CSP refusals to `POST /api/csp-report`. This endpoint has no session
  check and no CSRF check. It reads and writes no data.
- The endpoint answers 204 for a report that it drops, as for a report that it keeps. Thus
  the status never shows the filters.

## Email

- Dana sends four kinds of email: a folder invitation, a connection invitation, a share
  grant and a reminder.
- Only production sends email. The process sends only when `NODE_ENV` is `production` and
  the environment holds the Resend key and sender. In all other cases, it logs the template name and sends
  nothing. A developer laptop must never send email to a real person.
- Each email has an HTML part and a full text/plain part, with the same one action link.
- Only the two invitations carry the footer that tells what Dana is. Extra content can make a
  transactional email look like marketing.
- Never log the recipient address or the body of a provider response.
- The sender domain must have SPF, DKIM and DMARC.

## Data obligations

Google sign-in binds Dana to the Google API Services User Data Policy, the Google APIs Terms
of Service and the OAuth verification requirements.

- **Privacy page.** It must name the three fields that Dana gets from Google (name, email,
  picture), tell their use, and tell who sees them.
- **Consent screen.** The administrator of the Cloud project must verify the domain. The
  privacy URL on the consent screen must be the same as the URL in the landing page footer.
- **Verification.** Google can cap an unverified app at 100 users. Submit brand verification
  before Dana opens to more people.
- **Export.** The Google APIs Terms of Service require data portability. Dana exports all the
  data that it holds about the person as one JSON document. Only the signed-in person can
  download it.
- **Account deletion.** Dana gives deletion in the app, behind a typed confirmation. Google
  has no deletion rule for Dana, but Google Play has one. If Dana goes on an app store, it
  must also give a web link for deletion.
- Dana refuses deletion (409) while the person owns a shared folder. The person must first
  transfer the ownership or delete the folder.

## PWA

- The service worker never caches API requests.
- Offline, the shell opens on `/app` paths. Reads need the network, and writes fail at once.
  Dana keeps no offline copy of data.
- A new version starts on the next load. Dana never forces a reload.
