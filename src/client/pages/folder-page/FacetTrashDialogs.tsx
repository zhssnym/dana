// Deleting a Facet is a reversible change of visibility. Nothing in its
// document, Tasks, attachments, receipts or containing child Pages is removed.
import type { GetPageFacetsResponse } from '../../../shared/page-facets.js'
import { Button } from '../../components/ui/button.js'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '../../components/ui/dialog.js'

type Facet = GetPageFacetsResponse['facets'][number]

export function FacetDeleteDialog({
  facet, pending, onClose, onConfirm,
}: {
  readonly facet: Facet | null
  readonly pending: boolean
  readonly onClose: () => void
  readonly onConfirm: () => void
}): React.JSX.Element {
  return (
    <Dialog open={facet !== null} onOpenChange={(open) => { if (!open && !pending) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move Facet to Trash?</DialogTitle>
          <DialogDescription>
            {facet?.name ?? 'This Facet'} will disappear from this Page. Its writing, Tasks,
            attachments and nested Pages stay saved, and restoring the Facet brings them back.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Cancel</DialogClose>
          <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
            Move to Trash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function FacetTrashDialog({
  open, onOpenChange, facets, loading, pendingId, error, onRestore,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly facets: readonly Facet[]
  readonly loading: boolean
  readonly pendingId: string | null
  readonly error: string
  readonly onRestore: (facet: Facet) => void
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deleted Facets</DialogTitle>
          <DialogDescription>
            Restore a Facet to return its content to this Page.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-2">
          {loading ? <p role="status" className="text-sm text-muted-foreground">Loading deleted Facets…</p>
            : facets.length === 0 ? <p className="text-sm text-muted-foreground">No deleted Facets.</p>
              : facets.map((facet) => (
                <div key={facet.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2">
                  <span className="min-w-0 truncate text-sm">{facet.name}</span>
                  <Button type="button" variant="outline" size="sm"
                    disabled={pendingId !== null} onClick={() => onRestore(facet)}>
                    {pendingId === facet.id ? 'Restoring…' : 'Restore'}
                  </Button>
                </div>
              ))}
          {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
