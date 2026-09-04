/*
Privacy and Terms, the two public pages the landing footer has always linked
and production has never had (DES-032, AC-240).

Ported from `docs/design/prototype-v2/src/screens/public-legal-screen.tsx`,
which 11.13 makes the source this is built from rather than a reference it is
compared against. The layout, the section order and the copy are that file's;
three things are this client's and each is named here, because a port that
changes something silently is the defect item 20 exists to stop.

**The addresses.** The prototype is one application addressed by `?view=`, so
its brand link points at `?view=landing` and its footer at `?view=privacy`.
Dana's are `/`, `/privacy` and `/terms`, which is what the landing footer has
claimed since S13 and what Google's OAuth consent configuration and 8.10's
deletion text both need to resolve. They are not rows of 9.1's route table:
that table is the application's, these pages sit outside `/app` and outside
AC-239's redirect, and RFC 0005's change control carries the reading, on the
`saved-views.ts` precedent for a route that table does not name.

**One word of the approved copy moved, and it moved because the product
did.** Terms said "you get an account, an Inbox, and these terms". RFC 0005
renamed the default folder to Desk and S2 migrated the data; the prototype
file's own header requires exactly this, that "facts stated here were taken
from the shipping product ... and must be re-verified at the port if any of
that moves". The other facts it lists were re-verified and none of them has:
Google sign-in only (11.6), folder sharing (5.3), Resend email (11.8),
sanitized Sentry errors and 30-day Axiom logs (11.12, 10.5), and hard
deletion behind a typed DELETE (8.10, 9.7).

**Approval, because DES-032's row and the prototype disagree and a session
may not pick.** The design contract's table still reads "DES-032 | Privacy
and terms destinations | OPEN | Before Session 7", which is the v1 row.
`docs/design/v2-decisions.md` records the answer in the same register's own
words: DES-032 is "**closed in v2**: pages drafted and approved 2026-08-17,
still to be routed in production", and this file's source carries Imran's
approval of the copy with its date and his sentence. So what was open is the
routing, and the routing is this package. Nothing here is invented.

**A fourth departure, and it is an addition rather than a move: the section
"Taking your data with you" (issue #162, 2026-09-04).** The prototype has no
such section, because when it was drawn Dana had no export. 7.22 gives it one
and 9.7 now carries the control, so the page that tells a person what Dana
holds about them can tell them how to take it. It sits immediately before
"Deleting your data" because the two are one pair in the order a person does
them, take it and then remove it, and because 10.9 records that the Google
APIs Terms of Service clause this satisfies is about portability rather than
about erasure. Its sentence names Settings, which is where the control is,
rather than the endpoint, which is not a thing to hand a person.

9.2's no-capability-claim rule applies to every public page and is met, but
no longer by construction, and the difference is worth stating rather than
leaving for a reader to notice. Every other sentence below states what Dana
stores, uses, or does not do, and claims no feature. The export sentence
claims one. It is admissible because that rule forbids copy that "promises,
implies or previews a capability Dana does not ship", and this one ships:
`GET /api/v1/me/export` is 7.22 and the Settings row reaching it lands in the
same change as this sentence. **A page carrying that sentence with no control
behind it would break the rule**, so the two are never separated.
*/
import { Link } from 'react-router'

import { DanaIdentity } from './dana-identity.js'

/** DES-032's approved copy, section by section, in its own order. */
const PAGE_COPY = {
  privacy: {
    title: 'Privacy',
    updated: 'Updated 17 August 2026',
    sections: [
      {
        heading: 'What Dana stores',
        body: [
          "Your Google account's name, email address, and picture, which Dana uses to sign you in and to show teammates who you are.",
          'The work you put in Dana: tasks, steps, notes, folders, schedules, reminders, and the people you connect or invite, including the email addresses you invite.',
          'Your device timezone, so dates and reminders mean the same thing to you that they mean to Dana.',
        ],
      },
      {
        heading: 'What Dana uses it for',
        body: [
          'Running the product you see: your lists, your calendar, sharing, invitations, and reminder emails. Nothing else.',
          'Dana shows your name and email to people you share a folder with, connect with, or invite; that is what sharing means here.',
        ],
      },
      {
        heading: 'What Dana does not do',
        body: [
          'No advertising, no selling or renting your data, no tracking you across other sites, and no training AI models on your content.',
        ],
      },
      {
        heading: 'Who helps run Dana',
        body: [
          'Dana runs on rented infrastructure and uses a small set of service providers: hosting for the application and its database, an email service that delivers invitations and reminders, an error-reporting service that receives technical failure reports with your content removed, and a log service that keeps operational events for 30 days. Task content and invitation addresses are excluded from error reports and logs.',
          'Google handles sign-in. Dana never sees your password.',
        ],
      },
      {
        heading: 'Taking your data with you',
        body: [
          'You can download everything Dana holds about you at any time, as a single JSON file, from your Settings page.',
        ],
      },
      {
        heading: 'Deleting your data',
        body: [
          'Settings carries account deletion behind a typed confirmation. Deleting your account permanently removes your tasks and your personal data from the running product; short-lived backups age out on their own schedule.',
          'Deleting a folder you own deletes its tasks for every member, and Dana tells you the counts before you confirm.',
        ],
      },
      {
        heading: 'Questions',
        body: ['Write to support.danadana@gmail.com and a person will answer.'],
      },
    ],
  },
  terms: {
    title: 'Terms',
    updated: 'Updated 17 August 2026',
    sections: [
      {
        heading: 'The deal',
        body: [
          // "an Inbox" in the approved draft; see the header for why it is Desk.
          'Dana is a collaborative to-do product. By signing in with your Google account you get an account, a Desk, and these terms.',
        ],
      },
      {
        heading: 'Your content is yours',
        body: [
          'Tasks, notes, and folders you create belong to you. Dana stores and displays them only to run the product, and shows them only to you and to members of folders you share.',
        ],
      },
      {
        heading: 'Sharing is folder-shaped',
        body: [
          'A folder is the unit of sharing. Every member of a folder can see and work with everything in it. Share a folder only with people you want to see its contents.',
        ],
      },
      {
        heading: 'Fair use',
        body: [
          "Don't use Dana to break the law, to spam people with invitations, or to attack the service. Dana rate-limits abuse and may suspend accounts that harm the service or other people.",
        ],
      },
      {
        heading: 'The service, honestly',
        body: [
          'Dana is provided as-is, without warranties. It aims to be reliable and sometimes will not be. Dana may change or add features; anything that changes what these terms mean will update this page first.',
        ],
      },
      {
        heading: 'Leaving',
        body: [
          'You can delete your account any time in Settings, which removes your data as the Privacy page describes. These terms end when your account does.',
        ],
      },
      {
        heading: 'Questions',
        body: ['Write to support.danadana@gmail.com and a person will answer.'],
      },
    ],
  },
} as const

export type LegalPageName = keyof typeof PAGE_COPY

export function LegalPage({ page }: { readonly page: LegalPageName }): React.JSX.Element {
  const copy = PAGE_COPY[page]
  return (
    <div className="min-h-screen bg-[var(--color-graphite-25)] text-[var(--color-graphite-800)]">
      <div className="mx-auto flex max-w-[640px] flex-col px-6 py-10">
        <header className="flex items-center">
          <DanaIdentity />
        </header>

        <main className="mt-12">
          <h1 className="text-[28px] leading-9 font-semibold text-[var(--color-graphite-900)]">
            {copy.title}
          </h1>
          <p className="mt-2 text-[13px] text-[var(--color-graphite-500)]">{copy.updated}</p>

          <div className="mt-10 flex flex-col gap-8">
            {copy.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-[16px] leading-6 font-semibold text-[var(--color-graphite-900)]">
                  {section.heading}
                </h2>
                <div className="mt-2 flex flex-col gap-2.5">
                  {section.body.map((paragraph) => (
                    <p key={paragraph} className="text-[14px] leading-[22px]">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </main>

        {/* The prototype's own footer, which is how a reader of one page
            reaches the other without going back through the landing. Its
            year is computed here rather than written, which is the landing
            footer's own note: the line must not go stale on 1 January. */}
        <footer className="mt-16 flex items-center gap-5 border-t border-[var(--color-graphite-200)] pt-6 text-xs text-[var(--color-graphite-500)]">
          <span>© {String(new Date().getFullYear())} Dana</span>
          <Link
            to="/privacy"
            className="rounded-sm hover:text-[var(--color-graphite-800)]"
          >
            Privacy
          </Link>
          <Link to="/terms" className="rounded-sm hover:text-[var(--color-graphite-800)]">
            Terms
          </Link>
        </footer>
      </div>
    </div>
  )
}
