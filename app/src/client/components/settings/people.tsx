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

import { Mail } from 'lucide-react'

import { useCancelInvite, useCreateInvite, useRemoveConnection, useResendInvite } from '../../api/mutations.js'
import { useConnections, useSentInvites } from '../../api/queries.js'
import { Avatar, AvatarFallback } from '../ui/avatar.js'
import { Button } from '../ui/button.js'
import { ConfirmDialog } from '../ui/ConfirmDialog.js'
import { Input } from '../ui/input.js'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip.js'
import { formatCompactDate, formatRelativeDay } from '../../parts/format-dates.js'
import { presenterToday, initialsOf } from '../../parts/presenters.js'
import { PageBody } from '../page/PageStates.js'
import { PersonFace } from '../person-face.js'

/** 9.8, verbatim: the confirm before a roster entry is removed. */
const REMOVE_CONNECTION =
  "Remove connection? You can still see shared folders; you'll just need a fresh invite to share new ones."

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

  return (
    <>
      <p className="pb-3 text-xs text-muted-foreground">People you can share folders with.</p>
      <form
        className="flex gap-2 pb-6"
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
          disabled={invite.isPending}
          className="h-8 flex-1"
          onChange={(event) => {
            setEmail(event.target.value)
          }}
        />
        <Button type="submit" className="h-8 px-3">
          Invite
        </Button>
      </form>

      {pendingBare.length === 0 ? null : (
        <PeopleGroup id="pending-invitations-heading" title="Invited" count={pendingBare.length}>
          <ul role="list">
            {pendingBare.map((row) => {
              const resendAllowed = Date.now() - Date.parse(row.last_sent_at) >= DAY_MS
              const resendButton = (
                <Button
                  variant="ghost"
                  disabled={!resendAllowed || resend.isPending}
                  onClick={() => {
                    resend.mutate(row.id)
                  }}
                >
                  Resend
                </Button>
              )
              return (
                <li key={row.id} className="flex min-h-12 items-center gap-3 py-1.5">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-muted text-muted-foreground">
                      <Mail className="size-4" strokeWidth={1.75} aria-hidden="true" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{row.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Sent {formatRelativeDay(row.last_sent_at, today)}
                    </p>
                  </div>
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
                    variant="ghost"
                    disabled={cancel.isPending}
                    onClick={() => {
                      cancel.mutate(row.id)
                    }}
                  >
                    Cancel
                  </Button>
                </li>
              )
            })}
          </ul>
        </PeopleGroup>
      )}

      <PageBody query={connections} isEmpty={false} emptyCopy="">
        {nobody ? (
          <p className="text-sm text-muted-foreground">
            No one yet. Invite someone by email to share folders with them.
          </p>
        ) : connected.length === 0 ? null : (
          <PeopleGroup id="connections-heading" title="Connected" count={connected.length}>
            <ul role="list">
              {connected.map((entry) => (
                <li key={entry.user.id} className="flex min-h-12 items-center gap-3 py-1.5">
                  <PersonFace
                    name={entry.user.display_name ?? entry.user.email}
                    initials={initialsOf(entry.user.display_name ?? entry.user.email)}
                    image={entry.user.avatar_url}
                    className="size-8"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">
                      {entry.user.display_name ?? entry.user.email}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {entry.user.email} · since {formatCompactDate(entry.connected_at.slice(0, 10))}
                    </p>
                  </div>
                  {/* 9.8: "roster list with remove control". Either side may
                      call it (7.3), so it is offered on every row. */}
                  <Button
                    variant="ghost"
                    className="text-muted-foreground"
                    aria-label={`Remove connection with ${entry.user.display_name ?? entry.user.email}`}
                    onClick={() => {
                      setRemoving(entry.user.id)
                    }}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </PeopleGroup>
        )}
      </PageBody>

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

/* A group inside the People section: a small heading under Settings' h2. */
function PeopleGroup({
  id,
  title,
  count,
  children,
}: {
  readonly id: string
  readonly title: string
  readonly count: number
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <section aria-labelledby={id} className="pb-6">
      <h3 id={id} className="pb-1 text-xs font-medium text-muted-foreground">
        {title} <span className="font-normal">{count}</span>
      </h3>
      {children}
    </section>
  )
}
