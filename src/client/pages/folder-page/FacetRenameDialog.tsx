// Main's Facet strip is hidden when it is the only Facet. Its header menu
// still needs a way to rename the Facet without renaming the Page itself.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '../../components/ui/button.js'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '../../components/ui/dialog.js'
import { Input } from '../../components/ui/input.js'

export function FacetRenameDialog({
  open, name, onOpenChange, onRename,
}: {
  readonly open: boolean
  readonly name: string
  readonly onOpenChange: (open: boolean) => void
  readonly onRename: (name: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(name)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setDraft(name)
    setError('')
  }, [open, name])

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const next = draft.replace(/\s+/g, ' ').trim()
    if (!next) {
      setError('Give this Facet a name.')
      return
    }
    if (next !== name) onRename(next)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Rename Facet</DialogTitle>
            <DialogDescription>
              This changes the Facet’s name, not the Page or its content.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-2">
            <label htmlFor="rename-single-facet-name" className="block text-xs font-medium text-muted-foreground">
              Facet name
            </label>
            <Input id="rename-single-facet-name" autoFocus value={draft} maxLength={120}
              aria-invalid={Boolean(error) || undefined}
              onChange={(event) => { setDraft(event.target.value); setError('') }}
            />
            {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit">Rename</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
