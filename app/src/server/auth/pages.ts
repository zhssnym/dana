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

/*
There is deliberately no second page here. Every other refusal (a spent or
forged state, a mismatched nonce, a cancelled consent screen) returns to the
landing page carrying ?signin=failed rather than rendering copy this module
would have to invent: section 9 owns every user-facing word, and 9.2 is the
only page it gives the callback. 11.1 says the same thing from the other side,
that the server renders nothing but the landing page and JSON. The marker is
the landing page's cue to say whatever section 9 eventually decides it says.
*/
export const SIGN_IN_FAILED_TARGET = '/?signin=failed'
