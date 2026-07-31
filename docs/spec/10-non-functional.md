## 10. Non-functional requirements

### 10.1 Authentication and sessions

Google OAuth 2.0 with OpenID Connect, scopes openid email profile only; no Gmail or Calendar scopes exist anywhere in v1. Sessions are server-side, referenced by an httpOnly, Secure, SameSite=Lax cookie, 30-day rolling expiry; mutations additionally require a CSRF token when cookies are the carrier. Sign-out destroys the session; account deletion destroys all sessions (8.10). Sign-ins with an unverified Google email are rejected with an explanatory page (copy in 9.2).

Session storage is a dedicated sessions table, hand-rolled with the rest of the auth module (11.6), outside the frozen section 4 model. Its shape is the Security engineer's, except three facts fixed here as contract so the acceptance suite can observe expiry (AC-113) and shared-database test runs can clean up: the table is named sessions; it references users(id) through a user_id column declared ON DELETE CASCADE (a cascade that never fires in production, where account deletion scrubs the user row and destroys sessions explicitly per 8.10; it exists so test teardown that hard-deletes users cannot strand rows); and expiry is a timestamptz column named expires_at, which every authenticated request resets to 30 days from that request's time. The per-request write is deliberate: it is what makes AC-113's rolling half observable, and its cost is noise at v1 scale on one instance; throttling the extension is an optimization that must amend this sentence and AC-113 together. The DDL is a forward-only migration in app/db/migrations like every table, authored by the Data engineer to this contract, and the table stays out of the section 4 constraint catalog that AC-001 asserts: the catalog test admits it as this section's one named exception.

### 10.2 Authorization enforcement points

One chokepoint: every data query joins folder_members on the viewer, and every mutation resolves the 5.4 matrix server-side before touching rows. Inaccessible resources answer 404 (never 403) to avoid existence leaks; permitted-visibility but forbidden-action answers 403. No endpoint trusts a folder_id, task_id, or user_id from the client without these checks. The composite FK of 4.5 and the constraints of section 4 are the last line, not the first.

### 10.3 Input validation and limits

| Value | Limit |
| - | - |
| Task title, step title | 1 to 300 characters |
| Notes | up to 10000 characters |
| Folder name | 1 to 100 characters |
| Personal label | 1 to 40 characters |
| Steps per task | 50 |
| Custom folders per account | 200 |
| Members per folder | 25 |
| Recurrence rule string | up to 200 characters, subset of 4.11 only |
| Reminder offset | 0 to 10080 minutes |
| Search query | 2 to 100 characters |
| Calendar range | up to 62 days |
| List responses | capped at 1000 rows with truncated flag |
| Email address | up to 320 characters, syntactically valid, stored lowercased |
| Timezone | valid IANA identifier |

All numbers are server-enforced and returned as 422 with the field named.

### 10.4 Rate limits

Per user: invites 5 per minute and 20 per day; invite resend 1 per invite per 24 hours; search 30 requests per minute; general mutations 120 per minute; all others unlimited in v1. Responses use 429 plus Retry-After. Enforcement is per deployment instance in v1 (single-instance hosting per section 11); revisit if horizontally scaled.

### 10.5 Logging

Logged: authentication events, invite lifecycle transitions (invite id, not the email address), folder deletion and account deletion with row counts, status transitions (task id, actor id), reminder sends and skips, request errors with status codes. Never logged: task titles, notes, step titles, email bodies, OAuth tokens, session identifiers. Retention 30 days. No analytics or tracking in v1.

### 10.6 PWA requirements

Manifest: name Dana, display standalone, start_url /app, icons 192 and 512, theme and background colors design's choice. Service worker: precaches the versioned application shell (HTML, JS, CSS, fonts, icons); API requests are network-only, never cached; navigations fall back to the cached shell so the installed app always opens. Updates: new versions activate on next load; when detected mid-session, an unobtrusive "Update available, reload" affordance appears; no forced reload. Install: rely on the browser's native install affordance; Settings carries a short "Install Dana" hint section; no custom install prompt interception in v1. Offline behavior is the ISSUE-19 contract: shell loads, banner shows, reads need network, writes fail fast with the 9.1 toast. No IndexedDB mirror, no background sync.

### 10.7 Email deliverability

One transactional provider serves invite, share-grant, and reminder templates. Launch checklist: sending domain with SPF, DKIM, DMARC configured; from-address noreply@ the product domain; plain, short templates with one action link each. This is a named operational setup cost, done once.
