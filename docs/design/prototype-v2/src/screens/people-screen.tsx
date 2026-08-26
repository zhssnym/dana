import { useMemo, useState } from "react"
import { Contact, Mail, UserPlus } from "@/lib/icons"

import { InlineError } from "@/components/state-patterns"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export type ConnectionFixture = {
  id: string
  name: string
  email: string
  initials: string
  connectedAt: string
}

export type PendingConnectionInvite = {
  id: string
  email: string
  sentAt: string
}

function PeopleSkeleton() {
  return (
    <div className="space-y-2" aria-label="Loading people" aria-busy="true">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex min-h-14 items-center gap-3 px-2">
          <Skeleton className="size-9 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      ))}
    </div>
  )
}

export function PeopleScreen({
  initialConnections,
  initialPendingInvites,
  previewState,
}: {
  initialConnections: ConnectionFixture[]
  initialPendingInvites: PendingConnectionInvite[]
  previewState?: string | null
}) {
  const [connections, setConnections] = useState(initialConnections)
  const [pendingInvites, setPendingInvites] = useState(initialPendingInvites)
  const [email, setEmail] = useState("")
  const [removing, setRemoving] = useState<ConnectionFixture | null>(null)
  const normalizedEmail = email.trim().toLocaleLowerCase()
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  const duplicateInvite = useMemo(
    () =>
      pendingInvites.some(
        (invite) => invite.email.toLocaleLowerCase() === normalizedEmail,
      ),
    [normalizedEmail, pendingInvites],
  )
  const visibleConnections = previewState === "empty" ? [] : connections

  return (
    <div className="mx-auto w-full max-w-[var(--shell-content-max)] px-10 py-6">
      <header className="flex min-h-12 items-start gap-3">
        <Contact
          className="mt-0.5 size-6 shrink-0 text-[var(--color-graphite-700)]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h1 className="truncate text-2xl leading-8 font-semibold text-foreground">
            People
          </h1>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">
            Connections for quick folder sharing
          </p>
        </div>
      </header>

      <div className="mt-7 max-w-[820px]">
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
                  if (!validEmail || duplicateInvite) return
                  setPendingInvites((current) => [
                    ...current,
                    {
                      id: `pending-${Date.now()}`,
                      email: normalizedEmail,
                      sentAt: "Sent just now",
                    },
                  ])
                  setEmail("")
                }}
              >
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                  aria-label="Email address"
                  aria-invalid={Boolean(email) && (!validEmail || duplicateInvite)}
                  className="h-[var(--control-height)] bg-white px-3 text-sm md:text-sm"
                />
                <Button
                  type="submit"
                  disabled={!validEmail || duplicateInvite}
                  className="h-[var(--control-height)] bg-[var(--color-graphite-900)] px-4 text-sm text-white hover:bg-[var(--color-graphite-800)]"
                >
                  Send invite
                </Button>
              </form>
              {duplicateInvite ? (
                <p className="mt-1.5 text-xs text-[var(--color-danger-700)]">
                  An invitation to this email is already pending.
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mt-8 border-t border-border pt-6" aria-labelledby="connections-heading">
          <div className="mb-2 flex h-7 items-center gap-2">
            <h2 id="connections-heading" className="text-sm font-semibold text-foreground">
              Connections
            </h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              {visibleConnections.length}
            </span>
          </div>

          {previewState === "loading" ? (
            <PeopleSkeleton />
          ) : previewState === "error" ? (
            <InlineError />
          ) : visibleConnections.length === 0 ? (
            <Empty className="min-h-48">
              <EmptyMedia className="text-[var(--color-graphite-400)]">
                <Contact className="size-8" strokeWidth={1.6} aria-hidden="true" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyDescription className="max-w-[48ch] text-sm leading-5 text-muted-foreground">
                  No connections yet. Invite someone by email to make future folder sharing faster.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div role="list" className="space-y-0.5">
              {visibleConnections.map((connection) => (
                <div
                  key={connection.id}
                  role="listitem"
                  className="group flex min-h-14 items-center gap-3 rounded-lg px-2 transition-colors hover:bg-[var(--color-graphite-50)]"
                >
                  <Avatar className="size-9">
                    <AvatarFallback className="bg-[var(--color-graphite-100)] text-xs font-medium text-[var(--color-graphite-700)]">
                      {connection.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{connection.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{connection.email}</p>
                  </div>
                  <span className="shrink-0 text-xs text-[var(--color-graphite-500)]">
                    Connected {connection.connectedAt}
                  </span>
                  <Button
                    variant="ghost"
                    className="h-8 px-2 text-xs text-[var(--color-graphite-500)] opacity-0 hover:bg-transparent hover:text-[var(--color-danger-700)] focus-visible:opacity-100 group-hover:opacity-100"
                    onClick={() => setRemoving(connection)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        {pendingInvites.length > 0 && previewState !== "loading" ? (
          <section className="mt-8 border-t border-border pt-6" aria-labelledby="people-pending-heading">
            <div className="mb-2 flex h-7 items-center gap-2">
              <h2 id="people-pending-heading" className="text-sm font-semibold text-foreground">
                Pending invitations
              </h2>
              <span className="text-xs tabular-nums text-muted-foreground">
                {pendingInvites.length}
              </span>
            </div>
            <div role="list" className="space-y-0.5">
              {pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  role="listitem"
                  className="flex min-h-14 items-center gap-3 rounded-lg px-2 hover:bg-[var(--color-graphite-50)]"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-graphite-100)] text-[var(--color-graphite-600)]">
                    <Mail className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{invite.email}</p>
                    <p className="text-xs text-muted-foreground">{invite.sentAt}</p>
                  </div>
                  <Button
                    variant="ghost"
                    className="h-8 px-2 text-xs text-[var(--color-graphite-500)] hover:bg-transparent hover:text-[var(--color-danger-700)]"
                    onClick={() =>
                      setPendingInvites((current) =>
                        current.filter((candidate) => candidate.id !== invite.id),
                      )
                    }
                  >
                    Cancel
                  </Button>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span tabIndex={0} className="inline-flex">
                          <Button variant="ghost" className="h-8 px-2 text-xs" disabled>
                            Resend
                          </Button>
                        </span>
                      }
                    />
                    <TooltipContent>Resent recently</TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove connection?</AlertDialogTitle>
            <AlertDialogDescription>
              You can still see shared folders; you&apos;ll just need a fresh invite to share new ones.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              destructive
              onClick={() => {
                if (!removing) return
                setConnections((current) =>
                  current.filter((connection) => connection.id !== removing.id),
                )
                setRemoving(null)
              }}
            >
              Remove connection
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
