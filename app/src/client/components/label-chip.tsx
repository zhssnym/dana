/*
How a Label looks wherever it is drawn (#208): its colour as a small dot and
its name in the surrounding ink. No pill, no fill: a row carries its labels
without the labels carrying the row.

The colour is the stored hex (`parts/identity-colors.ts` says why a shared
identity colour is a literal and not a token), so it is a style, not a class.
*/
import { cn } from "./ui/utils.js"

export interface LabelLook {
  readonly id: string
  readonly name: string
  readonly color: string
}

export function LabelDot({ color, className }: { readonly color: string; readonly className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color }}
    />
  )
}

export function LabelChip({ label, className }: { readonly label: LabelLook; readonly className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <LabelDot color={label.color} />
      <span className="truncate">{label.name}</span>
    </span>
  )
}

/**
 * A row's labels: the first two by name, then "+N". On a phone only the dots,
 * so the title keeps the width.
 */
export function RowLabels({ labels }: { readonly labels: readonly LabelLook[] }) {
  if (labels.length === 0) return null
  const shown = labels.slice(0, 2)
  const more = labels.length - shown.length
  return (
    <span
      className="flex min-w-0 max-w-[14rem] shrink items-center gap-2"
      title={labels.map((label) => label.name).join(", ")}
    >
      {shown.map((label) => (
        <span key={label.id} className="flex min-w-0 items-center gap-1.5">
          <LabelDot color={label.color} />
          <span className="truncate max-md:sr-only">{label.name}</span>
        </span>
      ))}
      {more > 0 ? <span className="shrink-0 tabular-nums">+{more}</span> : null}
    </span>
  )
}
