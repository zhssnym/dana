/*
The report reader against input nobody sent on purpose.

AC-394 to AC-396 drive this module through the endpoint with the two bodies
browsers actually post, which is what a criterion is for. This file covers
the other half of its job: `POST /api/csp-report` is open to the world with
no session (10.8), so every field it reads is a stranger's JSON, and the one
outcome that would be worse than dropping a report is throwing on one. A
`TypeError` in here is a 500 on a public endpoint and a stack in the logs
for every request that carries it.

Nothing below asserts a policy decision — which schemes are noise and which
fields may be logged are the criteria's, and duplicating them here would
give this project two places to change when one of them moves.
*/
import { describe, expect, test } from 'vitest'

import {
  createSendThrottle,
  MAX_VIOLATIONS_PER_BODY,
  normalizeBlockedUri,
  normalizeDirective,
  originOf,
  violationsIn,
} from './csp-report.js'

const context = { expectedOrigin: 'https://dana.example' }

function documentUri(path = '/app'): string {
  return `https://dana.example${path}`
}

describe('the CSP report reader survives anything posted to it', () => {
  test('a body of the wrong shape yields nothing and throws nothing', () => {
    const bodies: unknown[] = [
      undefined,
      null,
      0,
      'a string',
      [],
      {},
      { 'csp-report': null },
      { 'csp-report': 'not an object' },
      { 'csp-report': {} },
      { 'csp-report': { 'document-uri': 42, 'blocked-uri': [] } },
      [null, 7, 'x', {}, { type: 'csp-violation' }, { type: 'deprecation', body: {} }],
      [{ type: 'csp-violation', body: { documentURL: null } }],
    ]
    for (const body of bodies) {
      expect(
        () => violationsIn(body, context),
        `${JSON.stringify(body) ?? 'undefined'} must be dropped rather than thrown on`,
      ).not.toThrow()
      expect(violationsIn(body, context)).toEqual([])
    }
  })

  test('an unreadable expected origin drops everything rather than admitting it', () => {
    const body = {
      'csp-report': {
        'document-uri': documentUri(),
        'effective-directive': 'script-src',
        'blocked-uri': 'inline',
      },
    }
    expect(violationsIn(body, { expectedOrigin: 'not a url' })).toEqual([])
    expect(violationsIn(body, { expectedOrigin: '' })).toEqual([])
    // And the control, so the two above are not passing for want of a
    // readable report.
    expect(violationsIn(body, context)).toHaveLength(1)
  })

  test('a body of many reports is read only as far as the cap', () => {
    const entries = Array.from({ length: MAX_VIOLATIONS_PER_BODY + 5 }, () => ({
      type: 'csp-violation',
      url: documentUri(),
      body: {
        documentURL: documentUri(),
        effectiveDirective: 'script-src-elem',
        blockedURL: 'inline',
      },
    }))
    expect(violationsIn(entries, context)).toHaveLength(MAX_VIOLATIONS_PER_BODY)
  })

  test('a directive is its name alone, whatever follows it', () => {
    // `violated-directive` historically carries the whole directive, sources
    // and all, which would otherwise put every host this deployment admits
    // into a log line.
    expect(normalizeDirective("script-src-elem 'self' https://a.example")).toBe(
      'script-src-elem',
    )
    expect(normalizeDirective('SCRIPT-SRC')).toBe('script-src')
    for (const junk of [undefined, '', '   ', '../../etc', 'a'.repeat(60), '<script>']) {
      expect(normalizeDirective(junk), `${junk ?? 'undefined'} is not a directive`).toBeUndefined()
    }
  })

  test('a blocked URI keeps its scheme and host and nothing after them', () => {
    expect(normalizeBlockedUri('https://cdn.example/a/b.js?token=secret')).toEqual({
      scheme: 'https',
      value: 'https://cdn.example',
    })
    // An opaque scheme has no host, and `blob:` hides the inner origin too,
    // which is right: the bytes are the document's own.
    expect(normalizeBlockedUri('blob:https://dana.example/abc').value).toBe('blob:')
    expect(normalizeBlockedUri('data:text/css,x').value).toBe('data:')
    // The keywords are not URLs and must survive as themselves.
    expect(normalizeBlockedUri('inline').value).toBe('inline')
    expect(normalizeBlockedUri('eval').value).toBe('eval')
    // Browsers send an empty value when a redirect hid the real target. The
    // directive is still worth knowing, so it becomes a value rather than a
    // reason to drop the report.
    expect(normalizeBlockedUri('').value).toBe('unknown')
    expect(normalizeBlockedUri(undefined).value).toBe('unknown')
    expect(normalizeBlockedUri('/relative/path.js').value).toBe('unknown')
  })

  test('originOf reads a configured origin and refuses anything else', () => {
    expect(originOf('https://dana.example/app/tasks?x=1')).toBe('https://dana.example')
    expect(originOf('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000')
    expect(originOf(undefined)).toBeUndefined()
    expect(originOf('  ')).toBeUndefined()
    expect(originOf('dana.example')).toBeUndefined()
  })
})

/*
The Sentry throttle. AC-395 asserts the behaviour a reader cares about — one
event per fingerprint, every report logged — through the endpoint. What it
cannot reach without waiting ten minutes is the far side of the window and
the eviction, and both are the difference between a throttle and a mute.
*/
describe('the Sentry send throttle', () => {
  test('one key is allowed once per window and again after it', () => {
    let now = 1_000_000
    const throttle = createSendThrottle({ windowMs: 1_000, now: () => now })

    expect(throttle.allow('a')).toBe(true)
    expect(throttle.allow('a')).toBe(false)
    now += 999
    expect(throttle.allow('a'), 'still inside the window').toBe(false)
    now += 1
    expect(
      throttle.allow('a'),
      'a throttle that never reopens is a mute, and the second occurrence of a defect a month later would never be seen',
    ).toBe(true)
    expect(throttle.allow('a')).toBe(false)
  })

  test('a refused key does not hold its own slot open', () => {
    /* The window is measured from the last *send*, not from the last
       attempt. Refreshing on a refusal would let a flood of one fingerprint
       keep itself permanently silent, which is the one input this throttle
       is guaranteed to receive. */
    let now = 0
    const throttle = createSendThrottle({ windowMs: 100, now: () => now })
    expect(throttle.allow('a')).toBe(true)
    // Nine refusals inside the window. If any of them reset the clock, the
    // window would now end at 190 rather than at 100.
    for (let index = 0; index < 9; index += 1) {
      now += 10
      expect(throttle.allow('a'), `at ${String(now)}, inside the window`).toBe(false)
    }
    now = 100
    expect(
      throttle.allow('a'),
      'the window is measured from the last send and not from the last attempt',
    ).toBe(true)
  })

  test('distinct keys are independent and the map is bounded', () => {
    const throttle = createSendThrottle({ windowMs: 60_000, capacity: 3, now: () => 0 })
    for (const key of ['a', 'b', 'c']) expect(throttle.allow(key)).toBe(true)
    expect(throttle.allow('a'), 'held, not evicted by its own siblings').toBe(false)

    // The blocked URI is a stranger's string, so the key space is not
    // bounded by anything Dana controls. A fourth key evicts the oldest.
    expect(throttle.allow('d')).toBe(true)
    expect(throttle.allow('a'), 'evicted as the oldest, so it may send again').toBe(true)
    expect(throttle.allow('c'), 'still held').toBe(false)
  })
})
