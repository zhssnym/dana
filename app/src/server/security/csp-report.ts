/*
Parsing browser CSP violation reports, both the `report-uri` shape
(application/csp-report) and the Reporting API shape (application/reports+json).
Everything returned is safe to log (10.5): a whitelist of directive, blocked
scheme+host or keyword, and document path without query. Extension noise is
filtered before anything is logged.
*/

/**
 * How long one fingerprint stays quiet in Sentry. Fingerprints group issues but
 * do not reduce the event count, which is what the quota counts. The log line
 * is written every time regardless.
 */
export const SENTRY_WINDOW_MS = 10 * 60 * 1_000

/** Fingerprints held at once. The blocked host is a stranger's string, so the map must be bounded. */
export const SENTRY_FINGERPRINT_CAPACITY = 500

/**
 * Absolute Sentry events per window, whatever arrives: the fingerprint holds a
 * stranger's host, so per-fingerprint throttling alone is not a bound.
 */
export const SENTRY_BUDGET_PER_WINDOW = 20

/**
 * `exhausted` is sent once so a silenced channel is not mistaken for a healthy one.
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
  // A fixed window: a counter, not a list, for an unauthenticated caller.
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

/** In process: production is a single instance (11.1), like the rate limiters. */
export function createSendThrottle(options: {
  windowMs?: number
  capacity?: number
  now?: () => number
} = {}): SendThrottle {
  const windowMs = options.windowMs ?? SENTRY_WINDOW_MS
  const capacity = options.capacity ?? SENTRY_FINGERPRINT_CAPACITY
  const now = options.now ?? (() => Date.now())
  const sentAt = new Map<string, number>()

  return {
    allow(key) {
      const at = now()
      const last = sentAt.get(key)
      // A refusal does not refresh the entry, so a flood cannot hold its slot forever.
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

/** What survives the parse: the whole of what may be logged. */
export interface CspViolation {
  directive: string
  /** Scheme and host, or a bare CSP keyword (`inline`, `eval`). Never a path or query. */
  blockedUri: string
  /** Path only, no query or fragment. */
  documentPath: string
}

export interface CspReportContext {
  /** Reports about any other document origin are dropped unread. */
  expectedOrigin: string
}

/** Bounds one body's cost: the Reporting API batches, and the 16 KB cap alone admits about fifty. */
export const MAX_VIOLATIONS_PER_BODY = 10

/**
 * Schemes injected by browsers or extensions, never Dana's doing. Extension ids
 * also identify a person's installed software, so they are not logged.
 */
const EXTENSION_SCHEMES = new Set([
  'chrome-extension',
  'moz-extension',
  'safari-extension',
  'safari-web-extension',
  'ms-browser-extension',
  // Safari's mask for hidden-provenance script: injected by definition.
  'webkit-masked-url',
  'resource',
  'about',
])

/** Keyword blocked-uri values, kept verbatim: `inline` is the most valuable one Dana can see. */
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

function parsedUrl(value: string | undefined): URL | undefined {
  if (value === undefined) return undefined
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}

/** Shared by the endpoint and by the Reporting-Endpoints header in index.ts. */
export function originOf(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') return undefined
  return parsedUrl(value)?.origin
}

interface RawViolation {
  documentUrl: string | undefined
  directive: string | undefined
  blockedUri: string | undefined
}

function fromReportUriShape(body: Record<string, unknown>): RawViolation[] {
  const report = asRecord(body['csp-report'])
  if (report === undefined) return []
  return [
    {
      documentUrl: asString(report['document-uri']),
      // Prefer the resolved directive; normalizeDirective trims the older one.
      directive:
        asString(report['effective-directive']) ??
        asString(report['violated-directive']),
      blockedUri: asString(report['blocked-uri']),
    },
  ]
}

function fromReportingApiShape(entries: readonly unknown[]): RawViolation[] {
  const found: RawViolation[] = []
  for (const entry of entries) {
    const envelope = asRecord(entry)
    if (envelope === undefined) continue
    // Only CSP reports are read.
    if (asString(envelope.type) !== 'csp-violation') continue
    const report = asRecord(envelope.body)
    if (report === undefined) continue
    found.push({
      documentUrl: asString(report.documentURL) ?? asString(envelope.url),
      directive: asString(report.effectiveDirective),
      // blockedURI is the older spelling, still sent by some builds.
      blockedUri: asString(report.blockedURL) ?? asString(report.blockedURI),
    })
  }
  return found
}

/**
 * The directive name alone. `violated-directive` carries the whole policy
 * after the name, which is dropped.
 */
export function normalizeDirective(raw: string | undefined): string | undefined {
  const name = (raw ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  return DIRECTIVE_NAME.test(name) ? name : undefined
}

/**
 * A keyword passes through; a URL keeps only scheme and host. Empty or relative
 * values become `unknown`, since the directive is still worth knowing.
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
 * Extension schemes, and `data:` under style-src only (style-src already allows
 * inline). A `data:` script refusal is never filtered.
 */
export function isBrowserNoise(
  scheme: string | undefined,
  directive: string,
): boolean {
  if (scheme === undefined) return false
  if (EXTENSION_SCHEMES.has(scheme)) return true
  return scheme === 'data' && directive.startsWith('style-src')
}

/** Violations in one body that are Dana's own. The origin check runs first. */
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
      // Path only: search and hash can hold a person's own words.
      documentPath: document.pathname,
    })
  }
  return kept
}
