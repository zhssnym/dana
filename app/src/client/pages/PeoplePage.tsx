/*
9.8's People screen: the roster with its removal control, the bare invite by
email, and the pending invites addressed to the viewer.

The refusal an already-connected address earns is 7.5's 409, entered by owner
ruling on 2026-08-09, and its message is 9.8's copy character for character on
the server side. So this page raises no message of its own: the mutation
cache shows a 409's own text verbatim, which is 9.1's rule for conflicts and
happens to be exactly what 9.8 asks a person to read here. A second copy of
that string in this file would be a second thing to keep in step with the
specification.

The removal confirm is 9.8's own sentence and is transcribed. It is the third
of the four things that section names and the only one whose copy it writes,
which is why it is the only string in this file.

The pending list is 9.8's login surface, the same component My Day mounts.
9.8 gives that surface no home outside the callback, and this is the screen a
person returns to after navigating away from it; mounting it here is not a
second reading of "before anything else", it is the same list on the screen
this section devotes to the subject.
*/
import { useState } from 'react'

import { useCreateInvite, useRemoveConnection } from '../api/mutations.js'
import { useConnections, usePendingInvites } from '../api/queries.js'
import { UsersRound } from 'lucide-react'

import { ConfirmDialog, initialsOf } from '../components/ui/index.js'
import { PageBody } from '../states/PageStates.js'
import { PendingInviteList } from './PendingInvites.js'

/** 9.8, verbatim: the confirm before a roster entry is removed. */
const REMOVE_CONNECTION =
  "Remove connection? You can still see shared folders; you'll just need a fresh invite to share new ones."

export function PeoplePage(): React.JSX.Element {
  const connections = useConnections()
  const pending = usePendingInvites()
  const invite = useCreateInvite()
  const disconnect = useRemoveConnection()
  const [email, setEmail] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <header className="page-header">
        <h1 className="page-title">People</h1>
      </header>

      {/* 9.8's login surface, above the roster: an unanswered invite is the
          one thing on this screen a person can still act on. */}
      <PendingInviteList invites={pending.data ?? []} />

      <PageBody
        query={connections}
        isEmpty={(connections.data?.length ?? 0) === 0}
        emptyCopy="No one yet. Invite someone by email to share a folder with them."
        emptyIcon={UsersRound}
      >
        <ul role="list" className="list-card space-y-1">
          {(connections.data ?? []).map((entry) => (
            <li
              key={entry.user.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2"
            >
              <span className="avatar" aria-hidden="true">
                {initialsOf(entry.user.display_name ?? entry.user.email)}
              </span>
              <span className="flex-1">{entry.user.display_name ?? entry.user.email}</span>
              <span className="meta">{entry.user.email}</span>
              {/* 9.8: "roster list with remove control". Either side may call
                  it (7.3), so it is offered on every row rather than on the
                  rows one of the two happens to have created. */}
              <button
                type="button"
                className="button-base button-quiet"
                onClick={() => setRemoving(entry.user.id)}
              >
                Remove connection
              </button>
            </li>
          ))}
        </ul>
      </PageBody>

      <div className="space-y-2">
        <label className="text-label" htmlFor="invite-by-email">Invite by email</label>
        <input
        id="invite-by-email"
        className="input-base"
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
      </div>

      {removing === null ? null : (
        <ConfirmDialog
          message={REMOVE_CONNECTION}
          onContinue={() => {
            const target = removing
            setRemoving(null)
            disconnect.mutate(target)
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  )
}
