/*
 * Privacy and Terms, outside `/app`. Re-check these facts when the product, a provider or a retention period
 * changes. The export sentence must stay paired with the Settings export control (spec 9.2's claim rule).
 */

const CONTACT = 'hassan.k.shahir [at] gmail [dot] com'

/** The approved copy, section by section, in its own order. */
const PAGE_COPY = {
  privacy: {
    title: 'Privacy',
    updated: 'Updated 7 October 2026',
    sections: [
      {
        heading: 'Who runs Dana',
        body: [
          `Dana is run by Hassan Shahir, who decides how Dana uses your data. Write to ${CONTACT} about anything on this page.`,
        ],
      },
      {
        heading: 'What Dana stores',
        body: [
          "Your Google account's name, email address, and picture, which Dana uses to sign you in and to show teammates who you are.",
          'The work you put in Dana: tasks, steps, notes, folders, files, schedules, reminders, and the people you connect or invite, including the email addresses you invite.',
          'Your device timezone, so dates and reminders mean the same thing to you that they mean to Dana.',
          'Dana holds the network address of a request in memory for a short time to limit abuse. It does not write addresses to its logs.',
        ],
      },
      {
        heading: 'What Dana uses it for',
        body: [
          'Running the product you see: your lists, your calendar, sharing, invitations, and reminder emails. This is the service you ask for when you sign in.',
          'Keeping Dana secure and working: limiting abuse and fixing errors. Dana has a legitimate interest in this.',
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
          'Render hosts the application and its database. Cloudflare R2 stores the files you upload. Resend delivers invitations and reminders. Sentry receives technical failure reports with your content removed. Axiom keeps operational logs for 30 days. Task content and invitation addresses are excluded from error reports and logs.',
          'Some of these providers are in the United States, so your data can be processed outside your country.',
          'Google handles sign-in. Dana never sees your password, and requests only your Google profile and email.',
        ],
      },
      {
        heading: 'Cookies and local storage',
        body: [
          'Dana sets three cookies, and each one is needed for sign-in or security: one keeps you signed in for up to 30 days, one blocks forged requests, and one holds a sign-in for 10 minutes while Google answers.',
          'Your browser also keeps a few things for Dana in its own storage, such as your theme, your calendar zoom, and drafts you have not saved yet.',
          'Dana uses no analytics or advertising cookies, so it does not ask for cookie consent. A video or map that someone adds to a page loads from YouTube, Vimeo, or OpenStreetMap, which can set their own cookies.',
        ],
      },
      {
        heading: 'How long Dana keeps it',
        body: [
          'Your data stays while your account exists. Trash keeps deleted items for 30 days. A session ends 30 days after your last visit. Logs keep events for 30 days.',
          'An invitation keeps the invited address so the person can accept it.',
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
          'Settings carries account deletion behind a typed confirmation. Deleting your account permanently removes your tasks, your files, and your personal data from the running product; short-lived backups age out on their own schedule.',
          'Deleting a folder you own deletes its tasks for every member, and Dana tells you the counts before you confirm.',
          `If someone invited you and you do not use Dana, write to ${CONTACT} and your address will be removed.`,
        ],
      },
      {
        heading: 'Your rights',
        body: [
          'You can see, download, correct, and delete your data in Dana. You can also ask by email for a copy, a correction, or a deletion, or object to how Dana uses your data. A person answers within 30 days.',
          'If you live in the EU or the UK, you can also complain to your data protection authority.',
        ],
      },
      {
        heading: 'Children',
        body: [
          `Dana is not for children under 13. If you think a child under 13 gave Dana data, write to ${CONTACT} and it will be deleted.`,
        ],
      },
      {
        heading: 'Changes',
        body: ['Dana updates this page before it changes how it uses your data, and shows the date at the top.'],
      },
      {
        heading: 'Questions',
        body: [`Write to ${CONTACT} and a person will answer.`],
      },
    ],
  },
  terms: {
    title: 'Terms',
    updated: 'Updated 7 October 2026',
    sections: [
      {
        heading: 'The deal',
        body: [
          // "an Inbox" in the approved draft; the default folder is Desk.
          'Dana is a collaborative to-do product run by Hassan Shahir. By signing in with your Google account you get an account, a Desk, and these terms.',
        ],
      },
      {
        heading: 'Who can use Dana',
        body: ['You must be at least 13, and old enough in your country to accept these terms yourself.'],
      },
      {
        heading: 'Price',
        body: [
          'Dana is free. There are no fees and no hidden charges, so there is nothing to refund. If Dana ever charges for something, it will show the price and the refund rules before you choose to pay.',
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
          'As far as the law allows, Dana is not liable for indirect losses or for lost data. Nothing in these terms takes away rights that the law of your country gives you.',
        ],
      },
      {
        heading: 'Leaving',
        body: [
          'You can delete your account any time in Settings, which removes your data as the Privacy page describes. These terms end when your account does.',
          'If Dana closes, it will email you at least 30 days before, so you can download your data.',
        ],
      },
      {
        heading: 'Questions',
        body: [`Write to ${CONTACT} and a person will answer.`],
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
