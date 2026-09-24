/*
9.8's People, drawn as Settings' People section (round 2: Settings is the home
of every configuration; /app/people redirects to /app/settings#people). The roster with its removal control, the bare invite by
email, and the sent bare invites still pending.

The refusal an already-connected address earns is 7.5's 409, and its message is 9.8's copy character for character on
the server side. So this page raises no message of its own: the mutation
cache shows a 409's own text verbatim, which is 9.1's rule for conflicts and
happens to be exactly what 9.8 asks a person to read here.

The removal confirm is 9.8's own sentence and is transcribed.

**This screen carries no incoming invite list**: the gate renders at every
/app path while Q12 is non-empty, so the surface is `pages/InviteGate.tsx`.
What this page carries is the other direction, the prototype's "Pending
invitations": the viewer's own bare invites read from 7.5's GET /invites/sent, with the same Cancel and Resend the sharing
panel gives a folder invite, so a sent invite is visible somewhere between
sending and the day it is answered. Folder-scoped invites stay the sharing
panel's; the filter below is what keeps one row from appearing on two
surfaces.
*/
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
import { SettingsRow } from './screen.js'

/** 9.8, verbatim: the confirm before a roster entry is removed. */
const REMOVE_CONNECTION =
  "Remove connection? You can still see shared pages; you'll just need a fresh invite to share new ones."

/** 9.6: the tooltip on a resend refused inside the 24 hour window. */
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

  /* Bare invites only: a folder invite's home is 9.6's sharing panel. */
  const pendingBare = (sent.data ?? []).filter(
    (row) => row.status === 'pending' && row.folder_id === null,
  )
  const connected = connections.data ?? []
  /* "No one yet" is true only when nobody is connected *and* nobody is
     waiting on an answer; a pending invite is someone. */
  const nobody = connected.length === 0 && pendingBare.length === 0

  function sendInvite(): void {
    /* The button stays pressable: an empty press puts you in the field
       rather than being a grey button that does nothing. */
    if (trimmed === '') {
      field.current?.focus()
      return
    }
    if (invite.isPending) return
    setEmail('')
    invite.mutate({ email: trimmed })
  }

  /* A person or a pending invite, both drawn as the one settings row. */
  return (
    <>
      {pendingBare.map((row) => {
        const resendAllowed = Date.now() - Date.parse(row.last_sent_at) >= DAY_MS
        const resendButton = (
          <Button
            variant="outline"
            size="lg"
            disabled={!resendAllowed || resend.isPending}
            onClick={() => {
              resend.mutate(row.id)
            }}
          >
            Resend
          </Button>
        )
        return (
          <SettingsRow
            key={row.id}
            title={row.email}
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
                  variant="outline"
                  size="lg"
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
          <SettingsRow
            key={entry.user.id}
            title={
              <span className="flex min-w-0 items-center gap-2">
                <PersonFace
                  id={entry.user.id}
                  name={entry.user.display_name ?? entry.user.email}
                  initials={initialsOf(entry.user.display_name ?? entry.user.email)}
                  image={entry.user.avatar_url}
                  className="size-5 shrink-0"
                />
                <span className="truncate">{entry.user.display_name ?? entry.user.email}</span>
              </span>
            }
            description={`${entry.user.email} · since ${formatCompactDate(entry.connected_at.slice(0, 10))}`}
            control={
              /* 9.8: "roster list with remove control". Either side may call it (7.3). */
              <Button
                variant="outline"
                size="lg"
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

      {/* Rarely needed, so one row until it is used: the button opens the
          field in place of itself. Esc or an empty blur folds it back. */}
      <SettingsRow
        title="Invite by email"
        description={nobody ? 'People you can share pages with' : undefined}
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
                className="w-56"
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
              <Button type="submit" variant="outline" size="lg">
                Send
              </Button>
            </form>
          ) : (
            <Button
              variant="outline"
              size="lg"
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
