/*
9.8's pending invites: quiet rows at the top of the page column on every /app
path while Q12 is non-empty. The app stays usable around them; the shell
(`shell/app-shell.tsx`) mounts this above the page and only when there are rows.

Each row is a list item named by its own sentence ("Hassan invited you to
Wedding", or "... to connect"), which is how a reader and AC-172 tell one
Accept from another. Accepting a page invite lands inside that page. The rows
arrive as a prop; nothing here fetches.
*/
import { useNavigate } from 'react-router'

import type { PendingInvite } from '../../shared/invites.js'
import { useAcceptInvite, useDeclineInvite } from '../api/mutations.js'
import { Button } from '../components/ui/button.js'
import { inviteRowDisplay } from '../parts/presenters.js'
import { paths } from '../routes.js'
import { PersonFace } from '../components/person-face.js'

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
    <ul
      role="list"
      className="mb-[var(--space-group)] flex flex-col gap-[var(--space-row)] border-b border-border pb-2"
    >
      {invites.map((invite) => {
        const row = inviteRowDisplay(invite)
        return (
          <li
            key={row.id}
            className="flex min-h-[var(--row-height)] items-center gap-[var(--space-inline)] rounded-md px-2 py-1"
          >
            <PersonFace
              id={row.inviterId}
              name={row.inviter}
              initials={row.initials}
              image={row.image ?? null}
            />
            {/* 9.8's sentence as one text run. */}
            <p className="min-w-0 flex-1 truncate text-sm text-foreground">{row.sentence}</p>
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
                    // 7.5 answers the page for a page invite, null for a bare one.
                    if (result.folder !== null) {
                      void navigate(paths.folder(result.folder.id))
                    }
                  },
                })
              }}
            >
              Accept
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
