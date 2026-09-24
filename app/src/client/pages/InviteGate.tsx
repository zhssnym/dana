/*
9.8's invite gate: "when Q12 is non-empty, the pending invites render in place
of the application rather than inside it. It is one screen, headed
'Invitations', carrying each invite as a row reading 'Hassan invited you to
Wedding' (or 'Hassan invited you to connect') with Accept and Decline; the
sidebar, the page beneath and the rest of the chrome are not rendered."

The designer's `src/screens/public-auth-screen.tsx` `InviteGateScreen`, ported
onto our invite hooks. It is a screen rather than a section because "this section says
the invites render before anything else, and a section at the top of one page
is before anything else only for a person who happens to be looking at that
page, while a gate is what that phrase plainly says".

**Where the gate is mounted is `shell/app-shell.tsx`, not a route**, and that
file carries the reasoning. This component only knows how to draw the screen.

**His rows are `article` elements and these are list items.** Measured on the
running prototype on 2026-08-13: `article "Hassan invited you to Wedding"`,
twice. AC-172 addresses a row as a list item or a table row, which is 9.1's
roles table read the way it reads a task row, and 9.8
says the rows are "addressed the way a task row's controls are addressed, from
the row's own sentence". An `article` is neither shape, so the list is a list.

**The gate is a region with no name, deliberately.** 9.1's sections rule takes
a region's name from the heading this section gives it or from the datum it is
generated from, and this list has neither: it is one list rather than one per
folder. What tells two Accepts apart is the row's own sentence, which is what
that sentence is for.

**One calm column, no brand panel.** The design's dark panel repeated the
count the heading already carries; the screen is the mark, the heading and
the rows.

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

import type { PendingInvite } from '../../shared/invites.js'
import { useAcceptInvite, useDeclineInvite } from '../api/mutations.js'
import { Button } from '../components/ui/button.js'
import { inviteRowDisplay } from '../parts/presenters.js'
import { paths } from '../routes.js'
import { PersonFace } from '../components/person-face.js'
import { DanaMark } from '../components/dana-mark.js'

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
    <main className="flex min-h-svh justify-center bg-background px-4 pt-[15vh] pb-12">
      <section className="w-full max-w-[560px]">
        <DanaMark className="size-8" />
        {/* 9.8: "It is one screen, headed 'Invitations'". */}
        <h1 className="mt-6 text-[length:var(--text-title-size)] leading-[var(--text-title-line)] font-bold text-foreground">
          Invitations
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Answer {invites.length === 1 ? 'this' : 'these'} before you continue.
        </p>

        <ul role="list" className="mt-6">
          {invites.map((invite) => {
            const row = inviteRowDisplay(invite)
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border py-3 last:border-b-0"
              >
                <PersonFace
                  id={row.inviterId}
                  name={row.inviter}
                  initials={row.initials}
                  image={row.image ?? null}
                  className="size-8"
                />
                <div className="min-w-0 flex-1 basis-48">
                  {/* 9.8's sentence, one text run, which is what tells a
                      reader and a test which Accept belongs to which invite. */}
                  <p className="text-sm text-foreground">{row.sentence}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.isFolder ? 'Shared folder' : 'Connection'}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="ghost"
                    disabled={decline.isPending}
                    onClick={() => {
                      decline.mutate(row.id)
                    }}
                  >
                    Decline
                  </Button>
                  <Button
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
      </section>
    </main>
  )
}
