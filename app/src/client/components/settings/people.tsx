// Settings' People section: the roster, invite by email, and the viewer's pending bare
// invites. A 409's server message is shown verbatim, so this raises none of its own.
// Folder invites stay in the sharing panel.
import { useRef, useState } from 'react'

import { useCancelInvite, useCreateInvite, useRemoveConnection, useResendInvite } from '../../api/mutations.js'
import { useConnections, useSentInvites } from '../../api/queries.js'
import { Button } from '../ui/button.js'
import { ConfirmDialog } from '../ui/ConfirmDialog.js'
import { Input } from '../ui/input.js'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip.js'
import { formatCompactDate, formatRelativeDay } from '../../parts/format-dates.js'
import { presenterToday, initialsOf } from '../../parts/presenters.js'
import { PageBody } from '../page/PageStates.js'
import { PersonFace } from '../person-face.js'
import { StackingRow } from './screen.js'

/** Fixed copy (spec 9.8): the confirm before a roster entry is removed. */
const REMOVE_CONNECTION =
  "Remove connection? You can still see shared pages; you'll just need a fresh invite to share new ones."

/** Tooltip on a resend refused inside the 24 hour window. */
const RESENT_RECENTLY = 'Resent recently'

const DAY_MS = 24 * 60 * 60 * 1000

export function PeopleSettings(): React.JSX.Element {
  const connections = useConnections()
  const sent = useSentInvites()
  const invite = useCreateInvite()
  const cancel = useCancelInvite()
  const resend = useResendInvite()
  const disconnect = useRemoveConnection()
  const [email, setEmail] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const field = useRef<HTMLInputElement>(null)

  const today = presenterToday()
  const trimmed = email.trim()

  // Bare invites only: a folder invite belongs to the sharing panel.
  const pendingBare = (sent.data ?? []).filter(
    (row) => row.status === 'pending' && row.folder_id === null,
  )
  const connected = connections.data ?? []

  function sendInvite(): void {
    // An empty press focuses the field instead of greying out the button.
    if (trimmed === '') {
      field.current?.focus()
      return
    }
    if (invite.isPending) return
    setEmail('')
    invite.mutate({ email: trimmed })
  }

  return (
    <>
      {pendingBare.map((row) => {
        const resendAllowed = Date.now() - Date.parse(row.last_sent_at) >= DAY_MS
        const resendButton = (
          <Button
            disabled={!resendAllowed || resend.isPending}
            onClick={() => {
              resend.mutate(row.id)
            }}
          >
            Resend
          </Button>
        )
        return (
          <StackingRow
            key={row.id}
            label={row.email}
            description={`Invited ${formatRelativeDay(row.last_sent_at, today)}`}
            control={
              <>
                {resendAllowed ? (
                  resendButton
                ) : (
                  <Tooltip>
                    <TooltipTrigger render={<span className="inline-flex" />}>
                      {resendButton}
                    </TooltipTrigger>
                    <TooltipContent>{RESENT_RECENTLY}</TooltipContent>
                  </Tooltip>
                )}
                <Button
                  disabled={cancel.isPending}
                  onClick={() => {
                    cancel.mutate(row.id)
                  }}
                >
                  Cancel
                </Button>
              </>
            }
          />
        )
      })}

      <PageBody query={connections} isEmpty={false} emptyCopy="">
        {connected.map((entry) => (
          <StackingRow
            key={entry.user.id}
            icon={
              <PersonFace
                id={entry.user.id}
                name={entry.user.display_name ?? entry.user.email}
                initials={initialsOf(entry.user.display_name ?? entry.user.email)}
                image={entry.user.avatar_url}
                className="size-5 shrink-0"
              />
            }
            label={entry.user.display_name ?? entry.user.email}
            description={`${entry.user.email} · since ${formatCompactDate(entry.connected_at.slice(0, 10))}`}
            control={
              // Either side may remove a connection.
              <Button
                aria-label={`Remove connection with ${entry.user.display_name ?? entry.user.email}`}
                onClick={() => {
                  setRemoving(entry.user.id)
                }}
              >
                Remove
              </Button>
            }
          />
        ))}
      </PageBody>

      {/* One row until used: the button opens the field in its place. Esc or an empty blur
         folds it back. */}
      <StackingRow
        label="Invite by email"
        control={
          inviting ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                sendInvite()
              }}
            >
              <Input
                ref={field}
                aria-label="Invite by email"
                type="email"
                placeholder="name@example.com"
                value={email}
                autoFocus
                disabled={invite.isPending}
                className="w-(--settings-picker-width) max-sm:w-36"
                onChange={(event) => {
                  setEmail(event.target.value)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setEmail('')
                    setInviting(false)
                  }
                }}
              />
              <Button type="submit">
                Send
              </Button>
            </form>
          ) : (
            <Button
              onClick={() => {
                setInviting(true)
              }}
            >
              Invite
            </Button>
          )
        }
      />

      {removing === null ? null : (
        <ConfirmDialog
          message={REMOVE_CONNECTION}
          onContinue={() => {
            const target = removing
            setRemoving(null)
            disconnect.mutate(target)
          }}
          onCancel={() => {
            setRemoving(null)
          }}
        />
      )}
    </>
  )
}
