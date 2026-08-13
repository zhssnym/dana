/*
The two pages the callback can answer with. A refusal reaches a person in a
browser, not a client that reads JSON: the callback is a redirect target, so
the section 7.0 error envelope would arrive as text on a blank screen.

The unverified-email copy is section 9.2, normative and reproduced exactly.
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
with the client bundle this page deliberately does not load.
*/
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function page(title: string, heading: string, body: string, action: string): string {
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
    border-radius: 16px;
    background: #ffffff;
    box-shadow: 0 2px 6px rgb(10 10 10 / 8%), 0 16px 40px rgb(10 10 10 / 16%);
  }
  .brand {
    display: none;
    position: relative;
    flex: 0 0 34%;
    background: #0a0a0a;
    padding: 28px;
    color: #ffffff;
    font-weight: 600;
  }
  @media (min-width: 720px) { .brand { display: block; } }
  .brand-row { display: flex; align-items: center; gap: 10px; font-size: 14px; }
  .brand img { width: 28px; height: 28px; }
  .brand .watermark {
    position: absolute;
    right: -120px;
    bottom: -80px;
    width: 380px;
    height: 380px;
    opacity: 0.16;
  }
  .content {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: clamp(32px, 6vw, 64px);
  }
  .badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: 12px;
    border: 1px solid #ebecee;
    background: #fafafb;
    color: #585a60;
  }
  h1 {
    margin-top: 28px;
    font-size: 32px;
    line-height: 40px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: #1b1c20;
  }
  p {
    margin-top: 16px;
    max-width: 46ch;
    color: #585a60;
    font-size: 15px;
    line-height: 24px;
  }
  .action { margin-top: 32px; }
  .action a {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    height: 44px;
    padding: 0 20px;
    border-radius: 8px;
    background: #0a0a0a;
    color: #ffffff;
    font-size: 14px;
    font-weight: 600;
    text-decoration: none;
  }
  .action a:hover { background: #2f3136; }
  .action a:focus-visible {
    outline: 2px solid #3c5bbf;
    outline-offset: 2px;
  }
</style>
</head>
<body>
<main>
<aside class="brand" aria-hidden="true">
  <div class="brand-row"><img src="/dana-mark.svg" alt=""> Dana</div>
  <img class="watermark" src="/dana-mark.svg" alt="">
</aside>
<section class="content">
<div class="badge" aria-hidden="true">
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
</div>
<h1>${escapeHtml(heading)}</h1>
<p>${escapeHtml(body)}</p>
<p class="action"><a href="/"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>${escapeHtml(action)}</a></p>
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
There is deliberately no second page here. Every other refusal (a spent or
forged state, a mismatched nonce, a cancelled consent screen) returns to the
landing page carrying ?signin=failed rather than rendering copy this module
would have to invent: section 9 owns every user-facing word, and 9.2 is the
only page it gives the callback. The marker is the landing page's cue to say
whatever section 9 eventually decides it says; since the polish pass the
landing answers it with 9.1's global failure sentence.
*/
export const SIGN_IN_FAILED_TARGET = '/?signin=failed'
