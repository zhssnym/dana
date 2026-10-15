// The keyboard shortcuts sheet. List only shortcuts this client actually binds (AC-242).
import { useEffect, useState } from 'react'

import { onOpenShortcuts } from '../shell/overlays.js'
import { SHORTCUT_GROUPS } from '../help/shortcuts.js'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js'

// The command glyph on a Mac, Ctrl everywhere else.
function modKey(): string {
  if (typeof navigator === 'undefined') return 'Ctrl'
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl'
}

export const KEYBOARD_SHORTCUTS = 'Keyboard shortcuts'

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
      {/* Nothing in the sheet takes focus, so the panel holds it without a ring. */}
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
          {SHORTCUT_GROUPS.map((group) => (
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

export function ShortcutsSheet(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  useEffect(() => onOpenShortcuts(() => setOpen(true)), [])
  return <HelpSheet open={open} onOpenChange={setOpen} />
}
