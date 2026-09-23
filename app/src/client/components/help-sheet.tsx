/*
Help: the shortcuts that exist, and nothing else (AC-242).

Help's place is 9.1's account menu, with the other things that are about the
application rather than about your work. What that leaves is the harder half,
because Help is the easiest control in any product to fill with a plausible
lie: a Getting started that starts nothing, a Contact support with no support
behind it, a Documentation link to a page nobody has written. So this lists
shortcuts that are wired today, and every line can be pressed.

**Read off the handlers, which is what AC-242 measures.** Each line below
names the module that binds it:

- Ctrl+K and "/" open the search overlay, `shell/overlays.ts`, and 9.1 names
  both in its own words.
- Ctrl+Z takes back the last act inside the undo window, `shell/app-shell.tsx`
  under 9.1's undo bar.
- Enter opens the focused task row (`components/task-row.tsx`) and commits a
  quick-add (`components/quick-add.tsx`), which is the one line covering two
  surfaces.
- Escape closes the open thing: a quick-add, a dialog through the primitive,
  and a held drag row through `lib/use-sortable-list.ts`.
- The arrows move the cursor through the search overlay's results,
  `components/search/SearchOverlay.tsx`.

A shortcut this client does not bind must not be listed here.

**The description says what this sheet is, and nothing else.** A Help sheet is
the last surface in the product that may carry a false sentence. The gap a real
Help leaves, a search and an index and articles, is content work and is not
papered over with a link to a page nobody has written.
*/
import { useState } from 'react'

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
shortcut list that names the wrong key is worse than none, because it teaches
something false.
*/
function modKey(): string {
  if (typeof navigator === 'undefined') return 'Ctrl'
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl'
}

const SHORTCUTS: readonly { readonly keys: readonly string[]; readonly what: string }[] = [
  { keys: ['MOD', 'K'], what: 'Search everything' },
  { keys: ['/'], what: 'Search, when you are not typing' },
  { keys: ['MOD', 'Z'], what: 'Undo the last thing you did' },
  { keys: ['Enter'], what: 'Open the selected task, or commit what you typed' },
  { keys: ['Esc'], what: 'Close what is open' },
  { keys: ['↑', '↓'], what: 'Move through a list' },
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
      <DialogContent className="w-[min(460px,calc(100vw-32px))]">
        <DialogHeader>
          <DialogTitle>Help</DialogTitle>
          <DialogDescription>
            The words Dana uses, and its keyboard shortcuts.
          </DialogDescription>
        </DialogHeader>
        {/* The one question the sheet could not
            answer was what a workflow file is. */}
        <div className="flex flex-col gap-2 pt-1 text-[13px] leading-5 text-foreground">
          <p className="text-[12px] leading-4 font-medium text-muted-foreground">Words Dana uses</p>
          <p>
            <span className="font-medium">Workflow file.</span> A folder saved as a small file
            ("Save as workflow" in a folder's menu): its name, its sections and paragraphs, and
            its open tasks with their dates, stars, steps and repeats. Import it from the sidebar
            to get a fresh copy of that folder, here or on another account. Conversations,
            reminders and who did what stay behind.
          </p>
          <p>
            <span className="font-medium">Desk</span> is where a task lands when you have not said
            which folder. <span className="font-medium">Anytime</span> lists every task without a
            date. A <span className="font-medium">shelf</span> is a row of folders you arrange
            yourself; it is yours alone and changes nothing for other members.
          </p>
        </div>
        <div className="flex flex-col gap-1 pt-1">
          <p className="pb-1 text-[12px] leading-4 font-medium text-muted-foreground">Keyboard</p>
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.what} className="flex items-center justify-between gap-4 py-1">
              <span className="min-w-0 text-[13px] leading-5 text-foreground">
                {shortcut.what}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {shortcut.keys.map((key) => (
                  <kbd
                    key={key}
                    className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] leading-4 font-medium text-muted-foreground"
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

/* The account menu opens it and nothing else needs to yet, so the state lives
   with the trigger rather than being threaded from the shell. When a second
   opener arrives, a "?" shortcut being the obvious one, it lifts. */
export function useHelpSheet(): {
  open: boolean
  setOpen: (open: boolean) => void
  sheet: React.JSX.Element
} {
  const [open, setOpen] = useState(false)
  return { open, setOpen, sheet: <HelpSheet open={open} onOpenChange={setOpen} /> }
}
