/*
The pages the callback can answer with. A refusal reaches a person in a
browser, not a client that reads JSON: the callback is a redirect target, so
the section 7.0 error envelope would arrive as text on a blank screen.

There are two of them since 2026-09-03 (issue #17): the unverified email, and
a verified email that already belongs to another account. Both copies are
section 9.2, normative and reproduced exactly.
Every value interpolated into these pages is escaped, even where today's
callers pass literals, because the day one of them passes a provider-supplied
string is the day that rule has to already exist.

The rendering is the designer's gate card, the same composition his invite
gate and his own unverified screen draw: a dark panel carrying the mark, a
light panel carrying the words, one action. It is transcribed as inline CSS
because this page is served without the client bundle and must carry
everything it needs; the colour values are `tokens.css`'s graphite ramp
written out, which that file's rule permits nowhere in the client and cannot
reach here, this being a server template with no stylesheet to import. The
font stack is the token file's fallback run: the self-hosted Inter arrives
with the client bundle this page deliberately does not load. That duplication
is 11.4's rule read rather than broken, and the reading is recorded at RFC
0005 change control item 34 with the `vite.config.ts` precedent it follows.

**Which gate card, corrected at S19.** It was transcribed from the **v1**
prototype at ef6f39a, and change control item 20 moved the standard to
`docs/design/prototype-v2/`, whose counterpart is `public-auth-screen.tsx`'s
`UnverifiedEmailScreen`. Both prototypes are deleted (`a7886df`, 2026-09-01)
and are in git history before that commit. Measured against it rather than
assumed: the two already agreed on the 940 by 520 frame, the 320 pixel dark panel, the 48 pixel
icon tile at radius 12, the 44 pixel action at 20 pixels of side padding, and
every colour. Nine values were v1's and are now v2's: the card's radius,
border and shadow, the dark panel's padding and its closing hairline, the
mark's size, the tile's border step and shadow, the heading's size, tracking
and colour, the body's leading, and the action's weight. 9.2's copy did not
move a character, which is what keeps this inside this role: 9.2 is the
Frontend Architect's section, and only the presentation moved. `pages.test.ts`
beside this file pins the nine so a third transcription cannot quietly undo
them.
*/
import { SUPPORT_EMAIL } from '../../shared/support.js'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

interface Support {
  href: string
  label: string
}

function page(
  title: string,
  heading: string,
  body: string,
  action: string,
  /** A second, quieter action. The unverified page has none, which is why
   * this is optional rather than a second required argument. */
  support?: Support,
): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  html { background: #fafafb; }
  body {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #2f3136;
    font-size: 14px;
    line-height: 20px;
    -webkit-font-smoothing: antialiased;
  }
  main {
    display: flex;
    width: min(940px, 100%);
    min-height: 520px;
    overflow: hidden;
    border-radius: 18px;
    border: 1px solid #dddee2;
    background: #ffffff;
    box-shadow: 0 30px 90px rgb(24 24 27 / 12%);
  }
  .brand {
    display: none;
    position: relative;
    flex: 0 0 320px;
    background: #0a0a0a;
    padding: 36px;
    color: #ffffff;
    font-weight: 600;
  }
  @media (min-width: 720px) { .brand { display: block; } }
  .brand-row { display: flex; align-items: center; gap: 12px; font-size: 14px; }
  .brand img { width: 36px; height: 36px; }
  .brand .watermark {
    position: absolute;
    top: 80px;
    right: -160px;
    width: 440px;
    height: 440px;
    opacity: 0.14;
  }
  /* The v2 panel closes on a hairline rather than on nothing. */
  .brand .rule {
    position: absolute;
    right: 36px;
    bottom: 36px;
    left: 36px;
    height: 1px;
    background: rgb(255 255 255 / 15%);
  }
  .content {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: clamp(32px, 6vw, 64px) clamp(28px, 5vw, 56px);
  }
  .badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: 12px;
    border: 1px solid #dddee2;
    background: #fafafb;
    color: #44464c;
    box-shadow: 0 6px 18px rgb(24 24 27 / 7%);
  }
  h1 {
    margin-top: 28px;
    font-size: 36px;
    line-height: 41px;
    font-weight: 600;
    letter-spacing: -0.035em;
    color: #0a0a0a;
  }
  p {
    margin-top: 20px;
    max-width: 46ch;
    color: #585a60;
    font-size: 15px;
    line-height: 28px;
  }
  .action { margin-top: 32px; }
  .action a {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    height: 44px;
    padding: 0 20px;
    border-radius: 6px;
    background: #0a0a0a;
    color: #ffffff;
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
  }
  .action a:hover { background: #2f3136; }
  .action a:focus-visible {
    outline: 2px solid #3c5bbf;
    outline-offset: 2px;
  }
  /* The second action, where a page has one: the same control at rest, in
     the card's own hairline rather than in the mark's black, so that one
     page never offers two things that look equally like the way out. */
  .action a.support {
    margin-left: 10px;
    border: 1px solid #dddee2;
    background: #ffffff;
    color: #2f3136;
  }
  .action a.support:hover { background: #fafafb; }
</style>
</head>
<body>
<main>
<aside class="brand" aria-hidden="true">
  <div class="brand-row"><img src="/dana-mark.svg" alt=""> Dana</div>
  <img class="watermark" src="/dana-mark.svg" alt="">
  <div class="rule"></div>
</aside>
<section class="content">
<div class="badge" aria-hidden="true">
  <!-- lucide mail-warning, which is the glyph the v2 screen draws here; the
       v1 card drew a plain envelope. -->
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10.5V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h12.5"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="M20 14v4"/><path d="M20 21v.01"/></svg>
</div>
<h1>${escapeHtml(heading)}</h1>
<p>${escapeHtml(body)}</p>
<p class="action"><a href="/"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>${escapeHtml(action)}</a>${
    support === undefined
      ? ''
      : `<a class="support" href="${escapeHtml(support.href)}">${escapeHtml(support.label)}</a>`
  }</p>
</section>
</main>
</body>
</html>
`
}

/** Section 9.2, verbatim: heading, body, and one action back to the landing page. */
export function unverifiedEmailPage(): string {
  return page(
    "We can't sign you in yet",
    "We can't sign you in yet",
    "Your Google email address isn't verified. Dana uses your email for sharing and invites, so it needs Google to confirm it first. Verify your email with Google, then try again.",
    'Back to Dana',
  )
}

/*
The second page, section 9.2 verbatim, added 2026-09-03 for issue #17.

**What it says and what it is careful about.** Imran ruled the words: tell the
person an account already uses this email, ask them to try their original
Google account, and point them at support. The heading and body below are 9.2
and are normative there like every other string in section 9.

**On telling an unauthenticated stranger that an account exists.** It was
weighed and it is not a disclosure, and the reasoning is written here because
the next person to read this page will otherwise reopen it.

Nobody reaches this page without completing the whole handshake: a
state, a nonce and a PKCE verifier, each single-use and bound to a cookie this
origin set, and Google's own assertion that this address is verified and is
theirs. So the only person who can be shown this sentence about an address is
somebody Google has just vouched for as the owner of that mailbox. It cannot
be probed: an attacker who wants to ask "does Dana have an account at this
address" has first to hold a Google account at it, at which point they can
read the mailbox and the answer is not Dana's to keep. That is a stronger
guarantee than a password-reset form gives, and the products that hide this
fact are hiding it from a form anyone can type into.

Against that, the refusal is the one dead end in the product. There is no
password to reset and no second factor to try; the person is holding the wrong
Google account and has no way to be told so. Refusing without saying why costs
a real person their account and buys an attacker nothing, because the attacker
was already the mailbox's owner. So it says why.

**What it still does not say.** Not whose account, not when it was made, not
what name is on it, and not whether the two addresses differ by a Gmail dot.
The sentence is about the address the person themselves just presented and
about nothing else in the database.
*/
export function emailAlreadyClaimedPage(): string {
  return page(
    'This email already has an account',
    'This email already has an account',
    'An account already uses this email address, and Dana never joins two accounts together. Sign in with the Google account you used the first time. If that still does not get you in, write to ' +
      `${SUPPORT_EMAIL} and a person will answer.`,
    'Back to Dana',
    { href: `mailto:${SUPPORT_EMAIL}`, label: 'Email support' },
  )
}

/*
There is deliberately no third page here. Every other refusal (a spent or
forged state, a mismatched nonce, a cancelled consent screen) returns to the
landing page carrying ?signin=failed rather than rendering copy this module
would have to invent: section 9 owns every user-facing word, and it gives the
callback exactly the two pages above. The marker is the landing page's cue to
say whatever section 9 eventually decides it says; since the polish pass the
landing answers it with 9.1's global failure sentence.
*/
export const SIGN_IN_FAILED_TARGET = '/?signin=failed'

