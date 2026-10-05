/*
 * Privacy and Terms, outside `/app`. The facts here must be re-checked when the product changes. The export
 * sentence must stay paired with the Settings export control (spec 9.2's claim rule).
 */


/** The approved copy, section by section, in its own order. */
const PAGE_COPY = {
  privacy: {
    title: 'Privacy',
    updated: 'Updated 3 October 2026',
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
          'Running the product you see: your lists, your calendar, sharing, invitations, and reminder emails.',
          'Knowing who uses Dana. The people who run Dana can see a list of accounts: each email address, the day it joined, the day it last used Dana, and how many work pages it has. That list shows no page names and nothing you wrote. Dana uses your data for nothing else.',
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
          'Dana requests only your Google profile and email for sign-in, sharing, and invitations.',
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
        body: ['Write to hassan.k.shahir [at] gmail [dot] com and a person will answer.'],
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
          // "an Inbox" in the approved draft; the default folder is Desk.
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
        body: ['Write to hassan.k.shahir [at] gmail [dot] com and a person will answer.'],
      },
    ],
  },
} as const

export type LegalPageName = keyof typeof PAGE_COPY

export function LegalPage({ page }: { readonly page: LegalPageName }): React.JSX.Element {
  const copy = PAGE_COPY[page]
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-[720px] flex-col px-4 py-5 sm:px-8">
        <main className="mt-12">
          <h1 className="text-[length:var(--text-title-size)] leading-[var(--text-title-line)] font-title text-foreground">
            {copy.title}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">{copy.updated}</p>

          <div className="mt-10 flex flex-col gap-8">
            {copy.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-sm font-section text-foreground">
                  {section.heading}
                </h2>
                <div className="mt-2 flex flex-col gap-2.5">
                  {section.body.map((paragraph) => (
                    <p key={paragraph} className="text-sm">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </main>

      </div>
    </div>
  )
}
