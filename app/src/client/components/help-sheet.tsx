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
  it (`components/row-keys.ts`, the rows in `task-row.tsx`, `task-board.tsx`
  and `views/LinearView.tsx`). Enter also commits a "New task" row
  (`components/quick-add.tsx`).
- Escape closes the open thing: a "New task" row, a dialog through the
  primitive, and a held drag row through `lib/use-sortable-list.ts`.
- The arrows move the cursor through search's results,
  `components/search-overlay.tsx`.

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

const SHORTCUTS: readonly { readonly keys: readonly string[]; readonly what: string }[] = [
  { keys: ['MOD', 'K'], what: 'Search' },
  { keys: ['/'], what: 'Search, when you are not typing' },
  { keys: ['N'], what: 'New task in this list' },
  { keys: ['MOD', 'Z'], what: 'Undo the last thing you did' },
  { keys: ['↑', '↓'], what: 'Move through tasks or search results' },
  { keys: ['Enter'], what: 'Open the selected task, or add what you typed' },
  { keys: ['Space'], what: 'Complete the selected task' },
  { keys: ['Esc'], what: 'Close what is open' },
  { keys: ['?'], what: 'This list' },
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
      <DialogContent className="w-[min(420px,calc(100vw-32px))]">
        <DialogHeader>
          <DialogTitle>{KEYBOARD_SHORTCUTS}</DialogTitle>
          <DialogDescription className="sr-only">
            The keys Dana answers to.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.what} className="flex items-center justify-between gap-4 py-1">
              <span className="min-w-0 text-sm text-foreground">{shortcut.what}</span>
              <span className="flex shrink-0 items-center gap-1">
                {shortcut.keys.map((key) => (
                  <kbd
                    key={key}
                    className="min-w-5 rounded-sm bg-muted px-1.5 py-0.5 text-center text-xs font-medium text-muted-foreground"
                  >
                    {key === 'MOD' ? mod : key}
                  </kbd>
                ))}
              </span>
            </div>
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
