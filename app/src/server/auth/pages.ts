/*
The two pages the callback can answer with. A refusal reaches a person in a
browser, not a client that reads JSON: the callback is a redirect target, so
the section 7.0 error envelope would arrive as text on a blank screen.

The unverified-email copy is section 9.2, normative and reproduced exactly.
Every value interpolated into these pages is escaped, even where today's
callers pass literals, because the day one of them passes a provider-supplied
string is the day that rule has to already exist.
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
</head>
<body>
<main>
<h1>${escapeHtml(heading)}</h1>
<p>${escapeHtml(body)}</p>
<p><a href="/">${escapeHtml(action)}</a></p>
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

/**
 * Every other refusal: a spent or forged state, a mismatched nonce, a
 * cancelled consent screen. The copy is deliberately incurious, because the
 * person reading it did nothing wrong in the cases they will actually see,
 * and the ones they will not see are attacks that deserve no diagnostics.
 */
export function signInFailedPage(): string {
  return page(
    'Sign-in failed',
    'Sign-in failed',
    'We could not complete your sign-in. Please try again.',
    'Back to Dana',
  )
}
