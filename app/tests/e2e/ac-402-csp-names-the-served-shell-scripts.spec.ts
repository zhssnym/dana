/*
AC-402: given the document this application actually serves, at `/` and at
`/app`, then every inline script in it is named by a sha256 hash-source inside
the `script-src` directive of that same response's Content-Security-Policy, and
the response carries the `Reporting-Endpoints` header naming the path
`report-uri` names.

Written 2026-09-04 from issue #96, which is the gap PR #88 left open and said
so.

**Why the vitest arm cannot see this, which is the whole reason for the file.**
`tests/ac-238-response-security-headers.test.ts` recomputes the digest of every
inline script in the shell and fails if `script-src` does not name it, reading
`app/dist/client/index.html` when it exists and falling back to
`app/index.html` when it does not. **In CI it always takes the fallback.**
`.github/workflows/ci.yml` runs both vitest legs before the build step, `dist/`
is in `.gitignore`, and `actions/checkout@v4` defaults to `clean: true`, which
runs `git clean -ffdx` — so no `dist/` from a previous run survives to be read.
The vitest arm therefore proves the policy matches the *source* document, and
cannot see a script that only the build produces.

This leg is where the build has already run. `playwright.config.ts` starts
`npm run e2e:app`, which is `vite build && tsx db/seed.ts && tsx
src/server/index.ts`, so the server answering below is serving a document built
moments earlier with the real header on it. Measured 2026-09-04: the built
document is 2425 bytes against the source's 2284 and carries
`<script type="module" crossorigin src="/assets/index-<hash>.js">` where the
source carries `<script type="module" src="/src/client/main.tsx">`. Those are
different documents, and only one of them is ever served to anybody.

**The case that is uncovered without this.** `vite.config.ts` sets
`injectRegister: null`. Set it to `'inline'` and vite-plugin-pwa injects a
second inline script into the built HTML; the policy names one hash, that
script is refused in production, the service worker never registers and offline
stops working — with the whole vitest suite green, because `app/index.html`
carries no such script. An HTML-minifying plugin, or a Vite version that starts
normalising the head, lands in the same place. Nothing reports a CSP refusal
in production, which is why the original defect of issue #34 survived for
months.

**Against the header of the same response, never against a constant.** Reading
`THEME_SCRIPT_HASH` out of `src/server/index.ts` and comparing it to itself
would measure nothing; taking the policy off the very response whose body is
being digested is what makes this independent of the server module, which is
what makes the vitest arm worth keeping beside it.

**Two paths, because they are two code paths.** `/` is answered by
`express.static` over `dist/client` and `/app` by the SPA fallback's
`res.sendFile`, and CLAUDE.md records them diverging for real: under a checkout
whose path carries a dot segment, Express refuses the `sendFile` and `/app`
answers 404 while `/` still answers 200. Two responses that are meant to be the
same document are worth reading as two.

**What this deliberately does not assert.** That `script-src` never takes
`'unsafe-inline'` is AC-238's, and stays there: it is a property of the policy
string, which the vitest arm reads perfectly well on every leg. What this case
adds is the document, so the document is what it is about. The
`Reporting-Endpoints` line below is the same division — AC-394 fixes the
header's shape, and this asserts that a real HTML response off the built server
carries it, that being the response class a refusal happens on.

Spec: 10.8 (the response headers and the policy sized to what the client
loads), 11.11 (the CI step set and its order); issues #96, #88, #34, #99.
*/
import { createHash } from 'node:crypto'

import { expect, test } from '@playwright/test'

import { TEST_TIMEOUT_MS } from './harness.js'

test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/**
 * The value of one directive, or undefined when the policy does not state it.
 *
 * AC-238's helper, and the same reasoning: a hash-source has to be read this
 * way rather than with `csp.includes(hash)`, which a hash sitting in
 * `style-src` would satisfy just as well while granting the script nothing.
 * Split on the separator rather than matched, because a base64 digest carries
 * `+` and `/` and would have to be escaped into a pattern, and because
 * `script-src-elem` begins with `script-src` and must not be allowed to answer
 * for it. An empty string is a stated directive with no sources, which is not
 * the same as an absent one.
 */
function directiveOf(csp: string, name: string): string | undefined {
  return csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `))
    ?.slice(name.length)
    .trim()
}

/**
 * Every `<script>` in the document that carries no `src`, which is every
 * script whose body the policy has to name a digest for.
 *
 * The pattern is AC-238's character for character, so that the two arms cannot
 * disagree about what an inline script is while both claiming to check one. It
 * does not filter on `type`, and that is deliberate: a `<script>` holding data
 * rather than code would fail this and should be looked at, the same tag with
 * an executable type being exactly what this exists to catch.
 */
function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    (match) => match[1] ?? '',
  )
}

/** The CSP hash-source form of one script body: sha256 over its UTF-8 bytes. */
function hashSourceOf(body: string): string {
  return `sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}`
}

/* The two paths the built shell is served on, and how each is answered. */
const SHELL_PATHS = [
  ['/', 'express.static over dist/client'],
  ['/app', "the SPA fallback's res.sendFile"],
] as const

for (const [path, servedBy] of SHELL_PATHS) {
  test(`AC-402: the policy on ${path} names every inline script in the body it served`, async ({
    request,
  }) => {
    const response = await request.get(path)
    expect(response.status(), `${path} answers the shell document (${servedBy})`).toBe(200)
    const html = await response.text()
    const headers = response.headers()
    const csp = headers['content-security-policy'] ?? ''

    /* The witness that this is the built document and not the source shell.
       Without it, a server change that started serving `app/index.html`
       directly would leave this case green while measuring exactly what the
       vitest arm already measures, which is the failure this file exists to
       end rather than to reproduce. Vite writes the entry as a content-hashed
       asset; the source shell points at `/src/client/main.tsx`. */
    expect(
      html,
      `${path} is answered with the document \`vite build\` produced, not the source shell. ` +
        'Vite rewrites the module entry to a content-hashed file under /assets/, so a body ' +
        'without one is `app/index.html` being served straight through — and this whole ' +
        'file is the reading of the *built* document that issue #96 is about',
    ).toContain('/assets/')

    const inline = inlineScripts(html)
    /* The floor. Zero inline scripts means the shape this case reads has
       changed rather than that the policy is safe: put `type="module"` on the
       theme script and Vite hoists it into the bundle, and without this line
       the case would pass having asserted nothing at all. */
    expect(
      inline.length,
      `the document served at ${path} carries at least one inline script to cover. It ` +
        'carries one on purpose — the theme script paints the first frame from the ' +
        'localStorage mirror and cannot move into the bundle without becoming the second ' +
        'frame, which is the flash it exists to prevent',
    ).toBeGreaterThan(0)

    const scriptSrc = directiveOf(csp, 'script-src')
    expect(
      scriptSrc,
      `the policy on ${path} states script-src rather than leaving scripts to default-src ` +
        `(10.8) (got: ${csp || 'no header'})`,
    ).toBeDefined()

    const unnamed = inline
      .map((body) => hashSourceOf(body))
      .filter((hash) => !(scriptSrc ?? '').includes(hash))
    expect(
      unnamed,
      `every inline script in the body served at ${path} is named by a hash-source inside ` +
        'script-src of that same response (10.8). Inside it, because a hash anywhere else ' +
        'in the policy grants a script nothing. If this fails, the build has put a script ' +
        'into the document that the policy does not know about — `injectRegister: ' +
        "'inline'` in vite.config.ts and an HTML-minifying plugin are the two known ways " +
        'in — and in production that script is refused, silently, with nothing reporting ' +
        `it. The digests above are what script-src has to name. Policy was: ${csp}`,
    ).toEqual([])

    /* The reporting header, on the response class a refusal actually happens
       on. AC-394 fixes its shape against the mounted application; what is
       added here is that a real HTML answer off the built server carries it,
       and that it names the same path the policy's own report-uri does — two
       halves that can drift apart, one being a header and the other a
       directive. */
    const reporting = headers['reporting-endpoints'] ?? ''
    expect(
      reporting,
      `the response at ${path} carries Reporting-Endpoints, which is what gives report-to ` +
        'a name to resolve (10.8, issue #99). Without it the modern half of the reporting ' +
        'pair resolves to nothing and Chromium reports nowhere',
    ).not.toBe('')
    const reportUri = directiveOf(csp, 'report-uri')
    expect(
      reporting,
      `Reporting-Endpoints and report-uri name one endpoint. report-uri said ${
        reportUri ?? 'nothing'
      } and the header said ${reporting}; a browser honouring one generation and not the ` +
        'other must reach the same place',
    ).toContain(reportUri ?? 'report-uri is absent from the policy')
  })
}
