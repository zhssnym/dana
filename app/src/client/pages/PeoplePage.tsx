/*
9.8's People screen: the roster with its removal control, the bare invite by
email, and the sent bare invites still pending.

The refusal an already-connected address earns is 7.5's 409, entered by owner
ruling on 2026-08-09, and its message is 9.8's copy character for character on
the server side. So this page raises no message of its own: the mutation
cache shows a 409's own text verbatim, which is 9.1's rule for conflicts and
happens to be exactly what 9.8 asks a person to read here.

The removal confirm is 9.8's own sentence and is transcribed.

**This screen carries no incoming invite list**, removed at P8R session R10 on
the P8R mid-package change control of 2026-08-13: the gate renders at every
/app path while Q12 is non-empty, so the surface is `pages/InviteGate.tsx`.
What this page gained at the polish pass is the other direction, the
prototype's "Pending invitations": the viewer's own bare invites read from
frozen 7.5's GET /invites/sent, with the same Cancel and Resend the sharing
panel gives a folder invite, so a sent invite is visible somewhere between
sending and the day it is answered. Folder-scoped invites stay the sharing
panel's; the filter below is what keeps one row from appearing on two
surfaces.
*/
import { useState } from 'react'

import { Mail, UserPlus, UsersRound } from 'lucide-react'

import { useCancelInvite, useCreateInvite, useRemoveConnection, useResendInvite } from '../api/mutations.js'
import { useConnections, useSentInvites } from '../api/queries.js'
import { Avatar, AvatarFallback } from '../components/ui/avatar.js'
import { Button } from '../components/ui/button.js'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js'
import { Input } from '../components/ui/input.js'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip.js'
import { formatCompactDate, formatRelativeDay } from '../parts/format-dates.js'
import { presenterToday, initialsOf } from '../parts/presenters.js'
import { PageHeading } from './page-heading.js'
import { PageBody } from '../states/PageStates.js'
import { PersonFace } from '../components/person-face.js'

/** 9.8, verbatim: the confirm before a roster entry is removed. */
const REMOVE_CONNECTION =
  "Remove connection? You can still see shared folders; you'll just need a fresh invite to share new ones."

/** 9.6: the tooltip on a resend refused inside the 24 hour window. */
const RESENT_RECENTLY = 'Resent recently'

const DAY_MS = 24 * 60 * 60 * 1000

export function PeoplePage(): React.JSX.Element {
  const connections = useConnections()
  const sent = useSentInvites()
  const invite = useCreateInvite()
  const cancel = useCancelInvite()
  const resend = useResendInvite()
  const disconnect = useRemoveConnection()
  const [email, setEmail] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)

  const today = presenterToday()
  const trimmed = email.trim()
  const submittable = trimmed !== '' && !invite.isPending

  /* Bare invites only: a folder invite's home is 9.6's sharing panel. */
  const pendingBare = (sent.data ?? []).filter(
    (row) => row.status === 'pending' && row.folder_id === null,
  )

  function sendInvite(): void {
    if (!submittable) return
    setEmail('')
    invite.mutate({ email: trimmed })
  }

  return (
    <div className="space-y-7">
      <PageHeading
        icon={UsersRound}
        title="People"
        subtitle="Connections for quick folder sharing"
      />

      <div className="max-w-[820px] space-y-8">
        <section aria-labelledby="invite-person-heading">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-graphite-100)] text-[var(--color-graphite-600)]">
              <UserPlus className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="invite-person-heading" className="text-sm font-semibold text-foreground">
                Invite someone
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Connect without sharing a folder yet.
              </p>
              <form
                className="mt-3 flex max-w-[560px] gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  sendInvite()
                }}
              >
                <Input
                  aria-label="Invite by email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  disabled={invite.isPending}
                  className="h-[var(--control-height)] flex-1 bg-white px-3 md:text-sm"
                  onChange={(event) => {
                    setEmail(event.target.value)
                  }}
                />
                <Button
                  type="submit"
                  disabled={!submittable}
                  className="h-[var(--control-height)] bg-[var(--color-graphite-800)] px-4 text-sm text-white hover:bg-[var(--color-graphite-700)]"
                >
                  Send invite
                </Button>
              </form>
            </div>
          </div>
        </section>

        <section aria-labelledby="connections-heading" className="border-t border-border pt-6">
          <h2 id="connections-heading" className="mb-2 text-sm font-semibold text-foreground">
            Connections{' '}
            <span className="font-normal text-muted-foreground">
              {connections.data === undefined ? '' : connections.data.length}
            </span>
          </h2>
          <PageBody
            query={connections}
            isEmpty={(connections.data?.length ?? 0) === 0}
            emptyCopy="No one yet. Invite someone by email to share a folder with them."
            emptyIcon={UsersRound}
          >
            <ul role="list">
              {(connections.data ?? []).map((entry) => (
                <li
                  key={entry.user.id}
                  className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 hover:bg-[var(--color-graphite-50)]"
                >
                  <PersonFace
                    name={entry.user.display_name ?? entry.user.email}
                    initials={initialsOf(entry.user.display_name ?? entry.user.email)}
                    className="size-9"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {entry.user.display_name ?? entry.user.email}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{entry.user.email}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Connected {formatCompactDate(entry.connected_at.slice(0, 10))}
                  </span>
                  {/* 9.8: "roster list with remove control". Either side may
                      call it (7.3), so it is offered on every row. */}
                  <Button
                    variant="outline"
                    className="h-8 px-3 text-xs"
                    onClick={() => {
                      setRemoving(entry.user.id)
                    }}
                  >
                    Remove connection
                  </Button>
                </li>
              ))}
            </ul>
          </PageBody>
        </section>

        {pendingBare.length === 0 ? null : (
          <section aria-labelledby="pending-invitations-heading" className="border-t border-border pt-6">
            <h2
              id="pending-invitations-heading"
              className="mb-2 text-sm font-semibold text-foreground"
            >
              Pending invitations{' '}
              <span className="font-normal text-muted-foreground">{pendingBare.length}</span>
            </h2>
            <ul role="list">
              {pendingBare.map((row) => {
                const resendAllowed = Date.now() - Date.parse(row.last_sent_at) >= DAY_MS
                const resendButton = (
                  <Button
                    variant="ghost"
                    className="h-8 px-3 text-xs"
                    disabled={!resendAllowed || resend.isPending}
                    onClick={() => {
                      resend.mutate(row.id)
                    }}
                  >
                    Resend
                  </Button>
                )
                return (
                  <li
                    key={row.id}
                    className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 hover:bg-[var(--color-graphite-50)]"
                  >
                    <Avatar className="size-9">
                      <AvatarFallback className="bg-[var(--color-graphite-100)] text-[var(--color-graphite-500)]">
                        <Mail className="size-4" strokeWidth={1.75} aria-hidden="true" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{row.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Sent {formatRelativeDay(row.last_sent_at, today)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      className="h-8 px-3 text-xs"
                      disabled={cancel.isPending}
                      onClick={() => {
                        cancel.mutate(row.id)
                      }}
                    >
                      Cancel
                    </Button>
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
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>

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
    </div>
  )
}
