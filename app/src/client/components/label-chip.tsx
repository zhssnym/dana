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

/** Labels in the one order every surface draws them: by name. */
export function byName<T extends { readonly name: string }>(labels: readonly T[]): T[] {
  return [...labels].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
}

/** The longest single name a narrow, crowded board card still draws. */
const CARD_NAME = 10

/**
 * A row's labels: the first two by name, then "+N". On a phone, and for two or
 * more names on a board card too narrow for them (the card is the `card`
 * container), only the dots, so the title keeps the width and no name is cut
 * to three letters. One name on a narrow card is kept, truncated, unless it is
 * long and the line is `crowded`, where it would be cut to nothing.
 *
 * Only a name ever shrinks: once the names are dots, the dots and "+N" keep
 * their size and gap, so a tight line never piles them onto each other or
 * under the avatar beside them.
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
  const shown = sorted.slice(0, 2)
  const more = sorted.length - shown.length
  const several = sorted.length > 1
  const cardDots = several || (crowded && (sorted[0]?.name.length ?? 0) > CARD_NAME)
  const dotsOnly = cn("max-md:shrink-0", cardDots && "@max-[20rem]/card:shrink-0")
  return (
    <span
      className={cn("flex min-w-0 max-w-[16rem] shrink items-center gap-2", dotsOnly)}
      title={sorted.map((label) => label.name).join(", ")}
    >
      {shown.map((label) => (
        <span key={label.id} className={cn("flex min-w-0 items-center gap-1.5", dotsOnly)}>
          <LabelDot color={label.color} />
          <span
            className={cn(
              "truncate max-md:sr-only",
              /* Two names share the line, so each is capped and a short one
                 is never cut by a long one; one name takes what the line has. */
              several && "max-w-[7rem]",
              cardDots && "@max-[20rem]/card:sr-only",
            )}
          >
            {label.name}
          </span>
        </span>
      ))}
      {more > 0 ? <span className="shrink-0 tabular-nums">+{more}</span> : null}
    </span>
  )
}
