/*
The person mention (Wave 2, W-D; r7), without BlockNote: the editor's inline
spec (`mentions.tsx`) and a thread post's reader (`thread/PostView.tsx`, which
must not import BlockNote) draw the same mark.

Slack's: plain "@Name" text on the line's own baseline, told apart by a soft
accent tint and weight, with no face. A face keyed by the stored name was a
second, different face for the same person (r6 audit S2), and an inline-flex
chip grew the line box past the body's.
*/

const MENTION =
  'dana-mention mx-px rounded-sm bg-selected px-0.5 font-medium text-foreground [box-decoration-break:clone]'

/** The name a mention shows: the stored text without its `@`. */
export function mentionName(label: string): string {
  const name = label.replace(/^@/, '').trim()
  return name === '' ? 'Someone' : name
}

export function MentionChip({ label }: { readonly label: string }): React.JSX.Element {
  return (
    <span className={MENTION} contentEditable={false} data-mention="">
      @{mentionName(label)}
    </span>
  )
}
