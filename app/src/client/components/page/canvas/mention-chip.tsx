// The person mention mark, shared by the editor and thread posts (which must not
// import BlockNote). Plain "@Name" text with a tint, no face.

const MENTION =
  'dana-mention mx-px rounded-sm bg-selected px-0.5 font-medium text-foreground [box-decoration-break:clone]'

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
