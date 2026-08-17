import type { LucideIcon } from "lucide-react"
import {
  Bell,
  CalendarClock,
  FolderOpen,
  MailPlus,
  UserRoundPlus,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type EmailType = "invite" | "share" | "reminder"

type EmailContent = {
  purpose: string
  purposeIcon: LucideIcon
  heading: string
  body: string
  contextIcon: LucideIcon
  contextColor: string
  contextTitle: string
  contextMeta: string
  action: string
  href: string
}

function readEmailContent(): EmailContent {
  const params = new URLSearchParams(window.location.search)
  const requestedType = params.get("type") as EmailType | null
  const type: EmailType =
    requestedType === "share" || requestedType === "reminder"
      ? requestedType
      : "invite"
  const variant = params.get("variant")

  if (type === "share") {
    return {
      purpose: "Folder shared",
      purposeIcon: FolderOpen,
      heading: "Wedding was shared with you",
      body: "Hassan shared this folder with you. It is ready in Dana.",
      contextIcon: FolderOpen,
      contextColor: "var(--color-graphite-900)",
      contextTitle: "Wedding",
      contextMeta: "Shared folder · Shared by Hassan",
      action: "Open Wedding",
      href: "?variant=sidebar-first&state=folder&folder=Wedding",
    }
  }

  if (type === "reminder") {
    return {
      purpose: "Task reminder",
      purposeIcon: Bell,
      heading: "Confirm the final guest count",
      body: "A reminder from your Wedding folder.",
      contextIcon: CalendarClock,
      contextColor: "var(--color-graphite-700)",
      contextTitle: variant === "date-only" ? "Today" : "Today, 2:00 PM",
      contextMeta: "Wedding · Task reminder",
      action: "Open task",
      href: "?variant=sidebar-first&view=form&form=expanded&entry=folder&review=edit",
    }
  }

  if (variant === "connection") {
    return {
      purpose: "Connection invitation",
      purposeIcon: MailPlus,
      heading: "Connect with Hassan",
      body: "Hassan invited you to connect in Dana for easier folder sharing.",
      contextIcon: UserRoundPlus,
      contextColor: "var(--color-graphite-900)",
      contextTitle: "Hassan",
      contextMeta: "Connection invitation",
      action: "Review invitation",
      href: "?view=invites",
    }
  }

  return {
    purpose: "Folder invitation",
    purposeIcon: MailPlus,
    heading: "You're invited to Wedding",
    body: "Hassan invited you to join a shared folder in Dana.",
    contextIcon: FolderOpen,
    contextColor: "var(--color-graphite-900)",
    contextTitle: "Wedding",
    contextMeta: "Shared folder · From Hassan",
    action: "Review invitation",
    href: "?view=invites",
  }
}

export function TransactionalEmailScreen() {
  const email = readEmailContent()
  const PurposeIcon = email.purposeIcon
  const ContextIcon = email.contextIcon

  return (
    <main className="flex min-h-screen items-start justify-center bg-[var(--color-graphite-50)] px-6 py-14">
      <article className="w-full max-w-[600px] overflow-hidden rounded-[14px] border border-[var(--color-graphite-200)] bg-white shadow-[var(--elevation-1)]">
        <div className="h-1 bg-[var(--color-graphite-950)]" aria-hidden="true" />
        <header className="flex min-h-[68px] items-center gap-3 border-b border-[var(--color-graphite-200)] px-10">
          <img src="/dana-mark.svg" alt="" className="size-8" />
          <span className="text-sm font-semibold text-[var(--color-graphite-900)]">Dana</span>
          <Badge
            variant="secondary"
            className="ml-auto h-6 border border-[var(--color-graphite-200)] bg-[var(--color-graphite-50)] px-2.5 text-[10px] font-medium tracking-[0.04em] text-[var(--color-graphite-600)]"
          >
            {email.purpose}
          </Badge>
        </header>

        <div className="px-10 py-10">
          <div className="flex size-11 items-center justify-center rounded-[10px] border border-[var(--color-graphite-200)] bg-[var(--color-graphite-25)] text-[var(--color-graphite-700)] shadow-[0_5px_14px_rgb(24_24_27/6%)]">
            <PurposeIcon className="size-5" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <h1 className="mt-6 text-[28px] leading-9 font-semibold tracking-[-0.035em] text-[var(--color-graphite-950)]">
            {email.heading}
          </h1>
          <p className="mt-3 max-w-[48ch] text-sm leading-6 text-[var(--color-graphite-600)]">
            {email.body}
          </p>

          <div className="mt-8 flex min-h-[72px] items-center gap-3 rounded-[10px] border border-[var(--color-graphite-200)] bg-[var(--color-graphite-25)] px-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-graphite-200)] bg-white">
              <ContextIcon
                className="size-4"
                style={{ color: email.contextColor }}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--color-graphite-900)]">
                {email.contextTitle}
              </p>
              <p className="mt-1 truncate text-xs text-[var(--color-graphite-500)]">
                {email.contextMeta}
              </p>
            </div>
          </div>

          <Button
            render={<a href={email.href} />}
            className="mt-8 h-10 bg-[var(--color-graphite-950)] px-4 text-sm font-medium text-white shadow-none hover:bg-[var(--color-graphite-800)]"
          >
            {email.action}
          </Button>
        </div>

        <footer className="flex min-h-14 items-center border-t border-[var(--color-graphite-200)] bg-[var(--color-graphite-25)] px-10 text-xs text-[var(--color-graphite-500)]">
          Sent by Dana
        </footer>
      </article>
    </main>
  )
}
