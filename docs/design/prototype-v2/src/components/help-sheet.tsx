/*
Help: the shortcuts that exist, and nothing else.

Imran's brief of 2026-08-23 gave Help no content, only a place. The place is
settled — the account menu, with the other things that are about the
application rather than about your work — and the content is the harder half,
because "Help" is the easiest control in any product to fill with a plausible
lie: a Getting started that starts nothing, a Contact support with no support
behind it, a Documentation link to a page nobody has written.

So this lists **shortcuts that are wired today**, read off the handlers rather
than remembered, and says one true sentence about what this build is. Every
line here can be pressed and will do what it says.

The gap it leaves is deliberate and named: a real Help has a search, an index
and articles, and all three are content work rather than design work. When
there is documentation this becomes a link to it. Until then a short honest
list beats a long convincing one, and this is the same judgement DES-144 makes
about a control that cannot do anything — the difference between a promise
kept small and a promise broken.
*/

import { useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/*
The mac/windows split is read from the platform rather than written twice, so
the sheet says ⌘ on a Mac and Ctrl everywhere else — a shortcut list that names
the wrong key is worse than none, because it teaches something false.
*/
function modKey() {
  if (typeof navigator === "undefined") return "Ctrl"
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    ? "⌘"
    : "Ctrl"
}

const SHORTCUTS: { keys: string[]; what: string }[] = [
  { keys: ["MOD", "K"], what: "Search everything" },
  { keys: ["/"], what: "Search, when you are not typing" },
  { keys: ["MOD", "Z"], what: "Undo the last thing you did" },
  { keys: ["Enter"], what: "Open the selected task, or commit what you typed" },
  { keys: ["Esc"], what: "Close what is open" },
  { keys: ["↑", "↓"], what: "Move through a list" },
]

export function HelpSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const mod = modKey()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Help</DialogTitle>
          <DialogDescription>
            This is a design prototype of Dana. What you change here is kept in
            this browser and nowhere else.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1 pt-1">
          <p className="pb-1 text-[12px] leading-4 font-medium text-[var(--color-graphite-500)]">
            Keyboard
          </p>
          {SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.what}
              className="flex items-center justify-between gap-4 py-1"
            >
              <span className="min-w-0 text-[13px] leading-5 text-[var(--color-graphite-700)]">
                {shortcut.what}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {shortcut.keys.map((key) => (
                  <kbd
                    key={key}
                    className="rounded border border-[var(--color-graphite-200)] bg-[var(--color-graphite-50)] px-1.5 py-0.5 text-[11px] leading-4 font-medium text-[var(--color-graphite-600)]"
                  >
                    {key === "MOD" ? mod : key}
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
   opener arrives — a "?" shortcut is the obvious one — it lifts. */
export function useHelpSheet() {
  const [open, setOpen] = useState(false)
  return { open, setOpen, sheet: <HelpSheet open={open} onOpenChange={setOpen} /> }
}
