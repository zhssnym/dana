/*
A new project's background (step 7): what the project is for, picked once.

It fills the page body until someone picks, across reloads, because the
project's kind is stored as unpicked (`folders.kind` null on the root) and
`POST /folders/:id/tabs` is what picks it. "The usual project" comes first
and carries the screen: Purpose, Work, Results and Discussion in one click,
the structure every project had before step 7. Then one page to start with,
as quiet rows. The pick becomes the first tab; the "+" adds the rest later.

A reader who may not edit the project's pages is offered nothing to press.
*/
import type { PageKind } from '../../shared/folders.js'
import { cn } from './ui/utils.js'

type Pick = PageKind | 'usual'

const ONE_PAGE: readonly { readonly kind: PageKind; readonly name: string; readonly line: string }[] = [
  { kind: 'doc', name: 'Doc', line: 'Freeform writing: a purpose, results, a list.' },
  { kind: 'work', name: 'Work', line: 'Tasks on one line, from done to next.' },
  { kind: 'discussion', name: 'Discussion', line: 'Threads. One per project.' },
]

const ROW =
  'flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left hover:bg-accent disabled:opacity-50'

export function ProjectPicker({
  editable,
  pending,
  onPick,
}: {
  readonly editable: boolean
  readonly pending: boolean
  readonly onPick: (kind: Pick) => void
}): React.JSX.Element {
  if (!editable) {
    return <p className="mt-6 text-sm text-muted-foreground">Nobody has picked what this project is for yet.</p>
  }
  return (
    <section aria-label="Start this project" className="mt-6 flex max-w-md flex-col gap-[var(--space-group)]">
      <button
        type="button"
        disabled={pending}
        onClick={() => onPick('usual')}
        className={cn(ROW, 'border border-border py-3')}
      >
        <span className="font-title text-foreground">The usual project</span>
        <span className="text-sm text-muted-foreground">Purpose, Work, Results and Discussion.</span>
      </button>
      <div className="flex flex-col gap-[var(--space-row)]">
        <h2 className="px-3 text-sm text-muted-foreground">Or start with one page</h2>
        {ONE_PAGE.map((option) => (
          <button key={option.kind} type="button" disabled={pending} onClick={() => onPick(option.kind)} className={ROW}>
            <span className="font-section text-sm text-foreground">{option.name}</span>
            <span className="text-sm text-muted-foreground">{option.line}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
