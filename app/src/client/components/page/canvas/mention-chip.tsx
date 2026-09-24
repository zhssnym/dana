/*
The person-mention chip (Wave 2, W-D), without BlockNote: the editor's inline
spec (`mentions.tsx`) and a thread post's reader (`thread/PostView.tsx`, which
must not import BlockNote) draw the same chip.
*/
import { PersonFace } from '../../person-face.js'

const CHIP = 'dana-mention mx-px inline-flex max-w-[24rem] items-center gap-1 rounded-md bg-muted py-px pr-1.5 pl-0.5 align-baseline text-[length:var(--text-body-size)] leading-[1.5] text-foreground'

/** The name a chip shows: the stored text without its `@`. */
export function mentionName(label: string): string {
  const name = label.replace(/^@/, '').trim()
  return name === '' ? 'Someone' : name
}

export function MentionChip({ label }: { readonly label: string }): React.JSX.Element {
  const name = mentionName(label)
  return (
    <span className={CHIP} contentEditable={false} data-mention="">
      <PersonFace name={name} dense className="shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  )
}

