/*
 * The public page at `/` (spec 9.2). Name no capability Dana does not ship, and claim no AI (AC-159). "Continue
 * with Google" is a link carrying the detected timezone to the auth endpoint.
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

/* Dev server only: in production the server answers a signed-in `/` with a 302. */
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
  /* The auth callback returns here with ?signin=failed on any refusal but the unverified page. */
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
