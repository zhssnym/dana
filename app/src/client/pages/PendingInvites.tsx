/*
9.8's login surface: "when Q12 is non-empty, an invite list renders before
anything else after callback: each row 'Hassan invited you to Wedding' (or
'Hassan invited you to connect'), Accept and Decline buttons; accepting a
folder invite lands inside that folder."

**Where "before anything else" puts this, and why it is not the layout.** 9.2
is the other half of the sentence: "After callback, first-run lands on My Day;
pending invites, when any exist, surface first as 9.8 describes." So the
callback lands on My Day and the list comes first there, which is what this
component is rendered as: the first thing on My Day, above the date header and
the groups. The reading rejected was mounting it in `AppLayout`, which would
put it above every page for as long as an invite stayed unanswered rather than
above the page the callback lands on. Recorded as a reading in
`src/client/README.md`, with the recommendation that 9.8 say whether the
surface is the landing page after callback or a standing banner.

It is rendered on the People screen too, which is where a person goes looking
for an invite they dismissed by navigating away. That is not a second reading
of the sentence above: it is the same component with the same data, on the
screen 9.8 gives the rest of this subject.

**Nothing here fetches.** The rows arrive as a prop from the page that read
them, which is the client's settled rule, and it is what lets the same list be
mounted on two pages without either of them learning about the other.

The two controls carry the names 9.8 spells, "Accept" and "Decline". A page
with several invites therefore has several controls answering to each, which
9.1's sections ruling would ordinarily solve with a named region; that table
names no region here, so this list is not inventing one. Each row is a list
item carrying its own sentence, so a control is addressed inside the row that
names the inviter and the folder, exactly as a task row's controls are.
*/
import { useNavigate } from 'react-router'

import type { PendingInvite } from '../../shared/invites.js'
import { useAcceptInvite, useDeclineInvite } from '../api/mutations.js'
import { paths } from '../routes.js'

/**
 * The sentence 9.8 writes, in its two forms.
 *
 * `folder_name` is null for a bare invite, which 7.5 makes the discriminator
 * this whole surface turns on, so the fallback is the word "connect" rather
 * than a folder that is not there. The inviter's display name is nullable in
 * 7.5's element as it is everywhere else a person is rendered, and "Someone"
 * is what the rest of this client says when it is absent.
 */
export function inviteSentence(invite: PendingInvite): string {
  const who = invite.inviter.display_name ?? 'Someone'
  return `${who} invited you to ${invite.folder_name ?? 'connect'}`
}

export function PendingInviteList({
  invites,
}: {
  /** Q12's rows, read by the page that mounts this. */
  readonly invites: readonly PendingInvite[]
}): React.JSX.Element | null {
  const accept = useAcceptInvite()
  const decline = useDeclineInvite()
  const navigate = useNavigate()

  // Q12 empty is not an empty state: 9.8 conditions the whole surface on the
  // list being non-empty, so there is nothing to say rather than a message
  // saying nobody has invited you anywhere.
  if (invites.length === 0) return null

  return (
    <ul role="list">
      {invites.map((invite) => (
        <li key={invite.id}>
          <span>{inviteSentence(invite)}</span>
          <button
            type="button"
            disabled={accept.isPending}
            onClick={() => {
              accept.mutate(invite.id, {
                onSuccess: (result) => {
                  // 9.8: accepting a folder invite lands inside that folder.
                  // 7.5 answers the full Folder object rather than the group
                  // heading stub for exactly this, so the navigation needs no
                  // second read. A bare invite grants no folder and answers
                  // null, and the person stays where they are.
                  if (result.folder !== null) navigate(paths.folder(result.folder.id))
                },
              })
            }}
          >
            Accept
          </button>
          <button
            type="button"
            disabled={decline.isPending}
            onClick={() => {
              decline.mutate(invite.id)
            }}
          >
            Decline
          </button>
        </li>
      ))}
    </ul>
  )
}
