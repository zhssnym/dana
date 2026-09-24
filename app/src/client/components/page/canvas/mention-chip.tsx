/*
The person-mention chip (Wave 2, W-D), without BlockNote: the editor's inline
spec (`mentions.tsx`) and a thread post's reader (`thread/PostView.tsx`, which
must not import BlockNote) draw the same chip.
*/
import { PersonFace } from '../../person-face.js'

/* The name, not the face, sets the chip's baseline: a flex box takes its
   baseline from its first baseline-aligned item, and a face has no text, so
   `items-center` alone put the chip's text above the line's. */
const CHIP = 'dana-mention mx-px inline-flex max-w-[24rem] items-baseline gap-1 rounded-md bg-muted py-px pr-1.5 pl-0.5 align-baseline text-[length:var(--text-body-size)] leading-[1.5] text-foreground'

/** The name a chip shows: the stored text without its `@`. */
export function mentionName(label: string): string {
  const name = label.replace(/^@/, '').trim()
  return name === '' ? 'Someone' : name
}

export function MentionChip({ label }: { readonly label: string }): React.JSX.Element {
  const name = mentionName(label)
  return (
    <span className={CHIP} contentEditable={false} data-mention="">
      <PersonFace name={name} dense className="shrink-0 self-center" />
      <span className="truncate">{name}</span>
    </span>
  )
}

