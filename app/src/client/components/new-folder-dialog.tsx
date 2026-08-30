/*
The designer's `src/components/new-folder-dialog.tsx`, ported at P8R session
R3: what 9.1's "New folder" action opens.

AC-181 asserts the shape rather than any string, because no numbered section
names a control here: the action opens a dialog, the dialog holds exactly one
text box, and committing it creates the folder. So the dialog's single input
is the whole of "taking a name", and a second text box added later would
falsify that criterion rather than improve the dialog.

**"Continue" and "Cancel" are deliberately not used here.** 9.1 assigns that
pair to every *confirmation* of 9.3 to 9.9, and its paragraph gives the
reason: the destructive verb is already in the message the person is reading.
This is a form and not a confirmation, so the commit says what it does,
"Create folder", which is also what AC-181 admits.

Nothing here reads. `onCreate` is the page's, and 9.1's own sentence, that
the dialog creates the folder, is satisfied by the caller sending POST
/folders; a dialog that collects a name and never sends it looks identical to
one that works until the list is reloaded, which is why that criterion checks
the server rather than the page.
*/
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { FolderPlus } from '../lib/icons.js'

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

export function NewFolderDialog({
  open,
  groupLabel,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  groupLabel?: string
  onOpenChange: (open: boolean) => void
  onCreate: (name: string) => void
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setError('')
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextName = name.trim()
    if (!nextName) {
      setError('Give the folder a name')
      return
    }
    if (nextName.length > 100) {
      setError('Too long: limit 100 characters')
      return
    }

    onCreate(nextName)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-[var(--color-graphite-100)] text-[var(--color-graphite-700)]">
              <FolderPlus className="size-5" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>
              {groupLabel
                ? `Create a private folder in “${groupLabel}”. You can color or share it afterward.`
                : 'Create a private folder. You can label, color or share it afterward.'}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            <label htmlFor="new-folder-name" className="mb-1.5 block text-xs font-medium text-[var(--color-graphite-700)]">
              Folder name
            </label>
            <Input
              ref={inputRef}
              id="new-folder-name"
              value={name}
              maxLength={101}
              placeholder="e.g. Finance"
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? 'new-folder-error' : undefined}
              onChange={(event) => {
                setName(event.target.value)
                if (error) setError('')
              }}
            />
            {error ? (
              <p id="new-folder-error" className="mt-1.5 text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <DialogClose
              render={<Button type="button" variant="outline" className="h-[var(--control-height)] px-3" />}
            >
              Cancel
            </DialogClose>
            <Button type="submit" className="h-[var(--control-height)] bg-[var(--color-graphite-900)] px-3 text-white hover:bg-[var(--color-graphite-800)]">
              Create folder
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
