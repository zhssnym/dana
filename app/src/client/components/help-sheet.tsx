/*
Keyboard shortcuts: the ones that exist, and nothing else (AC-242).

`?` opens it when you are not typing, and so does "Keyboard shortcuts" in
search (`shell/overlays.ts` carries both). It lists shortcuts that are wired
today, and every line can be pressed. Each line names the module that binds it:

- Ctrl+K and "/" open search, and "?" opens this sheet, `shell/overlays.ts`.
- N (or C) puts the cursor in the page's "New task" row, `components/quick-add.tsx`.
- Ctrl+Z takes back the last act inside the undo window, `shell/app-shell.tsx`
  under 9.1's undo bar.
- In a task list (Today, Upcoming, Assigned, a page's Linear and Board) the
  arrows move between tasks, Enter opens the focused task and Space completes
  it (`components/row-keys.ts`, the rows in `task-row.tsx` and
  `task-board.tsx`). Enter also commits a "New task" row
  (`components/quick-add.tsx`).
- In a page's Linear list, `views/LinearView.tsx` binds its keys: C or N
  for New task, Enter or O to open, Space to mark done or reopen, X to select,
  Shift+arrows to extend, Alt+arrows to move the task, M, A and L for the
  Section, Assignee and Label menus, Esc to clear the selection.
- Escape closes the open thing: a "New task" row, a dialog through the
  primitive, and a held drag row through `lib/use-sortable-list.ts`.
- The arrows move the cursor through search's results,
  `components/search-overlay.tsx`.
- The arrows move through the sidebar's pages and fold them, and F2 renames
  the focused one, `shell/app-sidebar.tsx`.
- Ctrl+B shows or hides the sidebar when you are not typing,
  `components/ui/sidebar.tsx`.
- Ctrl+Shift+J and K step to the next and previous task while one is open,
  `components/task-surface.tsx`.

The lines are grouped by where they work, so one key (the arrows) can mean
one thing in a list and another in the sidebar without a line saying both.

A shortcut this client does not bind must not be listed here.
*/
import { useEffect, useState } from 'react'

import { onOpenShortcuts } from '../shell/overlays.js'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js'

/*
The mac and windows split is read from the platform rather than written twice,
so the sheet says the command glyph on a Mac and Ctrl everywhere else. A
shortcut list that names the wrong key is worse than none.
*/
function modKey(): string {
  if (typeof navigator === 'undefined') return 'Ctrl'
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl'
}

export const KEYBOARD_SHORTCUTS = 'Keyboard shortcuts'

/* `also`: a second chord for the same act, drawn on the same line. */
type Shortcut = { readonly keys: readonly string[]; readonly also?: readonly string[]; readonly what: string }

const GROUPS: readonly { readonly title: string; readonly rows: readonly Shortcut[] }[] = [
  {
    title: 'Anywhere',
    rows: [
      /* "/" types a slash in a text field, which says so by itself. */
      { keys: ['MOD', 'K'], also: ['/'], what: 'Search' },
      { keys: ['Esc'], what: 'Close what is open' },
    ],
  },
  {
    /* In a text field these keys are the field's: Ctrl+Z undoes typing and
       Ctrl+B is bold. */
    title: 'Outside a text field',
    rows: [
      { keys: ['MOD', 'Z'], what: 'Undo the last thing you did' },
      { keys: ['MOD', 'B'], what: 'Show or hide the sidebar' },
      { keys: ['?'], what: 'This list' },
    ],
  },
  {
    title: 'In a list of tasks',
    rows: [
      { keys: ['N'], what: 'New task' },
      { keys: ['↑', '↓'], what: 'Move between tasks' },
      { keys: ['Enter'], what: 'Open the task' },
      { keys: ['Space'], what: 'Complete the task' },
    ],
  },
  {
    title: 'In a Linear list',
    rows: [
      { keys: ['C'], also: ['N'], what: 'New task' },
      { keys: ['Enter'], also: ['O'], what: 'Open the task' },
      { keys: ['Space'], what: 'Mark done or reopen' },
      { keys: ['J'], also: ['K'], what: 'Next or previous task' },
      { keys: ['X'], what: 'Select the task' },
      { keys: ['Shift', '↑'], also: ['Shift', '↓'], what: 'Select the next one too' },
      { keys: ['Alt', '↑'], also: ['Alt', '↓'], what: 'Move the task' },
      { keys: ['M'], what: 'Section' },
      { keys: ['A'], what: 'Assignee' },
      { keys: ['L'], what: 'Label' },
    ],
  },
  {
    title: 'In an open task',
    rows: [
      { keys: ['MOD', 'Shift', 'J'], what: 'Next task' },
      { keys: ['MOD', 'Shift', 'K'], what: 'Previous task' },
    ],
  },
  {
    title: 'In the sidebar',
    rows: [
      { keys: ['↑', '↓'], what: 'Move between pages' },
      { keys: ['←', '→'], what: 'Fold or unfold a page' },
      { keys: ['F2'], what: 'Rename the page' },
    ],
  },
]

export function HelpSheet({
  open,
  onOpenChange,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const mod = modKey()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Nothing in the sheet takes focus, so the panel holds it; it draws
          no ring for that. */}
      <DialogContent
        data-focus="self"
        className="flex max-h-[calc(100dvh-32px)] w-[min(420px,calc(100vw-32px))] flex-col"
      >
        <DialogHeader>
          <DialogTitle>{KEYBOARD_SHORTCUTS}</DialogTitle>
          <DialogDescription className="sr-only">
            The keys Dana answers to.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-5 mt-2 flex flex-col gap-[var(--space-group)] overflow-y-auto px-5">
          {GROUPS.map((group) => (
            <section key={group.title} aria-label={group.title}>
              <h3 className="flex h-[var(--control-height)] items-center text-xs font-medium text-muted-foreground">
                {group.title}
              </h3>
              {group.rows.map((shortcut) => (
                <div
                  key={shortcut.what}
                  className="flex min-h-[var(--row-height)] items-center justify-between gap-4"
                >
                  <span className="min-w-0 text-sm text-foreground">{shortcut.what}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {[shortcut.keys, ...(shortcut.also ? [shortcut.also] : [])].map((chord, index) => (
                      <span key={chord.join('+')} className={index > 0 ? 'ml-2 flex items-center gap-1' : 'flex items-center gap-1'}>
                        {chord.map((key) => (
                          <kbd
                            key={key}
                            className="min-w-5 rounded-sm bg-muted px-1.5 py-0.5 text-center font-sans text-xs font-medium text-muted-foreground"
                          >
                            {key === 'MOD' ? mod : key}
                          </kbd>
                        ))}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** The sheet, mounted once by the shell and opened through `openShortcuts()`. */
export function ShortcutsSheet(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  useEffect(() => onOpenShortcuts(() => setOpen(true)), [])
  return <HelpSheet open={open} onOpenChange={setOpen} />
}
