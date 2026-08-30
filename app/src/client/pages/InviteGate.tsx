/*
9.8's invite gate: "when Q12 is non-empty, the pending invites render in place
of the application rather than inside it. It is one screen, headed
'Invitations', carrying each invite as a row reading 'Hassan invited you to
Wedding' (or 'Hassan invited you to connect') with Accept and Decline; the
sidebar, the page beneath and the rest of the chrome are not rendered."

The designer's `src/screens/public-auth-screen.tsx` `InviteGateScreen`, ported
at P8R session R10 onto our invite hooks. What replaced the P8 surface is the
owner's ruling of 2026-08-13 recording the designer's DES-081, and the ruling's
own argument is why this is a screen rather than a section: "this section says
the invites render before anything else, and a section at the top of one page
is before anything else only for a person who happens to be looking at that
page, while a gate is what that phrase plainly says".

**Where the gate is mounted is `shell/app-shell.tsx`, not a route**, and that
file carries the reasoning. This component only knows how to draw the screen.

**His rows are `article` elements and these are list items.** Measured on the
running prototype on 2026-08-13: `article "Hassan invited you to Wedding"`,
twice. AC-172 addresses a row as a list item or a table row, which is 9.1's
roles table read the way it reads a task row, and the ruling's own sentence
says the rows are "addressed the way a task row's controls are addressed, from
the row's own sentence". An `article` is neither shape, so the list is a list.

**The gate is a region with no name, deliberately.** 9.1's sections rule takes
a region's name from the heading this section gives it or from the datum it is
generated from, and this list has neither: it is one list rather than one per
folder. What tells two Accepts apart is the row's own sentence, which is what
that sentence is for.

**The two global states are here and the rest of the chrome is not.** 9.8 says
the sidebar, the page beneath and the rest of the chrome are not rendered, and
they are not: no sidebar, no page strip, no floating add button, no search. The
offline banner and the toast region come with the gate because they are not
navigation, they are what this application says when a write cannot be made or
did not land, and both of this screen's controls are writes. A gate that
answered a failed Accept with nothing would be the one surface in Dana where a
failure is silent.

**Nothing here fetches.** The rows arrive as a prop from the shell that read
them, which is this client's settled rule.
*/
import { useNavigate } from 'react-router'
import { FolderOpen, UserRoundPlus } from 'lucide-react'

import type { PendingInvite } from '../../shared/invites.js'
import { useAcceptInvite, useDeclineInvite } from '../api/mutations.js'
import { Badge } from '../components/ui/badge.js'
import { Button } from '../components/ui/button.js'
import { inviteRowDisplay } from '../parts/presenters.js'
import { paths } from '../routes.js'
import { PersonFace } from '../components/person-face.js'
import { DanaMark } from '../components/dana-mark.js'

/** His eyebrow above the heading, which names no control and states the rule. */
const EYEBROW = 'Before you continue'

export function InviteGate({
  invites,
}: {
  /** Q12's rows, read by the shell that mounts this. */
  readonly invites: readonly PendingInvite[]
}): React.JSX.Element {
  const accept = useAcceptInvite()
  const decline = useDeclineInvite()
  const navigate = useNavigate()

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-[var(--color-graphite-25)] px-14 py-12">
      <section className="grid min-h-[520px] w-full max-w-[940px] grid-cols-[280px_minmax(0,1fr)] overflow-hidden rounded-[18px] border border-[var(--color-graphite-200)] bg-white shadow-[0_30px_90px_rgb(24_24_27/12%)]">
        <div className="relative overflow-hidden bg-[var(--color-graphite-950)] p-8 text-white">
          <p className="relative z-10 inline-flex items-center gap-3 text-sm font-semibold">
            <DanaMark className="size-9" surface="dark" />
            Dana
          </p>

          {/* The watermark, drawn rather than fetched at S21 (ledger L-141,
              AC-265). Both marks on this panel say `surface="dark"` because
              the panel is graphite-950 and the document is not: `surface`
              names what the mark sits on, which is a fact one can check here,
              rather than which colourway it is, which is a thing one has to
              remember. The watermark drops its plate, as
              `public-auth-screen.tsx:184` does, so it reads as a soft D
              rather than a soft square. It is `pointer-events-none` and has
              no interactive ancestor, so it never plays. */}
          <DanaMark
            className="pointer-events-none absolute top-20 -right-44 size-[440px] opacity-[0.14]"
            surface="dark"
            plate={false}
          />

          {/* The count and its word, which his panel draws large. It is
              `aria-hidden` because the badge beside the heading already says
              how many are pending, and a screen reader announcing a bare
              numeral and then the same count again reads as two facts. */}
          <div
            className="absolute right-8 bottom-8 left-8 border-t border-white/15 pt-5"
            aria-hidden="true"
          >
            <p className="text-[34px] leading-none font-semibold tracking-[-0.04em] tabular-nums">
              {invites.length}
            </p>
            <p className="mt-2 text-xs font-medium tracking-[0.08em] text-[var(--color-graphite-400)] uppercase">
              {invites.length === 1 ? 'Invitation' : 'Invitations'}
            </p>
          </div>
        </div>

        <div className="flex flex-col px-10 py-9">
          <div className="flex items-center gap-3 border-b border-[var(--color-graphite-200)] pb-5">
            <div>
              <p className="text-xs font-semibold tracking-[0.1em] text-[var(--color-graphite-500)] uppercase">
                {EYEBROW}
              </p>
              {/* 9.8: "It is one screen, headed 'Invitations'". */}
              <h1 className="mt-1.5 text-[28px] leading-9 font-semibold tracking-[-0.03em] text-[var(--color-graphite-950)]">
                Invitations
              </h1>
            </div>
            <Badge
              variant="secondary"
              className="ml-auto border border-[var(--color-graphite-200)] bg-[var(--color-graphite-50)] px-2.5 text-[var(--color-graphite-600)]"
            >
              {invites.length} pending
            </Badge>
          </div>

          <ul role="list" className="divide-y divide-[var(--color-graphite-200)]">
            {invites.map((invite) => {
              const row = inviteRowDisplay(invite)
              return (
                <li
                  key={row.id}
                  className="grid min-h-[116px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3.5 py-5"
                >
                  <PersonFace name={row.inviter} initials={row.initials} className="size-8" />

                  <div className="min-w-0">
                    {/* 9.8's sentence, one text run, which is what tells a
                        reader and a test which Accept belongs to which
                        invite. */}
                    <p className="truncate text-sm font-medium text-[var(--color-graphite-900)]">
                      {row.sentence}
                    </p>
                    <p className="mt-2 flex items-center gap-2 text-xs text-[var(--color-graphite-500)]">
                      {row.isFolder ? (
                        <>
                          <FolderOpen className="size-4" strokeWidth={1.75} aria-hidden="true" />
                          Shared folder
                        </>
                      ) : (
                        <>
                          <UserRoundPlus
                            className="size-4"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          Connection
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      className="h-8 border-[var(--color-graphite-300)] bg-white px-3.5 text-xs shadow-none hover:bg-[var(--color-graphite-50)]"
                      disabled={decline.isPending}
                      onClick={() => {
                        decline.mutate(row.id)
                      }}
                    >
                      Decline
                    </Button>
                    <Button
                      className="h-8 bg-[var(--color-graphite-950)] px-3.5 text-xs text-white shadow-none hover:bg-[var(--color-graphite-800)]"
                      disabled={accept.isPending}
                      onClick={() => {
                        accept.mutate(row.id, {
                          onSuccess: (result) => {
                            // 9.8: accepting a folder invite lands inside that
                            // folder. 7.5 answers the full Folder object for
                            // exactly this, so the navigation needs no second
                            // read. A bare invite grants no folder and answers
                            // null, and the gate simply loses a row.
                            if (result.folder !== null) {
                              void navigate(paths.folder(result.folder.id))
                            }
                          },
                        })
                      }}
                    >
                      Accept
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </section>
    </main>
  )
}
