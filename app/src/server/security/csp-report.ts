/*
Reading a browser's Content-Security-Policy violation report (issue #99).

Nothing anywhere reported a CSP refusal, and that is why four defects lived
in production for months: a refused resource raises no error the server can
see and no error a person would read as an error rather than as a bug in
something else. Issue #99 records all four. The report therefore comes from
the browser itself, over `report-uri` and `report-to`, rather than from a
listener in the client — a policy that refuses the page's own bootstrap also
refuses whatever would have reported it, which is exactly the shape of the
theme-flash defect (#34).

Two wire shapes arrive at one endpoint and both are read here, because the
two directives are two generations of one feature and a browser Dana
supports may implement either:

- `application/csp-report`, the `report-uri` shape: one object under a
  `"csp-report"` key, hyphenated field names, `blocked-uri`.
- `application/reports+json`, the Reporting API shape: an array of
  envelopes, each with a `type` and a `body`, camelCase field names,
  `blockedURL`.

**Everything this module returns is fit to be logged, and that is its whole
contract.** 10.5 keeps user content out of the logs, and a violation report
carries two fields that hold page content outright: `script-sample`, which
is a slice of the refused script, and the query string of `document-uri`,
which on a search URL is whatever someone typed. So the parse is a
whitelist and not a filter. Three fields survive it, each narrowed to a
shape that cannot carry prose: the effective directive, the blocked URI's
scheme and host (or the bare CSP keyword, `inline` and `eval` being the two
that matter most and neither being a URL), and the document's path with the
query string removed. Nothing else is read at all, so nothing else can be
logged by mistake later.

**The filtering happens before anything is logged rather than after**, which
is the caution issue #99 closes with. Extensions inject scripts and styles
into every page they run on and the refusals are attributed to the document,
so an unfiltered endpoint collects noise in proportion to how many people
run an ad blocker. Two filters, and the reasons are with the lists below.
*/

/**
 * How long one fingerprint stays quiet in Sentry after it has been sent.
 *
 * **Sentry's fingerprint groups issues; it does not reduce the event count,
 * and the event count is what a free-tier quota is denominated in.** So the
 * fingerprint alone bought a tidy issue list and no protection: at 10.4's
 * 30 requests a minute and this file's ten violations a body, one stranger
 * who knows APP_ORIGIN could send 300 Sentry events a minute against a plan
 * that allows about 5,000 a month (11.12), and the real errors after that
 * are the ones dropped.
 *
 * Ten minutes is chosen against what the destination is for. Sentry is the
 * alert and the log is the record: an alert that fires once per defect per
 * ten minutes is an alert, and one that fires three hundred times a minute
 * is a denial of service against the person reading it. Nothing is lost by
 * waiting, because the log line is written every time and is not throttled.
 */
export const SENTRY_WINDOW_MS = 10 * 60 * 1_000

/**
 * The most fingerprints held at once.
 *
 * The blocked URI is a stranger's string, so the set of fingerprints is not
 * bounded by anything Dana controls and an unbounded map here would be the
 * memory-shaped version of the quota problem this throttle exists to solve.
 * Evicting the oldest is right for the same reason the window is: a
 * fingerprint nobody has sent for a while is one whose next event is worth
 * having.
 */
export const SENTRY_FINGERPRINT_CAPACITY = 500

/**
 * The most Sentry events this endpoint may spend in one window, whatever
 * arrives.
 *
 * **The per-fingerprint throttle below is not a bound, and the reviewer was
 * right about why** (issue #99, finding 1): the fingerprint contains the
 * blocked URI, which is a stranger's string, so varying one character
 * varied the key and 10.4's thirty requests a minute times ten violations a
 * body was still 300 events a minute. Two changes answer it and neither is
 * sufficient alone. The values in the fingerprint are now the whitelisted
 * ones the log line carries, so the key space is the directive crossed with
 * a keyword, a `scheme://host`, or `other` — narrow, but a host is still a
 * stranger's string. So this second bound is absolute and counts events
 * rather than keys: twenty in ten minutes, whoever asks and however varied.
 *
 * That is about 8,600 a month at worst, against a free tier of roughly
 * 5,000, so it is not a guarantee on its own either — but a flood now has
 * to be sustained for a month to matter rather than for twenty minutes, and
 * the message below means anyone watching finds out on the first window.
 */
export const SENTRY_BUDGET_PER_WINDOW = 20

/**
 * `send` for a message that fits the budget, `exhausted` for the one
 * message that says the budget is spent, `silent` for everything after it.
 *
 * The middle case exists because **a quiet alert channel and a healthy one
 * look identical**, which is the whole disease issue #99 was opened about.
 * A throttle that simply stopped sending would reproduce it one level up.
 */
export type BudgetVerdict = 'send' | 'exhausted' | 'silent'

export interface SendBudget {
  take(): BudgetVerdict
}

export function createSendBudget(options: {
  limit?: number
  windowMs?: number
  now?: () => number
} = {}): SendBudget {
  const limit = options.limit ?? SENTRY_BUDGET_PER_WINDOW
  const windowMs = options.windowMs ?? SENTRY_WINDOW_MS
  const now = options.now ?? (() => Date.now())
  // A fixed window rather than a sliding one: the counter is a number and
  // not a list of timestamps, which is the property that matters for
  // something an unauthenticated caller drives.
  let windowStart = Number.NEGATIVE_INFINITY
  let spent = 0

  return {
    take() {
      const at = now()
      if (at - windowStart >= windowMs) {
        windowStart = at
        spent = 0
      }
      if (spent >= limit + 1) return 'silent'
      spent += 1
      return spent <= limit ? 'send' : 'exhausted'
    },
  }
}

export interface SendThrottle {
  /** True at most once per key per window, and it records the send. */
  allow(key: string): boolean
}

/**
 * One throttle per application, held in process.
 *
 * In process and not in a store, because 11.1 fixes production at exactly
 * one instance and the rate limiters beside this one already rest on that.
 * A scale-out replaces both together.
 */
export function createSendThrottle(options: {
  windowMs?: number
  capacity?: number
  now?: () => number
} = {}): SendThrottle {
  const windowMs = options.windowMs ?? SENTRY_WINDOW_MS
  const capacity = options.capacity ?? SENTRY_FINGERPRINT_CAPACITY
  const now = options.now ?? (() => Date.now())
  // Insertion-ordered, which is what makes "evict the oldest" one line.
  const sentAt = new Map<string, number>()

  return {
    allow(key) {
      const at = now()
      const last = sentAt.get(key)
      // Deliberately does not refresh the entry on a refusal: a flood of one
      // fingerprint must not be able to hold its own slot open forever.
      if (last !== undefined && at - last < windowMs) return false
      sentAt.delete(key)
      sentAt.set(key, at)
      while (sentAt.size > capacity) {
        const oldest = sentAt.keys().next()
        if (oldest.done === true) break
        sentAt.delete(oldest.value)
      }
      return true
    },
  }
}

/** What survives the parse, and the whole of what may be logged. */
export interface CspViolation {
  /** The effective directive, `script-src-elem` and the like. */
  directive: string
  /**
   * Scheme and host of an absolute blocked URL, or the bare CSP keyword
   * (`inline`, `eval`) as the browser sent it. Never a path or a query.
   */
  blockedUri: string
  /** The document's path, with no query string and no fragment. */
  documentPath: string
}

export interface CspReportContext {
  /**
   * The origin this deployment answers on. A report naming any other
   * document origin is about somebody else's page — an extension's, a
   * `about:blank` frame's, or a scan — and is dropped unread.
   */
  expectedOrigin: string
}

/**
 * The most violations read from one body, whatever it holds.
 *
 * The Reporting API batches, so one POST can legitimately carry several
 * envelopes, and the 16 KB body cap alone would admit roughly fifty. With
 * the limiter's 30 requests a minute that is 1500 log lines and 1500 Sentry
 * messages a minute from one address, on free tiers 11.12 sizes for
 * ordinary error volume. Ten is above any real cold load — a broken policy
 * refuses the handful of things the shell loads, not fifty — and it bounds
 * the endpoint's cost at 300 lines a minute per address. Reports past the
 * tenth in one body are dropped silently like every other drop here.
 */
export const MAX_VIOLATIONS_PER_BODY = 10

/**
 * Blocked-URI schemes that are never Dana's doing.
 *
 * Every one of these is content a browser or an extension put into the page.
 * The refusal is real — the policy did block something — but it blocked an
 * injection into someone's own browser rather than anything this deployment
 * serves, and no change here would stop it. Logging them buys a stream of
 * events nobody can act on, and the extension id sitting in the host of a
 * `chrome-extension://` URL identifies the person's installed software,
 * which is not something 10.5 has any reason to keep for thirty days.
 */
const EXTENSION_SCHEMES = new Set([
  // Chrome, Edge, Brave, Opera and every other Chromium build.
  'chrome-extension',
  // Firefox.
  'moz-extension',
  // Safari: the first is the legacy extension model, the second the current
  // Web Extension one, and both are still emitted in the field.
  'safari-extension',
  'safari-web-extension',
  // Legacy Edge, before it became Chromium.
  'ms-browser-extension',
  // Safari replaces the URL of script it wants to hide the provenance of
  // with `webkit-masked-url://hidden/`, which is injected content by
  // definition: there is nothing behind the mask to fix.
  'webkit-masked-url',
  // Firefox's internal resources, reached only by browser or extension code.
  'resource',
  // `about:blank` and `about:srcdoc` documents, which are frames a page did
  // not navigate and, more often, an extension's own scratch document.
  'about',
])

/**
 * CSP's keyword blocked-uri values, which are not URLs and must survive
 * verbatim: these are the ones that name Dana's own defects. `inline` is
 * what issue #34 was — the theme script refused because no `script-src`
 * named its hash — and it is the single most valuable value this endpoint
 * can report.
 */
const BLOCKED_URI_KEYWORDS = new Set([
  'inline',
  'eval',
  'self',
  'wasm-eval',
  'trusted-types-policy',
  'trusted-types-sink',
])

const DIRECTIVE_NAME = /^[a-z][a-z0-9-]{0,39}$/

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/** A URL, or undefined for anything that is not one. Both shapes' fields are
 * caller-supplied strings and `new URL` is the only honest parser for them. */
function parsedUrl(value: string | undefined): URL | undefined {
  if (value === undefined) return undefined
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}

/**
 * The origin of a configured URL, or undefined when there is not one to
 * read. Shared by the endpoint, which compares reports against it, and by
 * the header in index.ts, which names the endpoint absolutely under it.
 */
export function originOf(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') return undefined
  return parsedUrl(value)?.origin
}

/** The three fields, before any of them is trusted. */
interface RawViolation {
  documentUrl: string | undefined
  directive: string | undefined
  blockedUri: string | undefined
}

/** `application/csp-report`: `{ "csp-report": { ... } }`. */
function fromReportUriShape(body: Record<string, unknown>): RawViolation[] {
  const report = asRecord(body['csp-report'])
  if (report === undefined) return []
  return [
    {
      documentUrl: asString(report['document-uri']),
      // `effective-directive` is the resolved one and is what a reader
      // wants; `violated-directive` is the older field and carries the
      // directive's sources after its name, which normalizeDirective cuts.
      directive:
        asString(report['effective-directive']) ??
        asString(report['violated-directive']),
      blockedUri: asString(report['blocked-uri']),
    },
  ]
}

/** `application/reports+json`: an array of Reporting API envelopes. */
function fromReportingApiShape(entries: readonly unknown[]): RawViolation[] {
  const found: RawViolation[] = []
  for (const entry of entries) {
    const envelope = asRecord(entry)
    if (envelope === undefined) continue
    // One Reporting endpoint can receive deprecation and intervention
    // reports too if a policy ever names it for them. Only CSP is read.
    if (asString(envelope.type) !== 'csp-violation') continue
    const report = asRecord(envelope.body)
    if (report === undefined) continue
    found.push({
      documentUrl: asString(report.documentURL) ?? asString(envelope.url),
      directive: asString(report.effectiveDirective),
      // Chromium settled on blockedURL; blockedURI was the earlier spelling
      // and is still emitted by builds in the field.
      blockedUri: asString(report.blockedURL) ?? asString(report.blockedURI),
    })
  }
  return found
}

/**
 * The directive's name alone, lowercased, or undefined when the value is not
 * one. `violated-directive` is historically `"script-src-elem 'self'"`, the
 * whole directive rather than its name, so the first token is taken and the
 * policy that follows it — which names every host this deployment admits and
 * is not worth repeating in a log line — is dropped.
 */
export function normalizeDirective(raw: string | undefined): string | undefined {
  const name = (raw ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  return DIRECTIVE_NAME.test(name) ? name : undefined
}

/**
 * The blocked URI reduced to what may be logged, and its scheme so the noise
 * filter can read it.
 *
 * A keyword passes through as it is. An absolute URL keeps its scheme and
 * host and loses everything after them: the path and query of a blocked URL
 * can be anything at all, a query string on this origin included, and the
 * host is what tells a reader which directive to widen. Anything else — an
 * empty value, which browsers send when a redirect chain hid the real
 * target, or a relative URL — becomes `unknown` rather than being dropped,
 * because the directive is still worth knowing.
 */
export function normalizeBlockedUri(raw: string | undefined): {
  scheme: string | undefined
  value: string
} {
  const trimmed = (raw ?? '').trim().toLowerCase()
  if (trimmed === '') return { scheme: undefined, value: 'unknown' }
  if (BLOCKED_URI_KEYWORDS.has(trimmed)) {
    return { scheme: undefined, value: trimmed }
  }
  const url = parsedUrl(trimmed)
  if (url === undefined) return { scheme: undefined, value: 'unknown' }
  const scheme = url.protocol.slice(0, -1)
  return {
    scheme,
    value: url.host === '' ? `${scheme}:` : `${scheme}://${url.host}`,
  }
}

/**
 * Whether this refusal is somebody's browser rather than Dana.
 *
 * The extension schemes are the list above. `data:` is the one conditional
 * entry and it earns the condition: a `data:` stylesheet is what reader
 * modes, translation widgets and half the extensions in the world inject,
 * and `style-src` is already `'unsafe-inline'` here so no such refusal can
 * be a Dana defect — while a `data:` URL refused under `script-src` is a
 * script being assembled at runtime, which is the one thing 10.8's policy
 * exists to stop and must never be filtered away.
 */
export function isBrowserNoise(
  scheme: string | undefined,
  directive: string,
): boolean {
  if (scheme === undefined) return false
  if (EXTENSION_SCHEMES.has(scheme)) return true
  return scheme === 'data' && directive.startsWith('style-src')
}

/**
 * Every violation in one posted body that is Dana's own and worth logging.
 *
 * Order of the filters is the order of their cost, and the origin check is
 * first because it is the one that drops a whole page's worth of reports at
 * once: a report whose document is not this deployment is not about this
 * deployment, whatever it says happened.
 */
export function violationsIn(
  body: unknown,
  context: CspReportContext,
): CspViolation[] {
  const expected = parsedUrl(context.expectedOrigin)
  if (expected === undefined) return []

  const record = asRecord(body)
  const raw = Array.isArray(body)
    ? fromReportingApiShape(body)
    : record === undefined
      ? []
      : fromReportUriShape(record)

  const kept: CspViolation[] = []
  for (const candidate of raw.slice(0, MAX_VIOLATIONS_PER_BODY)) {
    const document = parsedUrl(candidate.documentUrl)
    if (document === undefined || document.origin !== expected.origin) continue

    const directive = normalizeDirective(candidate.directive)
    if (directive === undefined) continue

    const blocked = normalizeBlockedUri(candidate.blockedUri)
    if (isBrowserNoise(blocked.scheme, directive)) continue

    kept.push({
      directive,
      blockedUri: blocked.value,
      // pathname alone: search and hash are where a person's own words end
      // up, and 10.5 admits neither.
      documentPath: document.pathname,
    })
  }
  return kept
}
