/*
9.2's public page, at `/`.

**Calm and short**: one headline, one sentence, one sign-in control, the line
9.2 spells under it, and a footer. No product mockups: pictures of screens drift
from the screens, and a landing page that pictures an app Dana no longer draws is
the claim rule failing by illustration. No rotating words, no scroll-in.

**The claim rule is the one to watch, and it is broken by addition.** 9.2 says
the page may name no capability Dana does not ship, and no copy claims AI
(AC-159). The sentence names folders and says the work is shared.

**There is one "Continue with Google", and it is a link.** It carries the
viewer's detected timezone to 7.1's authorisation endpoint, which is how a
first session gets a timezone before any row exists to hold one, and a link is
what makes that destination visible, bookmarkable and reachable without
scripting. The page is one screen tall, so no header "Sign in" is needed to keep
the path in reach.

The copyright year is computed rather than typed, so the line is never wrong.

A signed-in visitor goes to `/app` (AC-956, issue #326). The server answers a
signed-in `/` with a 302 before this page is sent (`server/index.ts`); this
check is the fallback for Vite's dev server. It is the `/me` read `main.tsx`
already prefetches, and only a 200 moves anyone. A query string keeps the page,
so `?signin=failed` still says its sentence and `/?about` shows a signed-in
person the page.
*/
import { useEffect } from 'react'

import { useMe } from '../api/queries.js'
import { browserTimezone } from '../api/tz.js'
import { Button } from '../components/ui/button.js'
import { paths } from '../routes.js'
import { SUPPORT_EMAIL } from '../../shared/support.js'
/* The public family's brand link, shared with the legal pages. */
import { DanaIdentity } from './dana-identity.js'

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

export function LandingPage(): React.JSX.Element {
  const signedIn = useMe().isSuccess
  useEffect(() => {
    if (signedIn && window.location.search === '') {
      window.location.replace(paths.today)
    }
  }, [signedIn])
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
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="mx-auto w-full max-w-[672px] px-4 py-5">
        <DanaIdentity />
      </header>

      <main className="flex flex-1 items-center px-4 pb-16">
        <div className="mx-auto w-full max-w-[640px]">
          <h1 className="text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl">
            Your projects, in one quiet place.
          </h1>
          <p className="mt-4 text-base text-muted-foreground">
            Each project is a folder: a page of writing and tasks you work through, shared with the
            people doing it.
          </p>

          {signInFailed ? (
            <p role="status" className="mt-6 text-sm text-destructive">
              Something went wrong. Nothing was saved. Try again.
            </p>
          ) : null}

          <Button className="mt-8 h-10 gap-3 px-4 text-sm" render={<a href={signInHref} />}>
            <GoogleGlyph />
            Continue with Google
          </Button>
          {/* The one string 9.2 spells, written as that section spells it. */}
          <p className="mt-3 text-xs text-muted-foreground">
            Dana requests only your Google profile and email for sign-in, sharing, and invitations.
          </p>
        </div>
      </main>

      <footer className="mx-auto flex w-full max-w-[672px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-6 text-xs text-muted-foreground">
        {/* Computed, so the line does not go stale on 1 January. */}
        <span>© {String(new Date().getFullYear())} Dana Inc · Canada</span>
        <a href="/privacy" className="rounded-sm hover:text-foreground">
          Privacy
        </a>
        <a href="/terms" className="rounded-sm hover:text-foreground">
          Terms
        </a>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="rounded-sm hover:text-foreground">
          Have a question?
        </a>
      </footer>
    </div>
  )
}
