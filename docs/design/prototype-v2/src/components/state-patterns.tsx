import type { LucideIcon } from "lucide-react"
import { AlertCircle, Clock3, RefreshCw, WifiOff, X } from "lucide-react"

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export function OfflineBanner({ className }: { className?: string }) {
  return (
    <Alert
      className={cn(
        "min-h-[var(--control-height)] rounded-md border-[var(--color-warning-200)] bg-[var(--color-warning-100)] px-3 py-2 text-[var(--color-warning-700)]",
        className,
      )}
      role="status"
    >
      <WifiOff className="size-4" strokeWidth={1.75} aria-hidden="true" />
      <AlertDescription className="text-sm text-[var(--color-warning-700)]">
        You&apos;re offline. Dana needs a connection; changes can&apos;t be saved right now.
      </AlertDescription>
    </Alert>
  )
}

export function InlineError() {
  return (
    <Alert variant="destructive" className="min-h-20 pr-28">
      <AlertCircle className="size-4" strokeWidth={1.75} aria-hidden="true" />
      <AlertTitle className="text-sm">
        Something went wrong. Nothing was saved. Try again.
      </AlertTitle>
      <AlertAction className="top-1/2 -translate-y-1/2">
        <Button
          variant="outline"
          className="h-[var(--control-height)] px-3 text-sm"
        >
          <RefreshCw
            data-icon="inline-start"
            className="size-4"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          Retry
        </Button>
      </AlertAction>
    </Alert>
  )
}

export type SystemToastKind = "offline-write" | "error" | "rate-limit"

export function SystemToast({
  kind,
  className,
  onDismiss,
}: {
  kind: SystemToastKind
  className?: string
  onDismiss?: () => void
}) {
  const content = {
    "offline-write": {
      icon: WifiOff,
      message: "Couldn't save. You're offline.",
    },
    error: {
      icon: AlertCircle,
      message: "Something went wrong. Nothing was saved. Try again.",
    },
    "rate-limit": {
      icon: Clock3,
      message: "Too many requests. Try again in 24 seconds.",
    },
  }[kind]
  const Icon = content.icon

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed z-50 flex min-h-12 w-[360px] items-center gap-3 rounded-lg bg-[var(--color-graphite-900)] px-3.5 py-2.5 text-sm text-white shadow-[var(--elevation-2)]",
        className,
      )}
    >
      <Icon
        className="size-4 shrink-0 text-[var(--color-graphite-300)]"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 leading-5">{content.message}</span>
      {onDismiss ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-[var(--color-graphite-300)] hover:bg-white/10 hover:text-white"
          aria-label="Dismiss message"
          onClick={onDismiss}
        >
          <X className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  )
}

function SkeletonRow({ short = false }: { short?: boolean }) {
  return (
    <div className="grid min-h-[var(--task-row-height)] grid-cols-[var(--control-height)_minmax(0,1fr)_7.5rem] items-center gap-2 rounded-md px-1">
      <div className="flex size-[var(--control-height)] items-center justify-center">
        <Skeleton className="size-[var(--checkbox-size)] rounded-sm" />
      </div>
      <Skeleton className={short ? "h-3.5 w-2/5" : "h-3.5 w-3/5"} />
      <Skeleton className="ml-auto h-5 w-24 rounded-full" />
    </div>
  )
}

export function SkeletonList() {
  return (
    <div
      className="space-y-1 rounded-lg border border-border bg-card p-1"
      aria-label="Loading tasks"
      aria-busy="true"
    >
      <SkeletonRow />
      <SkeletonRow short />
      <SkeletonRow />
    </div>
  )
}

export function EmptyState({
  label,
  copy,
  icon: Icon,
}: {
  label: string
  copy: string
  icon: LucideIcon
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <Empty className="min-h-36 p-6">
        <EmptyMedia className="text-[var(--color-graphite-400)]">
          <Icon className="size-8" strokeWidth={1.75} aria-hidden="true" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyDescription className="max-w-[52ch] text-sm leading-5 text-muted-foreground">
            {copy}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}
