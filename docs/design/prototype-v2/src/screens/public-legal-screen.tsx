/*
Privacy and Terms, the two public pages the landing footer has always linked
and production has never had (review B1; DES-032). The layout is the public
family's quiet light page. Imran approved this copy for v1 scope on
2026-08-17 ("fine for now, we'll broaden it once we broaden the product"),
so the draft ribbon is gone; the copy broadens with the product. Facts
stated here were taken from the shipping product (Google sign-in only, folder sharing, Resend email, sanitized
Sentry errors, 30-day Axiom logs, typed-DELETE hard deletion) and must be
re-verified at the port if any of that moves.
*/

const PAGE_COPY = {
  privacy: {
    title: "Privacy",
    updated: "Updated 17 August 2026",
    sections: [
      {
        heading: "What Dana stores",
        body: [
          "Your Google account's name, email address, and picture, which Dana uses to sign you in and to show teammates who you are.",
          "The work you put in Dana: tasks, steps, notes, folders, schedules, reminders, and the people you connect or invite, including the email addresses you invite.",
          "Your device timezone, so dates and reminders mean the same thing to you that they mean to Dana.",
        ],
      },
      {
        heading: "What Dana uses it for",
        body: [
          "Running the product you see: your lists, your calendar, sharing, invitations, and reminder emails. Nothing else.",
          "Dana shows your name and email to people you share a folder with, connect with, or invite; that is what sharing means here.",
        ],
      },
      {
        heading: "What Dana does not do",
        body: [
          "No advertising, no selling or renting your data, no tracking you across other sites, and no training AI models on your content.",
        ],
      },
      {
        heading: "Who helps run Dana",
        body: [
          "Dana runs on rented infrastructure and uses a small set of service providers: hosting for the application and its database, an email service that delivers invitations and reminders, an error-reporting service that receives technical failure reports with your content removed, and a log service that keeps operational events for 30 days. Task content and invitation addresses are excluded from error reports and logs.",
          "Google handles sign-in. Dana never sees your password.",
        ],
      },
      {
        heading: "Deleting your data",
        body: [
          "Settings carries account deletion behind a typed confirmation. Deleting your account permanently removes your tasks and your personal data from the running product; short-lived backups age out on their own schedule.",
          "Deleting a folder you own deletes its tasks for every member, and Dana tells you the counts before you confirm.",
        ],
      },
      {
        heading: "Questions",
        body: [
          "Write to support.danadana@gmail.com and a person will answer.",
        ],
      },
    ],
  },
  terms: {
    title: "Terms",
    updated: "Updated 17 August 2026",
    sections: [
      {
        heading: "The deal",
        body: [
          "Dana is a collaborative to-do product. By signing in with your Google account you get an account, an Inbox, and these terms.",
        ],
      },
      {
        heading: "Your content is yours",
        body: [
          "Tasks, notes, and folders you create belong to you. Dana stores and displays them only to run the product, and shows them only to you and to members of folders you share.",
        ],
      },
      {
        heading: "Sharing is folder-shaped",
        body: [
          "A folder is the unit of sharing. Every member of a folder can see and work with everything in it. Share a folder only with people you want to see its contents.",
        ],
      },
      {
        heading: "Fair use",
        body: [
          "Don't use Dana to break the law, to spam people with invitations, or to attack the service. Dana rate-limits abuse and may suspend accounts that harm the service or other people.",
        ],
      },
      {
        heading: "The service, honestly",
        body: [
          "Dana is provided as-is, without warranties. It aims to be reliable and sometimes will not be. Dana may change or add features; anything that changes what these terms mean will update this page first.",
        ],
      },
      {
        heading: "Leaving",
        body: [
          "You can delete your account any time in Settings, which removes your data as the Privacy page describes. These terms end when your account does.",
        ],
      },
      {
        heading: "Questions",
        body: [
          "Write to support.danadana@gmail.com and a person will answer.",
        ],
      },
    ],
  },
} as const

export type LegalPage = keyof typeof PAGE_COPY

function BrandLink() {
  return (
    <a
      href="?view=landing"
      className="inline-flex items-center gap-3 rounded-md text-sm font-semibold text-[var(--color-graphite-900)] outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
    >
      <img src="/dana-mark.svg" alt="" className="size-8" />
      Dana
    </a>
  )
}

export function PublicLegalScreen({ page }: { page: LegalPage }) {
  const copy = PAGE_COPY[page]
  return (
    <div className="min-h-screen bg-[var(--color-graphite-25)] text-[var(--color-graphite-800)]">
      <div className="mx-auto flex max-w-[640px] flex-col px-6 py-10">
        <header className="flex items-center">
          <BrandLink />
        </header>

        <main className="mt-12">
          <h1 className="text-[28px] leading-9 font-semibold text-[var(--color-graphite-900)]">
            {copy.title}
          </h1>
          <p className="mt-2 text-[13px] text-[var(--color-graphite-500)]">
            {copy.updated}
          </p>

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

        <footer className="mt-16 flex items-center gap-5 border-t border-[var(--color-graphite-200)] pt-6 text-xs text-[var(--color-graphite-500)]">
          <span>© 2026 Dana</span>
          <a href="?view=privacy" className="rounded-sm hover:text-[var(--color-graphite-800)]">
            Privacy
          </a>
          <a href="?view=terms" className="rounded-sm hover:text-[var(--color-graphite-800)]">
            Terms
          </a>
        </footer>
      </div>
    </div>
  )
}
