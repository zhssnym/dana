/*
 * Pending invites (spec 9.8): quiet rows above the page on every /app path. Each row is named by its sentence
 * (AC-172).
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
            {/* Spec 9.8's sentence as one text run. */}
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
                    // The server answers the page for a page invite, null for a bare one.
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
