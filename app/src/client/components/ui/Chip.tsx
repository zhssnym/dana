/*
The small labelled adornments a row carries: the assignee chip, the
"unassigned" chip of Q3, the "Abandoned" chip of 9.5, and the invite-pending
chip of 9.8.

One element with one text node, which is a contract rather than a
simplification. Section 9 addresses a chip by the words on it, and a chip
built as an icon beside a separately wrapped label reads as two things to
anything matching text: the wrapper carries no text node of its own and the
label carries the words without the chip around it. So the glyph, where a
chip has one, is `aria-hidden` and sits inside the same element as the text.
*/
import type { ReactNode } from 'react'

/**
 * A member's initials, for the avatar the design pairs with a name.
 *
 * "Initials only in v1" is the design's own scope for an avatar, and 7.0's
 * person shape carries `avatar_url` beside `display_name`, so this is a
 * deliberate narrowing rather than a missing feature. Two letters at most,
 * taken from the first and last word, which is what makes "Imran Hassan" read
 * as IH and a single name as its first letter.
 */
export function initialsOf(name: string | null): string | undefined {
  if (name === null) return undefined
  const words = name.trim().split(/\s+/).filter((word) => word !== '')
  const first = words[0]
  if (first === undefined) return undefined
  const last = words.length > 1 ? words[words.length - 1] : undefined
  return (first.charAt(0) + (last === undefined ? '' : last.charAt(0))).toUpperCase()
}

/**
 * The four shapes the design's section 04 draws, and no more.
 *
 * `default` is the filled neutral pill, `alert` the danger tint carrying its
 * own 700 ink, `info` the same construction in the info family (9.8's
 * invite-pending chip), and `outline` the bordered pill with no fill, which is
 * what an assignee chip and Q3's "unassigned" chip are drawn as. Widened from
 * two tones at P8D; `default` and `alert` mean exactly what they did, so no
 * caller changed.
 */
export type ChipTone = 'default' | 'alert' | 'info' | 'outline'

const TONE_CLASS: Record<ChipTone, string> = {
  default: 'chip',
  alert: 'chip chip-alert',
  info: 'chip chip-info',
  outline: 'chip chip-outline',
}

interface ChipProps {
  readonly children: ReactNode
  /** A decorative glyph. Hidden from the accessibility tree; never the cue. */
  readonly glyph?: string
  /** The overdue and alerting treatment; the label beside it is the cue. */
  readonly tone?: ChipTone
  readonly title?: string
}

export function Chip({
  children,
  glyph,
  tone = 'default',
  title,
}: ChipProps): React.JSX.Element {
  return (
    <span className={TONE_CLASS[tone]} title={title}>
      {glyph === undefined ? null : (
        <span aria-hidden="true" className="avatar avatar-chip">
          {glyph}
        </span>
      )}
      {children}
    </span>
  )
}
