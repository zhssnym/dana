/*
The two 9.2 refusal pages the OAuth callback renders (it answers a browser, so
JSON would show as text). Every interpolated value is escaped, even literals.
Styles are inline with tokens.css values written out, because this page loads
no client bundle.
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
  /** A second, quieter action; the unverified page has none. */
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

/** 9.2 verbatim. */
export function unverifiedEmailPage(): string {
  return page(
    "We can't sign you in yet",
    "We can't sign you in yet",
    "Your Google email address isn't verified. Dana uses your email for sharing and invites, so it needs Google to confirm it first. Verify your email with Google, then try again.",
    'Back to Dana',
  )
}

/*
9.2 verbatim. Saying an account exists is not a disclosure here: only someone
who completed the handshake, with Google vouching they own the mailbox, can
see it. It names nothing else about the account.
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

/* Every other refusal returns to the landing page with this marker; section 9
   owns all user-facing words. */
export const SIGN_IN_FAILED_TARGET = '/?signin=failed'

