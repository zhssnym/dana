/*
9.6's "Label and color", ported at P8R session R10 from the designer's
`src/screens/folder-screen.tsx`, where the same dialog is one of two the folder
editor opens.

"'Label and color' opens a dialog taking the folder's personal label and its
colour together, both being the two fields of 7.4's my-membership and neither
meaning anything without the other." That sentence is the whole design of this
file: the two fields are one form and one PATCH, because 7.4 takes them in one
body and a dialog offering one of them writes a null over the other, which is a
loss nothing on the page reports. AC-181 (no test since the 2026-09-20 cut) names both
fields and reads both values back through 7.4.

**The two fields carry the names 9.1's table gives them, "Label" and "Color".**
That row arrived at the P8R mid-package change control on 2026-08-13 with the
paragraph beside it: the three dialogs name their fields and not themselves,
because a dialog is announced by its own title and what a test and a screen
reader need is the field inside it.

**The colour is one control and not his seven swatches, and the reason is 4.4
rather than taste.** His picker is a row of seven buttons whose values are the
design's folder tokens, `var(--color-folder-cobalt)` and its neighbours. Two
things stop that porting as it stands. A membership colour is stored under
4.4's `#RRGGBB` check and sent through 7.4, so a CSS variable is a 422 rather
than a colour; and resolving those tokens to hexes here would either copy raw
values into a file that is not `tokens.css`, which 11.4 forbids, or read the
computed stylesheet at runtime to paint a control. A native colour control
holds exactly what 4.4 stores and offers the whole free-form range that check
permits, which is also what 11.4's own ruling calls this value: "data on the
wire rather than a design value". The swatches are the visible difference from
his screen and are flagged for the visual review of section 13 item 33.

**It is uncontrolled and keyed**, which is the smallest way to open on the
folder's own colour without inventing a default for a folder that has none. A
controlled colour input needs a string at every render and there is no honest
one for the empty case: `DEFAULT_FOLDER_COLOR` is the token a dot is painted
with, not a value a person picked, and writing it back on save would record a
choice they did not make. So the input opens at the stored colour when there is
one and at the browser's own default when there is not, and the key remounts it
whenever the dialog opens or the folder changes.

Nothing here reads or writes. `onSubmit` is the page's, which is what keeps the
7.4 call in one place.
*/
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Palette } from '../lib/icons.js'

import { Button } from './ui/button.js'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js'
import { Input } from './ui/input.js'

/** 9.1's names table: the two fields of this dialog, exactly. */
const LABEL_FIELD = 'Label'
const COLOR_FIELD = 'Color'

export function FolderLabelDialog({
  open,
  folderId,
  label,
  color,
  onOpenChange,
  onSubmit,
}: {
  readonly open: boolean
  /** Only to key the uncontrolled colour control; nothing here fetches. */
  readonly folderId: string
  /** The stored personal label, empty where the folder carries none. */
  readonly label: string
  /** The stored colour as `#RRGGBB`, or undefined where none was chosen. */
  readonly color: string | undefined
  readonly onOpenChange: (open: boolean) => void
  /** Both fields together: null clears, which is what 4.4 stores for neither. */
  readonly onSubmit: (next: { label: string | null; color: string | null }) => void
}): React.JSX.Element {
  const [draftLabel, setDraftLabel] = useState(label)
  const [error, setError] = useState('')
  const colorRef = useRef<HTMLInputElement>(null)
  const labelRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setDraftLabel(label)
    setError('')
    window.requestAnimationFrame(() => labelRef.current?.focus())
  }, [label, open])

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const nextLabel = draftLabel.trim()
    if (nextLabel.length > 40) {
      setError('Too long: limit 40 characters')
      return
    }
    onSubmit({
      // 7.4 makes both nullable and null is what clears one, so an emptied
      // field clears the label rather than sending a string 10.3 refuses for
      // being shorter than one character.
      label: nextLabel === '' ? null : nextLabel,
      color: colorRef.current?.value ?? null,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-[var(--color-graphite-100)] text-[var(--color-graphite-700)]">
              <Palette className="size-5" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <DialogTitle>Label and color</DialogTitle>
            <DialogDescription>
              This grouping label and color are personal to you.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-5">
            <div>
              <label
                htmlFor="folder-label-field"
                className="mb-1.5 block text-xs font-medium text-[var(--color-graphite-700)]"
              >
                {LABEL_FIELD}
              </label>
              <Input
                ref={labelRef}
                id="folder-label-field"
                value={draftLabel}
                maxLength={41}
                placeholder="For example, Personal or Work"
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? 'folder-label-error' : 'folder-label-help'}
                onChange={(event) => {
                  setDraftLabel(event.target.value)
                  if (error) setError('')
                }}
              />
              <p id="folder-label-help" className="mt-1.5 text-xs text-muted-foreground">
                Leave empty to keep the folder outside a label group.
              </p>
            </div>

            <div>
              <label
                htmlFor="folder-color-field"
                className="mb-1.5 block text-xs font-medium text-[var(--color-graphite-700)]"
              >
                {COLOR_FIELD}
              </label>
              <input
                key={`${folderId}:${String(open)}`}
                ref={colorRef}
                id="folder-color-field"
                type="color"
                defaultValue={color}
                className="h-[var(--control-height)] w-16 cursor-pointer rounded-md border border-border bg-white p-1"
              />
            </div>

            {error ? (
              <p id="folder-label-error" className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" className="h-[var(--control-height)] px-3" />
              }
            >
              Cancel
            </DialogClose>
            <Button
              type="submit"
              className="h-[var(--control-height)] bg-[var(--color-graphite-900)] px-3 text-white hover:bg-[var(--color-graphite-800)]"
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
