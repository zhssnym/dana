import {
  TriangleAlert,
  ArrowLeft,
  FolderOpen,
  MailWarning,
  UserRoundPlus,
} from "@/lib/icons"
import { useState } from "react"

import { DanaMark } from "@/components/dana-mark"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"

export { default as LandingScreen } from "@/screens/landing-screen"

function DanaIdentity() {
  return (
    <a
      href="?view=landing"
      className="inline-flex items-center gap-3 rounded-md text-sm font-semibold text-[var(--color-graphite-900)] outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      aria-label="Dana home"
    >
      <DanaMark className="size-8" />
      <span>Dana</span>
    </a>
  )
}

function DanaBrand() {
  return (
    <div className="inline-flex items-center gap-3 text-sm font-semibold text-[var(--color-graphite-900)]">
      <DanaMark className="size-8" />
      <span>Dana</span>
    </div>
  )
}

function GoogleGlyph() {
  return (
    <span className="flex size-5 items-center justify-center rounded-full bg-white" aria-hidden="true">
      <img src="/google-g.svg" alt="" className="size-[18px]" />
    </span>
  )
}

function ShellPreview() {
  return (
    <figure className="mx-auto w-full max-w-[1280px]">
      <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-[var(--elevation-2)]">
        <img
          src="/v2-shell-travel.png"
          alt="Dana showing the Travel folder with tasks, sections, sharing, views, filters, and comments."
          className="block h-auto w-full"
        />
      </div>
      {/* This is a deliberate two-tone brand surface. Its light text must
          stay light when the semantic theme roles invert. */}
      <figcaption className="mt-5 flex items-start justify-between gap-8 text-xs leading-5 text-[var(--color-graphite-400)]">
        <span className="font-semibold tracking-[0.1em] uppercase">Built around shareable folders</span>
        <span className="max-w-[46ch] text-right">
          One folder keeps every person, task, and decision in context.
        </span>
      </figcaption>
    </figure>
  )
}

function LegacyLandingScreen() {
  /* Review S5's instrument: the headline's second line steps back either by
     tone (the standing treatment) or by weight (`?headline=weight`), and
     Imran picks by looking — the plan's rule for a decision of this size.
     The copy does not move either way; the losing rule and the param leave
     with the decision. */
  const headlineByWeight =
    new URLSearchParams(window.location.search).get("headline") === "weight"
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-8 py-6">
        <DanaIdentity />
        <nav className="flex items-center gap-6 text-sm text-muted-foreground" aria-label="Public navigation">
          <a href="#privacy" className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
            Privacy
          </a>
          <a href="#terms" className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
            Terms
          </a>
        </nav>
      </header>

      <section className="px-8 pt-16 pb-20 text-center">
        <div className="mx-auto max-w-[940px]">
          <p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            Personal focus. Shared plans.
          </p>
          <h1 className="mt-5 text-[clamp(46px,4.2vw,62px)] leading-[1.03] font-semibold tracking-[-0.045em] text-foreground">
            <span className="block">Your tasks, kept clear.</span>
            <span
              className={
                headlineByWeight
                  ? "mt-1 block font-normal"
                  : "mt-1 block text-muted-foreground"
              }
            >
              Your plans, shared.
            </span>
          </h1>
          <p className="mx-auto mt-7 max-w-[600px] text-base leading-7 text-muted-foreground">
            Dana brings personal tasks and collaborative to-do lists together in clear, shareable folders—so everyone knows what comes next.
          </p>

          <Button
            type="button"
            className="mt-9 h-11 min-w-56 gap-3 bg-foreground px-5 text-sm font-medium text-background shadow-none hover:bg-card-foreground"
          >
            <GoogleGlyph />
            Continue with Google
          </Button>
          <p className="mx-auto mt-4 max-w-[44ch] text-xs leading-5 text-muted-foreground">
            Dana requests only your Google profile and email for sign-in, sharing, and invitations.
          </p>
        </div>

      </section>

      {/* Deliberate two-tone public surface: the graphite ground and reversed
          mark are brand composition, not theme roles, so they must not invert. */}
      <section className="relative overflow-hidden bg-[var(--color-graphite-950)] px-8 py-16">
        <DanaMark
          className="pointer-events-none absolute -top-36 -right-36 size-[520px] opacity-[0.14]"
          surface="dark"
          plate={false}
        />
        <div className="relative z-10">
          <ShellPreview />
        </div>
      </section>

      <section className="border-y border-border bg-card px-8 py-16">
        <div className="mx-auto grid w-full max-w-[1280px] grid-cols-3 divide-x divide-border">
          <article className="pr-12">
            <p className="text-2xl leading-8 font-medium tracking-[-0.025em]">Plan privately.</p>
            <p className="mt-4 max-w-[36ch] text-sm leading-6 text-muted-foreground">
              Keep personal work focused.
            </p>
          </article>
          <article className="px-12">
            <p className="text-2xl leading-8 font-medium tracking-[-0.025em]">Coordinate clearly.</p>
            <p className="mt-4 max-w-[36ch] text-sm leading-6 text-muted-foreground">
              Share only the folders that need other people.
            </p>
          </article>
          <article className="pl-12">
            <p className="text-2xl leading-8 font-medium tracking-[-0.025em]">Built around shareable folders</p>
            <p className="mt-4 max-w-[36ch] text-sm leading-6 text-muted-foreground">
              One folder keeps every person, task, and decision in context.
            </p>
          </article>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-[1280px] items-center gap-5 px-8 py-8 text-xs text-muted-foreground">
          <span>© 2026 Dana</span>
          <a href="#privacy" className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
            Privacy
          </a>
          <a href="#terms" className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
            Terms
          </a>
      </footer>
    </main>
  )
}

export function UnverifiedEmailScreen() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--color-graphite-25)] px-14 py-12">
      <section className="grid min-h-[520px] w-full max-w-[940px] grid-cols-[320px_minmax(0,1fr)] overflow-hidden rounded-[18px] border border-[var(--color-graphite-200)] bg-white shadow-[0_30px_90px_rgb(24_24_27/12%)]">
        <div className="relative overflow-hidden bg-[var(--color-graphite-950)] p-9 text-white">
          <div className="relative z-10 inline-flex items-center gap-3 text-sm font-semibold">
            <DanaMark className="size-9" surface="dark" />
            <span>Dana</span>
          </div>

          <DanaMark
            className="pointer-events-none absolute top-20 -right-40 size-[440px] opacity-[0.14]"
            surface="dark"
            plate={false}
          />

          <div className="absolute right-9 bottom-9 left-9 h-px bg-white/15" aria-hidden="true" />
        </div>

        <div className="flex items-center px-14 py-16">
          <div className="max-w-[470px]">
            <div className="flex size-12 items-center justify-center rounded-[12px] border border-[var(--color-graphite-200)] bg-[var(--color-graphite-25)] text-[var(--color-graphite-700)] shadow-[0_6px_18px_rgb(24_24_27/7%)]">
              <MailWarning className="size-5" strokeWidth={1.75} aria-hidden="true" />
            </div>

            <h1 className="mt-7 text-[36px] leading-[1.14] font-semibold tracking-[-0.035em] text-[var(--color-graphite-950)]">
              We can&apos;t sign you in yet
            </h1>
            <p className="mt-5 max-w-[46ch] text-[15px] leading-7 text-[var(--color-graphite-600)]">
              Your Google email address isn&apos;t verified. Dana uses your email for sharing and invites, so it needs Google to confirm it first. Verify your email with Google, then try again.
            </p>
            <Button
              className="mt-8 h-11 gap-2.5 bg-[var(--color-graphite-950)] px-5 text-sm font-medium text-white shadow-none hover:bg-[var(--color-graphite-800)]"
              render={<a href="?view=landing" />}
            >
              <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />
              Back to Dana
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
}

type LoginInvite = {
  id: string
  inviter: string
  initials: string
  avatarColor: string
  folderName?: string
  folderColor?: string
}

const loginInviteFixtures: LoginInvite[] = [
  {
    id: "invite-wedding",
    inviter: "Hassan",
    initials: "HA",
    avatarColor: "var(--color-folder-fern)",
    folderName: "Travel",
    folderColor: "var(--color-graphite-900)",
  },
  {
    id: "invite-sara",
    inviter: "Sara",
    initials: "SK",
    avatarColor: "var(--color-folder-rose)",
  },
]

export function InviteGateScreen() {
  const previewState = new URLSearchParams(window.location.search).get("state")
  const [invites, setInvites] = useState(
    previewState === "single" ? loginInviteFixtures.slice(0, 1) : loginInviteFixtures,
  )
  const actionError = previewState === "error"

  function resolveInvite(invite: LoginInvite, accepted: boolean) {
    if (actionError) return

    if (accepted && invite.folderName) {
      window.location.href = `?variant=sidebar-first&state=folder&folder=${encodeURIComponent(invite.folderName)}`
      return
    }

    const remaining = invites.filter((candidate) => candidate.id !== invite.id)
    setInvites(remaining)
    if (remaining.length === 0) window.location.href = "?variant=sidebar-first"
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--color-graphite-25)] px-14 py-12">
      <section className="grid min-h-[520px] w-full max-w-[940px] grid-cols-[280px_minmax(0,1fr)] overflow-hidden rounded-[18px] border border-[var(--color-graphite-200)] bg-white shadow-[0_30px_90px_rgb(24_24_27/12%)]">
        <div className="relative overflow-hidden bg-[var(--color-graphite-950)] p-8 text-white">
          <div className="relative z-10 inline-flex items-center gap-3 text-sm font-semibold">
            <DanaMark className="size-9" surface="dark" />
            <span>Dana</span>
          </div>

          <DanaMark
            className="pointer-events-none absolute top-20 -right-44 size-[440px] opacity-[0.14]"
            surface="dark"
            plate={false}
          />

          <div className="absolute right-8 bottom-8 left-8 border-t border-white/15 pt-5">
            <p className="text-[34px] leading-none font-semibold tracking-[-0.04em] tabular-nums">
              {invites.length}
            </p>
            <p className="mt-2 text-xs font-medium tracking-[0.08em] text-[var(--color-graphite-400)] uppercase">
              {invites.length === 1 ? "Invitation" : "Invitations"}
            </p>
          </div>
        </div>

        <div className="flex flex-col px-10 py-9">
          <div className="flex items-center gap-3 border-b border-[var(--color-graphite-200)] pb-5">
            <div>
              <p className="text-xs font-semibold tracking-[0.1em] text-[var(--color-graphite-500)] uppercase">
                Before you continue
              </p>
              <h1 className="mt-1.5 text-[28px] leading-9 font-semibold tracking-[-0.03em] text-[var(--color-graphite-950)]">
                Invitations
              </h1>
            </div>
            {/* No count chip here (review S3): the dark panel already states
                the count as its 34px numeral, and a number said twice on one
                screen is a number the reader has to reconcile. */}
          </div>

          {actionError ? (
            <div className="mt-5 flex items-start gap-3 rounded-[10px] border border-[var(--color-danger-200)] bg-[var(--color-danger-50)] px-4 py-3 text-sm text-[var(--color-danger-700)]" role="alert">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>Something went wrong. Nothing was saved. Try again.</span>
            </div>
          ) : null}

          <div className="divide-y divide-[var(--color-graphite-200)]">
            {invites.map((invite) => {
              const invitationCopy = invite.folderName
                ? `${invite.inviter} invited you to ${invite.folderName}`
                : `${invite.inviter} invited you to connect`

              return (
                <article key={invite.id} className="grid min-h-[116px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3.5 py-5">
                  <Avatar>
                    <AvatarFallback
                      className="text-xs font-semibold text-white"
                      style={{ background: invite.avatarColor }}
                    >
                      {invite.initials}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--color-graphite-900)]">
                      {invitationCopy}
                    </p>
                    {/* A div rather than a p: this line holds an icon, and an
                        icon in this product may render a wrapper element,
                        which HTML forbids inside a paragraph. It was only ever
                        a paragraph by habit -- it is a label. */}
                    <div className="mt-2 flex items-center gap-2 text-xs text-[var(--color-graphite-500)]">
                      {invite.folderName ? (
                        <>
                          <FolderOpen
                            className="size-4"
                            style={{ color: invite.folderColor }}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          Shared folder
                        </>
                      ) : (
                        <>
                          <UserRoundPlus className="size-4" strokeWidth={1.75} aria-hidden="true" />
                          Connection
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      className="h-8 border-[var(--color-graphite-300)] bg-white px-3.5 text-xs shadow-none hover:bg-[var(--color-graphite-50)]"
                      onClick={() => resolveInvite(invite, false)}
                    >
                      Decline
                    </Button>
                    <Button
                      className="h-8 bg-[var(--color-graphite-950)] px-3.5 text-xs text-white shadow-none hover:bg-[var(--color-graphite-800)]"
                      onClick={() => resolveInvite(invite, true)}
                    >
                      Accept
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </section>
    </main>
  )
}
