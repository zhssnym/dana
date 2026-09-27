/*
A new project's background (step 7): what the project is for, picked once.

It fills the page body until someone picks, across reloads, because the
project's kind is stored as unpicked (`folders.kind` null on the root) and
`POST /folders/:id/tabs` is what picks it. "The usual project" comes first
and carries the screen: Purpose, Work, Results and Discussion in one click,
the structure every project had before step 7. Then one page to start with,
as three equal cards, each in its kind's pastel (tokens.css, m14-picker). The pick becomes the first tab; the "+" adds the rest later.

A reader who may not edit the project's pages is offered nothing to press.
*/
import type { PageKind } from '../../shared/folders.js'
import { FileText, ListTodo, MessageSquare, type LucideIcon } from '../lib/icons.js'
import { cn } from './ui/utils.js'

type Pick = PageKind | 'usual'

/* Literal class strings per kind, so Tailwind sees every one. */
const KIND: Record<Pick, { readonly card: string; readonly ink: string; readonly chip: string }> = {
  doc: {
    card: 'bg-[var(--kind-doc)] border-[var(--kind-doc-line)] enabled:hover:border-[var(--kind-doc-ink)]',
    ink: 'text-[var(--kind-doc-ink)]',
    chip: 'bg-[var(--kind-doc)] border-[var(--kind-doc-line)] text-[var(--kind-doc-ink)]',
  },
  work: {
    card: 'bg-[var(--kind-work)] border-[var(--kind-work-line)] enabled:hover:border-[var(--kind-work-ink)]',
    ink: 'text-[var(--kind-work-ink)]',
    chip: 'bg-[var(--kind-work)] border-[var(--kind-work-line)] text-[var(--kind-work-ink)]',
  },
  discussion: {
    card: 'bg-[var(--kind-discussion)] border-[var(--kind-discussion-line)] enabled:hover:border-[var(--kind-discussion-ink)]',
    ink: 'text-[var(--kind-discussion-ink)]',
    chip: 'bg-[var(--kind-discussion)] border-[var(--kind-discussion-line)] text-[var(--kind-discussion-ink)]',
  },
  usual: {
    card: 'bg-[var(--kind-usual)] border-[var(--kind-usual-line)] enabled:hover:border-[var(--kind-usual-ink)]',
    ink: 'text-[var(--kind-usual-ink)]',
    chip: '',
  },
}

const ONE_PAGE: readonly {
  readonly kind: PageKind
  readonly name: string
  readonly line: string
  readonly icon: LucideIcon
}[] = [
  { kind: 'doc', name: 'Doc', line: 'Freeform writing: notes, a plan, a gear list.', icon: FileText },
  { kind: 'work', name: 'Work', line: 'Tasks on one line, from done to next.', icon: ListTodo },
  { kind: 'discussion', name: 'Discussion', line: 'Threads to talk things through.', icon: MessageSquare },
]

/* The usual project's four tabs, as its chips show them. */
const USUAL_TABS: readonly { readonly name: string; readonly kind: PageKind }[] = [
  { name: 'Purpose', kind: 'doc' },
  { name: 'Work', kind: 'work' },
  { name: 'Results', kind: 'doc' },
  { name: 'Discussion', kind: 'discussion' },
]

/* Lifts 2px on hover (--lift is 0 under reduced motion). */
const CARD =
  'flex w-full flex-col items-center gap-2 rounded-[var(--radius-card)] border p-5 text-center transition-[translate,border-color] duration-[var(--duration-fast)] enabled:hover:translate-y-[var(--lift)] disabled:opacity-50'

export function ProjectPicker({
  editable,
  pending,
  discussion,
  onPick,
}: {
  readonly editable: boolean
  readonly pending: boolean
  /** False while the root holds pages or tasks, which a Discussion page cannot show. */
  readonly discussion: boolean
  readonly onPick: (kind: Pick) => void
}): React.JSX.Element {
  if (!editable) {
    return <p className="mt-6 text-center text-sm text-muted-foreground">Nobody has picked what this project is for yet.</p>
  }
  const pages = ONE_PAGE.filter((option) => discussion || option.kind !== 'discussion')
  return (
    <section aria-label="Start this project" className="mx-auto mt-6 flex w-full max-w-2xl flex-col gap-3">
      <p className="mb-4 text-center text-sm text-muted-foreground">How do you want to start?</p>
      <button type="button" disabled={pending} onClick={() => onPick('usual')} className={cn(CARD, 'gap-3', KIND.usual.card)}>
        <span className={cn('font-title text-[length:var(--text-heading-size)] leading-[var(--text-heading-line)]', KIND.usual.ink)}>
          The usual project
        </span>
        <span className="flex flex-wrap justify-center gap-2">
          {USUAL_TABS.map((tab) => (
            <span key={tab.name} className={cn('rounded-full border px-2.5 py-0.5 text-xs font-section', KIND[tab.kind].chip)}>
              {tab.name}
            </span>
          ))}
        </span>
        <span className="text-sm text-muted-foreground">Four tabs, ready to fill in.</span>
      </button>
      <h2 className="mt-2 text-center text-xs text-muted-foreground">Or start with one page</h2>
      <div className={cn('grid grid-cols-1 gap-3', pages.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
        {pages.map((option) => (
          <button
            key={option.kind}
            type="button"
            disabled={pending}
            onClick={() => onPick(option.kind)}
            className={cn(CARD, KIND[option.kind].card)}
          >
            <span className={cn('grid size-11 place-items-center rounded-md bg-background', KIND[option.kind].ink)}>
              <option.icon className="size-5" aria-hidden />
            </span>
            <span className={cn('font-title text-sm', KIND[option.kind].ink)}>{option.name}</span>
            <span className="text-xs text-muted-foreground">{option.line}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
