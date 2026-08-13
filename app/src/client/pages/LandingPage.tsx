/*
9.2's public page, at `/`.

The designer's `src/screens/public-auth-screen.tsx` `LandingScreen`, ported at
P8R session R10: his two-column composition, his product preview panel, and
the copy 9.2 now carries as normative.

**The copy is the delta's, character for character, and it is his.** The owner
ruled on 2026-08-13 that the designer's landing copy ships, which reopened
section 13 item 14 and closed it again on the same date against this text; the
constraint that item ever recorded was 9.2's no-AI-claim rule rather than who
held the pen. The seven strings are collected in `COPY` below so that a later
revision is a diff over one block, which is the arrangement the owner's own
copy already had here.

**The subheading's em dash is a comma**, which is RFC 0002's first open
question closed by the owner on the same date: protocol section 7's convention
holds across the whole corpus, including copy adopted from outside it, and the
sentence's meaning is unchanged. His prototype renders the dash; 9.2 does not,
and 9.2 is what this file transcribes.

**Two of the strings are written in capitals here and his are lowercased in the
markup and uppercased in CSS.** The delta writes both in capitals, which is
what his page renders, so writing them out is the transcription rather than a
change to it: the `uppercase` class stays where he put it and is a no-op over
letters that are already capital, and what a test or a screen reader reads off
the document is now the string 9.2 spells rather than the one CSS happens to
transform.

**The sign-in control is one, and it is a link.** 9.2 says a single "Continue
with Google" and AC-159 asserts exactly one, the ordinary way one call to
action becomes two being a hero and a footer; there is no second. It is a link
and not the button his prototype draws, which 9.2 states outright as behaviour
rather than presentation: it carries the viewer's detected timezone to 7.1's
authorisation endpoint, which is how a first session gets a timezone before any
row exists to hold one, and a link is what makes that destination visible,
bookmarkable and reachable with scripting unavailable. AC-159 admits either
role deliberately and does not settle it.

**The claim rule is broken by addition**, so what to watch when this copy
changes is what gets added rather than what is here.
`tests/e2e/ac-159-landing-page.spec.ts` reads the whole rendered body for one,
which is the only way a rule broken by addition can be measured at all.

**Two things of his are not here, and each is named rather than dropped
silently**, which RFC 0002's alternatives section calls this package's most
likely failure.

His footer carries "© 2026 Dana" beside the two links. 9.2 enumerates what this
footer owes, "privacy and terms links", and the delta's copy table transcribes
seven strings from his screen and not that one. A copyright line is a legal
statement no numbered section carries, and the specific one he wrote hardcodes
a year that is wrong in five months, so it is left out rather than invented or
maintained.

His two columns are `minmax(560px,1fr)` and `minmax(620px,1fr)`, which is a
1180px floor by arithmetic rather than by declaration, and section 13 item 32
forbids exactly that number on exactly that ground: it converts the designer's
deferral of a mobile layout into a refusal to render. The floors are
`minmax(0,1fr)` here and nothing else about the grid moves. No breakpoint is
added either, because item 32 also says a mobile layout designed inside this
package would be invention; what that item requires is that a narrow viewport
be no worse after this package than before it, and a column that shrinks rather
than one that scrolls is what satisfies it.

This page renders whether or not there is a session. A client that redirected
signed-in visitors away from `/` would hide the only surface an
unauthenticated person ever sees from everyone who could check it.
*/
import { Check, Folder, FolderOpen, Star, UsersRound } from 'lucide-react'

import { browserTimezone } from '../api/tz.js'
import { Button } from '../components/ui/button.js'

/*
9.2's copy table, transcribed. Normative: design may restyle and not reword,
and this is the one page whose every word that section now spells.
*/
const COPY = {
  eyebrow: 'PERSONAL FOCUS. SHARED PLANS.',
  headingFirst: 'Your tasks, kept clear.',
  headingSecond: 'Your plans, shared.',
  subheading:
    'Dana brings personal tasks and collaborative to-do lists together in ' +
    'clear, shareable folders, so everyone knows what comes next.',
  underSignIn:
    'Dana requests only your Google profile and email for sign-in, sharing, ' +
    'and invitations.',
  previewHeading: 'BUILT AROUND SHAREABLE FOLDERS',
  previewBody: 'One folder keeps every person, task, and decision in context.',
  closingFirst: 'Plan privately.',
  closingSecond: 'Coordinate clearly.',
  closingBody:
    'Keep personal work focused, then share only the folders that need other ' +
    'people.',
} as const

/**
 * One row of the preview panel's folder, which is his illustration of a task
 * row rather than the `TaskRow` this application renders.
 *
 * It is drawn here and not composed from `components/task-row.tsx` on purpose:
 * that component is a control surface with a checkbox, a star and an overflow
 * menu, and every one of them would be a control on a page nobody has signed
 * in to. What 9.2 asks for is a panel "showing a shared folder as the product
 * renders one", so this is a picture of a row and announces itself as one.
 */
function PreviewTask({
  title,
  folder,
  meta,
  important = false,
  complete = false,
}: {
  readonly title: string
  readonly folder: string
  readonly meta: string
  readonly important?: boolean
  readonly complete?: boolean
}): React.JSX.Element {
  return (
    <div className="flex min-h-11 items-center gap-3 border-b border-[var(--color-graphite-100)] last:border-b-0">
      <span
        className={
          complete
            ? 'flex size-5 shrink-0 items-center justify-center rounded-[4px] border border-[var(--color-graphite-700)] bg-[var(--color-graphite-700)] text-white'
            : 'size-5 shrink-0 rounded-[4px] border border-[var(--color-graphite-300)] bg-white'
        }
        aria-hidden="true"
      >
        {complete ? <Check className="size-3.5" strokeWidth={2} /> : null}
      </span>
      <span
        className={
          complete
            ? 'min-w-0 flex-1 truncate text-sm text-[var(--color-graphite-600)]'
            : 'min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-graphite-800)]'
        }
      >
        {title}
      </span>
      {important ? (
        <Star
          className="size-4 shrink-0 fill-[var(--color-graphite-800)] text-[var(--color-graphite-800)]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      ) : null}
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--color-graphite-500)]">
        <Folder
          className="size-4"
          style={{ color: 'var(--color-graphite-900)' }}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        {folder}
      </span>
      <span className="w-16 shrink-0 text-right text-xs text-[var(--color-graphite-500)]">
        {meta}
      </span>
    </div>
  )
}

/** 9.2's product preview panel: a shared folder as the product renders one. */
function ProductPreview(): React.JSX.Element {
  return (
    <div className="relative flex h-full min-h-[620px] items-center justify-center overflow-hidden border-l border-[var(--color-graphite-900)] bg-[var(--color-graphite-950)] px-[clamp(36px,4vw,72px)] py-14">
      <img
        src="/dana-mark.svg"
        alt=""
        className="pointer-events-none absolute -top-36 -right-36 size-[520px] opacity-[0.14]"
      />

      <div className="relative z-10 w-full max-w-[560px]">
        <div className="flex items-center justify-between gap-5 text-[11px] font-semibold tracking-[0.1em] text-[var(--color-graphite-400)] uppercase">
          <span>{COPY.previewHeading}</span>
          <span className="flex items-center gap-2 tracking-normal normal-case">
            <UsersRound className="size-4" strokeWidth={1.75} aria-hidden="true" />
            3 people
          </span>
        </div>

        <div className="mt-9 overflow-hidden rounded-[14px] border border-white/15 bg-white shadow-[0_24px_80px_rgb(0_0_0/45%)]">
          <div className="flex min-h-24 items-center gap-3 border-b border-[var(--color-graphite-200)] px-6">
            <div className="flex size-10 items-center justify-center rounded-[10px] bg-[var(--color-graphite-100)]">
              <FolderOpen
                className="size-5 text-[var(--color-graphite-900)]"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </div>
            <div>
              <p className="text-[11px] font-medium tracking-[0.08em] text-[var(--color-graphite-500)] uppercase">
                Shared folder
              </p>
              <p className="mt-0.5 text-lg font-semibold text-[var(--color-graphite-900)]">
                Wedding
              </p>
            </div>
            <div className="ml-auto flex -space-x-2" aria-hidden="true">
              {[
                ['IW', 'var(--color-folder-cobalt)'],
                ['SK', 'var(--color-folder-rose)'],
                ['HA', 'var(--color-folder-fern)'],
              ].map(([initials, color]) => (
                <span
                  key={initials}
                  className="flex size-8 items-center justify-center rounded-full border-2 border-white text-[10px] font-semibold text-white"
                  style={{ background: color }}
                >
                  {initials}
                </span>
              ))}
            </div>
          </div>

          <div className="px-6 py-4">
            <div className="mb-2 flex items-center justify-between text-xs text-[var(--color-graphite-500)]">
              <span>Today</span>
              <span className="tabular-nums">1 of 4 complete</span>
            </div>
            <div className="border-t border-[var(--color-graphite-200)]">
              <PreviewTask
                title="Confirm the final guest count"
                folder="Wedding"
                meta="Today"
                important
              />
              <PreviewTask title="Review the ceremony timeline" folder="Wedding" meta="2:00 PM" />
              <PreviewTask title="Share the transport plan" folder="Wedding" meta="Today" />
              <PreviewTask title="Send the venue deposit" folder="Wedding" meta="Done" complete />
            </div>
          </div>

          <div className="flex min-h-12 items-center border-t border-[var(--color-graphite-200)] bg-[var(--color-graphite-25)] px-6 text-xs text-[var(--color-graphite-600)]">
            {COPY.previewBody}
          </div>
        </div>

        <div className="mt-9 flex items-end justify-between gap-8">
          {/* The whitespace node between the two sentences is deliberate and P8
              measured why: adjacent block elements concatenate without one, so
              the closing line would read back as a single run with no space
              where 9.2 writes one. It is not laid out, so it costs nothing. */}
          <p className="text-2xl leading-8 font-medium tracking-[-0.025em] text-white">
            {COPY.closingFirst} <br />
            {COPY.closingSecond}
          </p>
          <p className="max-w-[230px] text-xs leading-5 text-[var(--color-graphite-400)]">
            {COPY.closingBody}
          </p>
        </div>
      </div>
    </div>
  )
}

export function LandingPage(): React.JSX.Element {
  const signInHref = `/api/v1/auth/google?tz=${encodeURIComponent(browserTimezone())}`
  return (
    <main className="grid min-h-screen grid-cols-[minmax(0,1fr)_minmax(0,1fr)] bg-white">
      <section className="flex min-h-screen flex-col px-[clamp(48px,5vw,80px)] py-10">
        {/* The mark beside the wordmark, which is the same pairing the sidebar
            header carries once a person is inside. His identity block is a
            link to the page it is already on; ours is the mark and the word,
            because a link to here from here is a control that does nothing. */}
        <p className="inline-flex items-center gap-3 text-sm font-semibold text-[var(--color-graphite-900)]">
          <img src="/dana-mark.svg" alt="" className="size-8" />
          Dana
        </p>

        <div className="my-auto max-w-[600px] py-16">
          <p className="text-xs font-semibold tracking-[0.1em] text-[var(--color-graphite-500)] uppercase">
            {COPY.eyebrow}
          </p>
          <h1 className="mt-5 text-[clamp(46px,4.2vw,62px)] leading-[1.03] font-semibold tracking-[-0.045em]">
            <span className="block text-[var(--color-graphite-950)]">{COPY.headingFirst}</span>{' '}
            <span className="mt-1 block text-[var(--color-graphite-500)]">
              {COPY.headingSecond}
            </span>
          </h1>
          <p className="mt-7 max-w-[46ch] text-base leading-7 text-[var(--color-graphite-600)]">
            {COPY.subheading}
          </p>

          <Button
            className="mt-9 h-11 min-w-56 gap-3 bg-[var(--color-graphite-950)] px-5 text-sm font-medium text-white shadow-none hover:bg-[var(--color-graphite-800)]"
            render={<a href={signInHref} />}
          >
            {/* The Google mark is the control's own, at DES-030's export. It is
                decorative, so the link's accessible name stays the three words
                9.2 fixes and AC-005 asks for. */}
            <span
              className="flex size-5 items-center justify-center rounded-full bg-white"
              aria-hidden="true"
            >
              <img src="/google-g.svg" alt="" className="size-[18px]" />
            </span>
            Continue with Google
          </Button>
          <p className="mt-4 max-w-[44ch] text-xs leading-5 text-[var(--color-graphite-500)]">
            {COPY.underSignIn}
          </p>
        </div>

        <footer className="flex items-center gap-5 text-xs text-[var(--color-graphite-500)]">
          <a
            href="/privacy"
            className="rounded-sm hover:text-[var(--color-graphite-800)] focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
          >
            Privacy
          </a>
          <a
            href="/terms"
            className="rounded-sm hover:text-[var(--color-graphite-800)] focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
          >
            Terms
          </a>
        </footer>
      </section>

      <ProductPreview />
    </main>
  )
}
