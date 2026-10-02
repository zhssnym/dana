/*
One Label identity everywhere Dana draws it (#493): a quiet colour-tinted pill.
The colour is the stored hex (`parts/identity-colors.ts` says why a shared
identity colour is a literal and not a token), while the fill and ring are
transparent derivations of that same identity. Labels therefore read as real
objects without becoming louder than the Task they classify.
*/
import { cn } from "./ui/utils.js"

export interface LabelLook {
  readonly id: string
  readonly name: string
  readonly color: string
}

function tint(color: string, alpha: number): string {
  const hex = color.startsWith('#') ? color.slice(1) : color
  if (!/^[0-9a-f]{6}$/i.test(hex)) return color
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  return `rgb(${r} ${g} ${b} / ${String(alpha)})`
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
    <span
      className={cn(
        "inline-flex h-5 min-w-0 max-w-full items-center rounded-full px-2 text-[11px] font-medium leading-none",
        className,
      )}
      style={{
        color: label.color,
        backgroundColor: tint(label.color, 0.13),
        boxShadow: `inset 0 0 0 1px ${tint(label.color, 0.24)}`,
      }}
      title={label.name}
    >
      <span className="truncate">{label.name}</span>
    </span>
  )
}

/** Labels in the one order every surface draws them: by name. */
export function byName<T extends { readonly name: string }>(labels: readonly T[]): T[] {
  return [...labels].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
}

/**
 * Dense rows keep the Task title first. Desktop shows at most two pills and
 * then +N; a metadata-heavy row or narrow screen shows one and counts the
 * rest. The same component feeds Work rows and Board cards, so neither surface
 * invents another Label language.
 */
export function RowLabels({
  labels,
  crowded = false,
}: {
  readonly labels: readonly LabelLook[]
  readonly crowded?: boolean
}) {
  if (labels.length === 0) return null
  const sorted = byName(labels)
  const desktop = sorted.slice(0, crowded ? 1 : 2)
  const desktopMore = sorted.length - desktop.length
  const mobileMore = sorted.length - 1
  return (
    <span className="flex min-w-0 max-w-[16rem] shrink items-center" title={sorted.map((label) => label.name).join(', ')}>
      <span className="hidden min-w-0 items-center gap-1 md:flex">
        {desktop.map((label) => <LabelChip key={label.id} label={label} className="max-w-[7rem]" />)}
        {desktopMore > 0 ? <span className="shrink-0 tabular-nums text-muted-foreground">+{desktopMore}</span> : null}
      </span>
      <span className="flex min-w-0 items-center gap-1 md:hidden">
        <LabelChip label={sorted[0]!} className="max-w-[7rem]" />
        {mobileMore > 0 ? <span className="shrink-0 tabular-nums text-muted-foreground">+{mobileMore}</span> : null}
      </span>
    </span>
  )
}
