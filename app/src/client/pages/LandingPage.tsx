/*
9.2's public page, at `/`.

**Calm and short**: one headline, one paragraph, one sign-in control, a
personal note with the support address, and Privacy · Terms. No product mockups: pictures of screens drift
from the screens, and a landing page that pictures an app Dana no longer draws is
the claim rule failing by illustration. No rotating words, no scroll-in.

**The claim rule is the one to watch, and it is broken by addition.** 9.2 says
the page may name no capability Dana does not ship, and no copy claims AI
(AC-159). The sentence names pages and says the work is shared.

**There is one "Continue with Google", and it is a link.** It carries the
viewer's detected timezone to 7.1's authorisation endpoint, which is how a
first session gets a timezone before any row exists to hold one, and a link is
what makes that destination visible, bookmarkable and reachable without
scripting. The page is one screen tall, so no header "Sign in" is needed to keep
the path in reach.

The copyright year is computed rather than typed, so the line is never wrong.

A signed-in visitor goes to `/app` (AC-956, issue #326). The server answers a
signed-in `/` with a 302 before this page is sent (`server/index.ts`); this
check is the fallback for Vite's dev server and runs only there, because in a
built app a signed-out visitor's `/me` is a 401 that nobody reads and that
prints a red line in their console. Only a 200 moves anyone. A query string keeps the page,
so `?signin=failed` still says its sentence and `/?about` shows a signed-in
person the page.
*/
import { useEffect } from 'react'

import { useMe } from '../api/queries.js'
import { browserTimezone } from '../api/tz.js'
import { Button } from '../components/ui/button.js'
import { paths } from '../routes.js'
import { obfuscatedEmail } from '../components/obfuscated-email.js'

function GoogleGlyph(): React.JSX.Element {
  return (
    <span
      className="flex size-5 items-center justify-center rounded-full bg-[var(--color-fixed-white)]"
      aria-hidden="true"
    >
      <img src="/google-g.svg" alt="" className="size-4" />
    </span>
  )
}

/* The dev server's stand-in for the server's signed-in 302. */
function SignedInRedirect(): null {
  const signedIn = useMe().isSuccess
  useEffect(() => {
    if (signedIn && window.location.search === '') {
      window.location.replace(paths.today)
    }
  }, [signedIn])
  return null
}

export function LandingPage(): React.JSX.Element {
  const signInHref = `/api/v1/auth/google?tz=${encodeURIComponent(browserTimezone())}`
  /*
  The callback's failure marker (auth/pages.ts): every refusal that is not the
  unverified page returns here carrying ?signin=failed. The sentence is 9.1's
  global failure copy.
  */
  const signInFailed =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('signin') === 'failed'

  return (
    <main className="flex min-h-svh items-center bg-background px-4 py-16 text-foreground">
      {import.meta.env.DEV ? <SignedInRedirect /> : null}
      <div className="mx-auto w-full max-w-[520px]">
        <h1 className="text-[length:var(--text-title-size)] leading-[var(--text-title-line)] font-title text-balance">
          All your work, in one quiet place.
        </h1>
        <div className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground">
          <p>
            Dana helps you plan and run work without juggling multiple tools. Write down what it&apos;s
            for, keep pages and tasks together, and see what&apos;s done and what&apos;s next. Add people
            when the work is shared and discuss it right next to the work itself.
          </p>
          <p>
            We&apos;re building Dana as a bloat-free combination of Notion, GitHub Issues, and
            Slack, giving you the tools you need to move work forward without drowning in
            features you don&apos;t need.
          </p>
          <p>
            Dana is in beta as of October 2026. If you try it, I&apos;d really like to hear what
            works and what doesn&apos;t: {obfuscatedEmail()}
          </p>
        </div>

        {signInFailed ? (
          <p role="status" className="mt-6 text-sm text-destructive">
            Something went wrong. Nothing was saved. Try again.
          </p>
        ) : null}

        <Button className="mt-8 h-10 gap-3 px-4 text-sm" render={<a href={signInHref} />}>
          <GoogleGlyph />
          Continue with Google
        </Button>

        <p className="mt-6 text-xs text-muted-foreground">
          <a href="/privacy" className="rounded-sm hover:text-foreground">
            Privacy
          </a>
          <span aria-hidden="true"> · </span>
          <a href="/terms" className="rounded-sm hover:text-foreground">
            Terms
          </a>
        </p>
      </div>
    </main>
  )
}
