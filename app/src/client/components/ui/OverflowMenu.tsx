/*
The overflow menu, which section 9 puts on a task row (9.4), on the task form
(9.3) and on a folder header (9.6).

**Its name is "More actions" and it is exact.** 9.1's control table assigns it,
and the table's paragraph gives the reason: 9.3 spends "More options" on the
form's expander, so a page carrying both would otherwise have two different
controls answering to one name. Nothing here takes the name as a prop.

**A menu is a menu.** The trigger declares `aria-haspopup` and its expanded
state, the popup carries `role="menu"`, and each entry carries
`role="menuitem"`. That is what makes the menu addressable as one, and it is
what a screen reader needs to say "menu, three items" instead of reading three
loose buttons. Entries are `<button>` elements underneath, so they activate on
space and enter without this file re-implementing either.

**Keyboard and focus.** Arrow keys move between entries, Home and End jump,
Escape closes, and focus returns to the trigger whenever the menu closes, so
the person is put back where they were rather than at the top of the document.
A pointer press anywhere else closes it too, which is the behaviour a menu
that opens on click owes; the listener is attached only while the menu is
open.

**The menu owns no action.** Every entry is a label and a callback, so what
"Delete" means, and whether it confirms first, belongs to the caller. 9.4's
row and 9.6's header put different things behind the same three words.
*/
import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'

import { MORE_ACTIONS } from './copy.js'

export interface MenuEntry {
  readonly label: string
  readonly onSelect: () => void
  /**
   * The design draws a destructive entry in the danger ink with a danger tint
   * on hover, rather than as a filled row. Optional and defaulting to false,
   * so no existing caller changes; the colour is never the only signal, the
   * word on the entry being the other half.
   */
  readonly destructive?: boolean
}

export function OverflowMenu({
  entries,
}: {
  readonly entries: readonly MenuEntry[]
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const popup = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(event: MouseEvent): void {
      const target = event.target
      if (!(target instanceof Node)) return
      if (popup.current?.contains(target) === true) return
      if (trigger.current?.contains(target) === true) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    popup.current?.querySelector('button')?.focus()
  }, [open])

  /*
  A menu with nothing in it is not a menu, and a trigger that opens onto
  nothing is the "control that leads nowhere" this role exists to prevent.
  The row asks for entries it can actually perform, so the count is data.
  */
  if (entries.length === 0) return null

  function close(restoreFocus: boolean): void {
    setOpen(false)
    if (restoreFocus) trigger.current?.focus()
  }

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
      return
    }
    const items = Array.from(popup.current?.querySelectorAll('button') ?? [])
    if (items.length === 0) return
    const index = items.findIndex((item) => item === document.activeElement)
    const move = (to: number): void => {
      event.preventDefault()
      items[(to + items.length) % items.length]?.focus()
    }
    if (event.key === 'ArrowDown') move(index + 1)
    else if (event.key === 'ArrowUp') move(index - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(items.length - 1)
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        ref={trigger}
        className="icon-control"
        aria-label={MORE_ACTIONS}
        title={MORE_ACTIONS}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((was) => !was)
        }}
      >
        <MoreHorizontal aria-hidden="true" />
      </button>
      {open ? (
        <div
          ref={popup}
          role="menu"
          aria-label={MORE_ACTIONS}
          className="menu-panel top-full right-0"
          onKeyDown={onMenuKeyDown}
        >
          {entries.map((entry) => (
            <button
              key={entry.label}
              type="button"
              role="menuitem"
              className={
                entry.destructive === true
                  ? 'menu-item menu-item-danger'
                  : 'menu-item'
              }
              onClick={() => {
                // Closed before the action runs, and without pulling focus
                // back to the trigger: an entry that opens a confirmation
                // hands focus to the dialog, and a menu that grabbed it back
                // first would move focus twice for one press.
                setOpen(false)
                entry.onSelect()
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  )
}
