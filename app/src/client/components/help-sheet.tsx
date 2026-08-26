/*
Help: the shortcuts that exist, and nothing else (AC-242).

Ported from `docs/design/prototype-v2/src/components/help-sheet.tsx`, which
11.13 makes the source. Its header states the design and it survives the port
whole: Imran's brief of 2026-08-23 gave Help no content, only a place, and the
place is 9.1's account menu, with the other things that are about the
application rather than about your work. What that leaves is the harder half,
because Help is the easiest control in any product to fill with a plausible
lie: a Getting started that starts nothing, a Contact support with no support
behind it, a Documentation link to a page nobody has written. So this lists
shortcuts that are wired today, and every line can be pressed.

**Read off the handlers at the port, which is what the source file asks for
and what AC-242 measures.** Each line below names the module that binds it:

- Ctrl+K and "/" open the search overlay, `shell/overlays.ts`, and 9.1 names
  both in its own words.
- Ctrl+Z takes back the last act inside the undo window, `shell/app-shell.tsx`
  under 9.1's undo bar.
- Enter opens the focused task row (`components/task-row.tsx`) and commits a
  quick-add (`components/quick-add.tsx`), which is the one line covering two
  surfaces, exactly as the designer wrote it.
- Escape closes the open thing: a quick-add, a dialog through the primitive,
  and a held drag row through `lib/use-sortable-list.ts`.
- The arrows move the cursor through the search overlay's results,
  `components/search/SearchOverlay.tsx`.

Nothing on the prototype's list was dropped, because nothing on it turned out
to be untrue here; a shortcut this client did not bind would have been
reported rather than shipped.

**The one sentence that could not be ported.** The prototype's description
reads "This is a design prototype of Dana. What you change here is kept in
this browser and nowhere else", which is a true sentence there and a false one
here, and a Help sheet is the last surface in the product that may carry a
false sentence. It is replaced by what this sheet is, and by nothing else: the
gap a real Help leaves, a search and an index and articles, is content work
rather than design work and stays named in the source file rather than papered
over with a link to a page nobody has written. That is DES-144's judgement
about a control that cannot do anything, applied to a sentence.
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
            The keyboard shortcuts Dana has today.
          </DialogDescription>
        </DialogHeader>
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
