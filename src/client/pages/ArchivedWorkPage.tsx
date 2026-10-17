import { useState } from 'react'

import type { ArchivedWork } from '../../shared/archive.js'
import { useArchivedWork, useDestroyArchivedFolder, useRestoreArchivedFolder } from '../api/archive.js'
import { Screen } from '../components/settings/screen.js'
import { InlineError, SkeletonList } from '../components/state-patterns.js'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { Row, RowGroup } from '../components/ui/row.js'
import { Archive, Box } from '../lib/icons.js'
import { showToast } from '../state/toasts.js'

export function ArchivedWorkPage(): React.JSX.Element {
  const archive = useArchivedWork()
  const restore = useRestoreArchivedFolder()
  const destroy = useDestroyArchivedFolder()
  const [search, setSearch] = useState('')
  const [confirming, setConfirming] = useState<ArchivedWork | null>(null)
  const rows = (archive.data?.rows ?? []).filter((row) =>
    row.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))

  return (
    <Screen title="Archived work" icon={Archive} description="Restore work to its previous place or delete it permanently.">
      <div className="mb-4 max-w-sm">
        <Input
          type="search"
          aria-label="Search archived work"
          placeholder="Search archived work"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {archive.isPending ? <SkeletonList /> : null}
      {archive.isError ? <InlineError onRetry={() => { void archive.refetch() }} /> : null}
      {rows.length > 0 ? (
        <RowGroup role="list">
          {rows.map((item) => (
            <Row
              key={item.id}
              role="listitem"
              icon={<Box className="size-4" strokeWidth={1.75} aria-hidden="true" />}
              label={item.name}
              description={
                `Archived ${new Date(item.archived_at).toLocaleDateString()}` +
                (item.shared && item.archived_by_name ? ` by ${item.archived_by_name}` : '')
              }
              control={
                <span className="flex items-center gap-1">
                  {item.can_restore ? (
                    <Button size="sm" variant="ghost" disabled={restore.isPending}
                      onClick={() => restore.mutate(item.id, {
                        onSuccess: () => showToast(`Restored “${item.name}”`),
                      })}>
                      Restore
                    </Button>
                  ) : null}
                  {item.can_destroy ? (
                    <Button size="sm" variant="destructive" disabled={destroy.isPending}
                      onClick={() => setConfirming(item)}>
                      Delete permanently
                    </Button>
                  ) : null}
                </span>
              }
            />
          ))}
        </RowGroup>
      ) : archive.isSuccess ? (
        <p className="text-sm text-muted-foreground">
          {search.trim() ? 'No archived work matches your search.' : 'No archived work.'}
        </p>
      ) : null}
      {confirming ? (
        <ConfirmDialog
          message={`Delete “${confirming.name}” permanently?`}
          description="This work and its pages cannot be restored."
          confirmLabel="Delete permanently"
          cancelLabel="Cancel"
          onCancel={() => setConfirming(null)}
          onContinue={() => {
            const item = confirming
            setConfirming(null)
            destroy.mutate(item.id, { onSuccess: () => showToast(`Deleted “${item.name}” permanently`) })
          }}
        />
      ) : null}
    </Screen>
  )
}
