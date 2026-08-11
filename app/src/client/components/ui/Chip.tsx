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

interface ChipProps {
  readonly children: ReactNode
  /** A decorative glyph. Hidden from the accessibility tree; never the cue. */
  readonly glyph?: string
  /** The overdue and alerting treatment; the label beside it is the cue. */
  readonly tone?: 'default' | 'alert'
  readonly title?: string
}

export function Chip({
  children,
  glyph,
  tone = 'default',
  title,
}: ChipProps): React.JSX.Element {
  return (
    <span className={tone === 'alert' ? 'chip chip-alert' : 'chip'} title={title}>
      {glyph === undefined ? null : <span aria-hidden="true">{glyph}</span>}
      {children}
    </span>
  )
}
