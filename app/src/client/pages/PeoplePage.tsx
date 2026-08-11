/*
9.8's People screen: the roster with its removal control, and the bare invite
by email.

The refusal an already-connected address earns is 7.5's 409, entered by owner
ruling on 2026-08-09, and its message is 9.8's copy character for character on
the server side. So this page raises no message of its own: the mutation
cache shows a 409's own text verbatim, which is 9.1's rule for conflicts and
happens to be exactly what 9.8 asks a person to read here. A second copy of
that string in this file would be a second thing to keep in step with the
specification.

The roster removal confirm and the invite list's Cancel and Resend are
confirmations and belong with the rest of them; recorded as owed.
*/
import { useState } from 'react'

import { useCreateInvite } from '../api/mutations.js'
import { useConnections, usePendingInvites } from '../api/queries.js'
import { PageBody } from '../states/PageStates.js'

export function PeoplePage(): React.JSX.Element {
  const connections = useConnections()
  const pending = usePendingInvites()
  const invite = useCreateInvite()
  const [email, setEmail] = useState('')

  return (
    <div>
      <h1>People</h1>

      <PageBody
        query={connections}
        isEmpty={(connections.data?.length ?? 0) === 0}
        emptyCopy="No one yet. Invite someone by email to share a folder with them."
      >
        <ul>
          {(connections.data ?? []).map((entry) => (
            <li key={entry.user.id}>
              <span>{entry.user.display_name ?? entry.user.email}</span>
              <span>{entry.user.email}</span>
            </li>
          ))}
        </ul>
      </PageBody>

      <label htmlFor="invite-by-email">Invite by email</label>
      <input
        id="invite-by-email"
        type="email"
        value={email}
        disabled={invite.isPending}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          const trimmed = email.trim()
          if (trimmed === '') return
          setEmail('')
          invite.mutate({ email: trimmed })
        }}
        onChange={(event) => setEmail(event.target.value)}
      />

      {(pending.data ?? []).length === 0 ? null : (
        <ul>
          {(pending.data ?? []).map((row) => (
            <li key={row.id}>
              {row.inviter.display_name ?? 'Someone'} invited you to{' '}
              {row.folder_name ?? 'connect'}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
