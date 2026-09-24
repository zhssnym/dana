/*
Renaming a collection (a folder group: the label on 7.4's my-membership).

Renaming rewrites the label on every page carrying it. Deleting one is
`ConfirmDialog` in `shell/folder-groups.tsx`, with 9.1's normative copy.
Nothing here reads: the page list arrives as a prop and `onSubmit` writes.
*/
import { useEffect, useRef, useState, type FormEvent } from 'react'

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

export interface FolderGroupOption {
  name: string
  color: string
  label: string | null
}

export function FolderGroupDialog({
  open,
  currentLabel,
  folders,
  existingLabels,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  currentLabel?: string
  folders: FolderGroupOption[]
  existingLabels: string[]
  onOpenChange: (open: boolean) => void
  onSubmit: (label: string, folderNames: string[]) => void
}) {
  const [name, setName] = useState('')
  const [selectedFolders, setSelectedFolders] = useState<string[]>([])
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setName(currentLabel ?? '')
    setSelectedFolders(folders.map((folder) => folder.name))
    setError('')
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [currentLabel, folders, open])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextName = name.trim()

    if (!nextName) {
      setError('Give the collection a name')
      return
    }
    if (nextName.length > 40) {
      setError('Too long: limit 40 characters')
      return
    }

    const duplicate = existingLabels.some(
      (label) =>
        label.toLocaleLowerCase() === nextName.toLocaleLowerCase() &&
        label.toLocaleLowerCase() !== (currentLabel ?? '').toLocaleLowerCase(),
    )
    if (duplicate) {
      setError('That collection already exists. Move pages into it instead.')
      return
    }

    /* An empty shelf is allowed: 4.18 gives it a row of
       its own, so the folders can arrive later by drag or from its page. */

    onSubmit(nextName, selectedFolders)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(460px,calc(100vw-32px))]">
        <form onSubmit={submit}>
          <DialogHeader>
            {/* One word, collection, from the foot button
                through this dialog to the row's menu. */}
            <DialogTitle>
              Rename collection
            </DialogTitle>
            <DialogDescription>
              Collections are yours alone: renaming one changes nothing for other members.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="folder-group-name"
                className="mb-1.5 block text-xs font-medium text-section-foreground"
              >
                Collection name
              </label>
              <Input
                ref={inputRef}
                id="folder-group-name"
                value={name}
                maxLength={41}
                placeholder="e.g. Family"
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? 'folder-group-error' : undefined}
                onChange={(event) => {
                  setName(event.target.value)
                  if (error) setError('')
                }}
              />
            </div>

            {error ? (
              <p id="folder-group-error" className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="outline"
                  className="h-[var(--control-height)] px-3"
                />
              }
            >
              Cancel
            </DialogClose>
            <Button
              type="submit"
              className="h-[var(--control-height)] px-3"
            >
              Rename collection
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
