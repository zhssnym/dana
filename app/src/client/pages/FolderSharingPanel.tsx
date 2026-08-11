/*
9.6's sharing panel, the surface the folder header's Share button opens:

  "member list with joined dates and remove controls per the 5.4 matrix;
  roster picker ('Share with someone you're connected to'); email field
  ('Invite by email'); pending invites list with exact email, sent time,
  Cancel, Resend (disabled within 24 hours, tooltip 'Resent recently')."

Four blocks, and each is a place the client hides a control the server would
refuse anyway. 7.11 lists that under client conveniences with no authority,
which is the rule this file is written to: every condition below is decided
again by 5.3 and 5.4 server-side, and none of them is enforced here.

- **Remove is offered to the owner alone**, and never on the owner's own row.
  5.4 gives "remove another member" to the owner and 403s everyone else, and
  the owner's own exit is 5.3's transfer rule, which 9.6 puts in the header's
  overflow menu as Leave rather than here. A remove control on the owner's row
  would be a second, differently shaped door to the same transfer.
- **The roster picker offers connections who are not already members.** 5.3
  refuses an add for a non-connection (422) and for an existing member (409),
  and 7.3's roster is what the picker is built from, so an option that cannot
  be added is not offered.
- **Resend is disabled inside 24 hours**, with 9.6's own tooltip. 7.5 answers
  429 for the same window; disabling is the convenience and the 429 is the
  rule.

**Nothing here reads.** The folder detail and the roster arrive as props from
`FolderPage`, which is the client's settled one-hook-per-surface rule. The
panel is mounted only while the person has opened it, so the reads it consumes
are the page's whether it is open or not.
*/
import { useState } from 'react'

import type { GetConnectionsResponse } from '../../shared/connections.js'
import type { GetFolderResponse } from '../../shared/folders.js'
import {
  useAddFolderMember,
  useCancelInvite,
  useCreateInvite,
  useRemoveFolderMember,
  useResendInvite,
} from '../api/mutations.js'
import { ConfirmDialog } from '../components/ui/index.js'
import { PageSection } from '../states/PageSection.js'

/** 9.6, the roster picker's own label. */
const ROSTER_PICKER = "Share with someone you're connected to"

/** 9.6, the email field's label, and 9.3's word for the same act. */
const INVITE_BY_EMAIL = 'Invite by email'

/** 9.6: the tooltip on a resend refused inside the 24 hour window. */
const RESENT_RECENTLY = 'Resent recently'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Whether 5.2's resend window has passed, from the row's own `last_sent_at`.
 *
 * The window is read off the invite rather than remembered from a click, which
 * is why 7.5 carries `last_sent_at` on the invite at all: a person who reloads
 * the page, or who opens it on another device, sees the same disabled control
 * rather than one that has forgotten.
 */
function resendable(lastSentAt: string): boolean {
  return Date.now() - Date.parse(lastSentAt) >= DAY_MS
}

interface PendingRemoval {
  readonly userId: string
  readonly message: string
}

export function FolderSharingPanel({
  folder,
  connections,
}: {
  readonly folder: GetFolderResponse
  /** 7.3's roster, which the picker is built from. Absent while it loads. */
  readonly connections: GetConnectionsResponse | undefined
}): React.JSX.Element {
  const addMember = useAddFolderMember()
  const removeMember = useRemoveFolderMember()
  const invite = useCreateInvite()
  const cancel = useCancelInvite()
  const resend = useResendInvite()
  const [picked, setPicked] = useState('')
  const [email, setEmail] = useState('')
  const [removing, setRemoving] = useState<PendingRemoval | null>(null)

  const memberIds = new Set(folder.members.map((member) => member.user.id))
  const invitable = (connections ?? []).filter((entry) => !memberIds.has(entry.user.id))

  return (
    /*
    A named region, by 9.1's sections ruling read past its own table: "every
    section a page's structure names is a named region", and 9.6 names this
    one "Sharing panel". The table lists the folder page's three task sections
    and not this, because the table was written against Q7's body; the rule
    above is what decides a section the table does not enumerate. It matters
    here for the ordinary reason: the panel carries an email field whose label
    is a phrase 9.3 also spends on the assignee dropdown's last option, and a
    region is what says which one a test means.
    */
    <PageSection name="Sharing panel" heading="Sharing panel">
      <ul role="list">
        {folder.members.map((member) => (
          <li key={member.user.id}>
            <span>{member.user.display_name ?? 'Someone'}</span>
            {/* "joined dates": the membership row's own timestamp. The format
                is the design's, so the value is rendered as 7.4 carries it. */}
            <span className="meta">{member.joined_at.slice(0, 10)}</span>
            {folder.is_owner && !member.is_owner ? (
              <button
                type="button"
                onClick={() => {
                  setRemoving({
                    userId: member.user.id,
                    message: removeMemberConfirm(
                      member.user.display_name ?? 'this person',
                      folder.name,
                    ),
                  })
                }}
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      <label className="text-label" htmlFor="folder-roster-picker">{ROSTER_PICKER}</label>
      <select
        id="folder-roster-picker"
        value={picked}
        disabled={addMember.isPending}
        onChange={(event) => {
          const userId = event.target.value
          setPicked('')
          if (userId === '') return
          addMember.mutate({ folderId: folder.id, userId })
        }}
      >
        <option value="">Choose someone</option>
        {invitable.map((entry) => (
          <option key={entry.user.id} value={entry.user.id}>
            {entry.user.display_name ?? entry.user.email}
          </option>
        ))}
      </select>

      <label className="text-label" htmlFor="folder-invite-by-email">{INVITE_BY_EMAIL}</label>
      <input
        id="folder-invite-by-email"
        type="email"
        value={email}
        disabled={invite.isPending}
        onChange={(event) => setEmail(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          const trimmed = email.trim()
          if (trimmed === '') return
          setEmail('')
          // The folder rides the body, which is what makes this an invite to
          // this folder rather than the bare one the People screen sends, and
          // what turns a connected address into 7.5's instant share instead of
          // its 409.
          invite.mutate({ email: trimmed, folder_id: folder.id })
        }}
      />

      {folder.pending_invites.length === 0 ? null : (
        <ul role="list">
          {folder.pending_invites.map((row) => (
            <li key={row.id}>
              {/* "exact email": the address as it was invited, never a
                  display name, because the point of this list is that a
                  mistyped address can be seen and repaired. */}
              <span>{row.email}</span>
              <span className="meta">{row.last_sent_at}</span>
              <button
                type="button"
                onClick={() => {
                  cancel.mutate(row.id)
                }}
              >
                Cancel invite
              </button>
              <button
                type="button"
                disabled={!resendable(row.last_sent_at)}
                title={resendable(row.last_sent_at) ? undefined : RESENT_RECENTLY}
                onClick={() => {
                  resend.mutate(row.id)
                }}
              >
                Resend
              </button>
            </li>
          ))}
        </ul>
      )}

      {removing === null ? null : (
        <ConfirmDialog
          message={removing.message}
          onContinue={() => {
            const target = removing.userId
            setRemoving(null)
            removeMember.mutate({ folderId: folder.id, userId: target })
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </PageSection>
  )
}

/**
 * The confirm before an owner removes a member.
 *
 * **First pass.** Section 9 writes four confirmations word for word and this
 * is not one of them, while 5.3's R-CLEAN makes the effect exactly the kind
 * those four exist to state: the person's assignments in this folder are
 * cleared and their My Day entries for its tasks are deleted. Recorded as an
 * open silence in `src/client/README.md`; design may reword it, and section 9
 * spelling it would settle it.
 */
function removeMemberConfirm(who: string, folder: string): string {
  return (
    `Remove ${who} from ${folder}? They lose access, and anything in this ` +
    'folder assigned to them becomes unassigned.'
  )
}
