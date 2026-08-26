/*
AC-251: given any transactional email, then it renders an HTML part and a
text/plain part, both saying the same thing, and each carrying the same single
action link.

10.7 was amended on 2026-08-25 (RFC 0005 change control item 26) from "plain,
short templates" to "HTML with a required text/plain alternative", and both
halves of that sentence are load-bearing: "a send that carries HTML alone does
not meet this section, and the text part must say the same thing and carry the
same one action link rather than being a stub". "Short" and "one action link
each" did not move, and they are the halves doing the deliverability work.

**Four things are asserted and the fourth is the one an implementation is
likeliest to get wrong.** That both parts exist. That neither carries a second
link, which is the rule an unsubscribe footer or a "view in browser" line would
break and which item 32 leans on when it rules the orientation footer onto the
invitations: a promotional line could pull in an unsubscribe requirement, and
that would be a second link. That the one link is the same in both. And that
the text part is not a stub: every word of the HTML part's heading and body
reaches it, so the two say the same thing rather than the text part saying
"open Dana" beside an HTML part that says everything.

**And the provider send carries both.** The transport is where a second part
is dropped without anything noticing, since the sink observes the message
rather than the POST body. The last case constructs the transport against a
stubbed fetch, which is `transport.test.ts`'s own discipline: no test here
reaches the network, and 11.8 forbids a test process from sending.

Spec: 10.7 (as amended), 11.8, 11.10.
*/
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

import { startAuthTestApp, visibleText } from './auth-harness.js'
import type { AuthTestApp, OutboundEmail } from './auth-harness.js'
import {
  APP_ORIGIN,
  EmailCast,
  deliverReminder,
  linksIn,
  renderedOf,
  urlsIn,
} from './email-harness.js'
import type { OutboundMessage } from '../src/server/notify/index.js'
import { createResendTransport } from '../src/server/notify/resend.js'

let app: AuthTestApp
const cast = new EmailCast('parts')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

/*
The words of a part, lowercased, as a set.

**Why words and not sentences.** The first shape of this case split the HTML
part's visible text into sentences and required each one in the text part. It
was wrong and would have failed a correct implementation: stripping tags joins
adjacent elements into one run, so "Shared folder, From Hassan" and the action
label and the first words of the footer arrive as a single "sentence" that no
correctly written text part contains, while the sentences that are really
sentences pass trivially. What 10.7's amended rule actually says is that the
text part must say the same thing rather than be a stub, and a word set is the
honest measure of that: a stub drops nearly every word, and a faithful
alternative drops none. Corrected under persona 11 before the implementation
was written, which is the only time a criterion may be corrected at all.
*/
function wordsOf(part: string): Set<string> {
  return new Set(part.toLowerCase().match(/[a-z][a-z']{2,}/g) ?? [])
}

describe('AC-251: every transactional email is two parts carrying one link', () => {
  test('AC-251: each of the four renders both parts', async () => {
    const staged = await cast.of(app)
    for (const email of staged.all) {
      const parts = renderedOf(email)
      expect(
        parts.html.length,
        `10.7 as amended: the ${email.template} template must render an HTML part; a send that carries text alone no longer meets the section`,
      ).toBeGreaterThan(0)
      expect(
        parts.text.length,
        `10.7 as amended: the text/plain alternative is required on ${email.template}, not optional`,
      ).toBeGreaterThan(0)
      expect(
        parts.subject.length,
        `every template names its subject (${email.template})`,
      ).toBeGreaterThan(0)
    }
  })

  test('AC-251: each part carries exactly one action link, and it is the same link', async () => {
    const staged = await cast.of(app)
    for (const email of staged.all) {
      const parts = renderedOf(email)
      const hrefs = linksIn(parts.html)
      expect(
        hrefs,
        `10.7: one action link each, and the ${email.template} HTML part carries ${String(hrefs.length)}`,
      ).toHaveLength(1)
      const urls = urlsIn(parts.text)
      expect(
        urls,
        `10.7: the text part carries the same one link and no second one (${email.template})`,
      ).toHaveLength(1)
      expect(
        urls[0],
        `10.7 as amended: the text part's link is the HTML part's link (${email.template})`,
      ).toBe(hrefs[0])
      expect(
        String(hrefs[0]).startsWith(`${APP_ORIGIN}/`),
        `the action link is built from this deployment's origin (${email.template})`,
      ).toBe(true)
    }
  })

  test('AC-251 adversarial: the text part is not a stub beside a richer HTML part', async () => {
    const staged = await cast.of(app)
    for (const email of staged.all) {
      const parts = renderedOf(email)
      const spoken = wordsOf(visibleText(parts.html))
      const written = wordsOf(parts.text)
      const missing = [...spoken].filter((word) => !written.has(word))
      expect(
        missing,
        `10.7 as amended: the text part must say the same thing as the HTML part rather than being a stub, and ${email.template}'s text part is missing words the HTML part shows`,
      ).toEqual([])
      expect(
        spoken.size,
        `and the HTML part is a message rather than a link with a button on it (${email.template})`,
      ).toBeGreaterThan(15)
    }
  })

  test('AC-251 adversarial: a value a person typed is escaped into the HTML part', async () => {
    const staged = await cast.of(app)
    const email = await deliverReminder(app, staged, {
      title: '<script>alert("titles are user input")</script>',
    })
    const parts = renderedOf(email)
    expect(
      parts.html,
      'a task title is a person\'s own words, and the day one of them carries markup must not be the day an email client runs it',
    ).not.toContain('<script>')
    expect(
      parts.html,
      'the escaped form is what an email client draws, which is the title as it was typed',
    ).toContain('&lt;script&gt;')
    expect(
      parts.text,
      'and the text part carries it raw, being text',
    ).toContain('<script>')
    expect(
      parts.html.toLowerCase().includes('<!doctype'),
      'the HTML part is a whole document, which is what an email client is handed',
    ).toBe(true)
  })

  test('AC-251: the provider send carries both parts', async () => {
    const staged = await cast.of(app)
    const calls: { body: unknown }[] = []
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      calls.push({ body: JSON.parse(String(init.body)) })
      return Promise.resolve(new Response(null, { status: 200 }))
    })
    try {
      const transport = createResendTransport({
        apiKey: 'a-key-that-reaches-no-network',
        from: 'noreply@dana.example',
        appOrigin: APP_ORIGIN,
      })
      for (const email of staged.all) {
        await transport.send(email.raw as OutboundMessage)
      }
    } finally {
      vi.unstubAllGlobals()
    }

    expect(calls.length, 'one POST per message').toBe(staged.all.length)
    staged.all.forEach((email: OutboundEmail, index: number) => {
      const body = calls[index]?.body as Record<string, unknown>
      expect(
        typeof body.html,
        `10.7 as amended: the ${email.template} send carries its HTML part to the provider`,
      ).toBe('string')
      expect(
        typeof body.text,
        `10.7 as amended: and its text/plain alternative beside it (${email.template})`,
      ).toBe('string')
      expect(
        urlsIn(String(body.text)),
        `and the one link survives the send (${email.template})`,
      ).toHaveLength(1)
    })
  })
})
