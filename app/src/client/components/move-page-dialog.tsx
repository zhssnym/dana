/*
"Move to…", from a page's "…": put this page under another page, or back at
the top level.

**What is offered is what the server would accept, as far as the client can
know it.** Only pages the viewer may edit (the location route answers 403
below that on the target), never the page itself or anything under it (a
cycle, 422), never Desk (the personal default page stays a place of its own),
and never the parent it already has. The one refusal the list cannot foresee
is depth past 20, which the server answers 422 and the mutation cache toasts
like every other failed write.

**Each row carries its own path**, muted, because two pages may share a name
and only where they sit tells them apart. The path is built from the same
`GET /folders` list, whose `parent_folder_id` is already null where the viewer
cannot see the parent, so a path never names a page the viewer is not in.
*/
import { useEffect, useMemo, useRef, useState } from 'react'

import { useFolders } from '../api/queries.js'
import { useMoveFolder } from '../api/mutations.js'
import { mayDraw } from '../lib/folder-authority.js'
import { pushUndo } from '../shell/undo.js'
import { IDENTITY_COLOR_FALLBACK } from '../parts/identity-colors.js'
import type { Folder } from '../../shared/folders.js'
import { markIcon } from './page/icon-manifest.js'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog.js'
import { Input } from './ui/input.js'
import { cn } from './ui/utils.js'

interface Candidate {
  readonly id: string | null
  readonly name: string
  readonly path: string
  readonly folder?: Folder
}

/** The page and everything under it, from the flat list's parent links. */
export function subtreeOf(folders: readonly Folder[], rootId: string): Set<string> {
  const children = new Map<string, string[]>()
  for (const folder of folders) {
    const parent = folder.parent_folder_id ?? null
    if (parent === null) continue
    children.set(parent, [...(children.get(parent) ?? []), folder.id])
  }
  const seen = new Set<string>([rootId])
  const queue = [rootId]
  while (queue.length > 0) {
    const next = queue.pop() as string
    for (const child of children.get(next) ?? []) {
      if (seen.has(child)) continue
      seen.add(child)
      queue.push(child)
    }
  }
  return seen
}

/** A page's ancestors' names, root first, as this viewer's list knows them. */
export function pathOf(byId: ReadonlyMap<string, Folder>, folder: Folder): string[] {
  const names: string[] = []
  const seen = new Set<string>([folder.id])
  let parent = folder.parent_folder_id ?? null
  while (parent !== null && !seen.has(parent)) {
    const row = byId.get(parent)
    if (row === undefined) break
    seen.add(parent)
    names.unshift(row.name)
    parent = row.parent_folder_id ?? null
  }
  return names
}

export function MovePageDialog({
  open,
  onOpenChange,
  page,
}: {
  readonly open: boolean
  readonly onOpenChange: (next: boolean) => void
  readonly page: { readonly id: string; readonly name: string }
}): React.JSX.Element {
  const folders = useFolders()
  const move = useMoveFolder()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  const list = folders.data
  const self = list?.find((folder) => folder.id === page.id)
  const currentParent = self?.parent_folder_id ?? null

  const candidates = useMemo((): Candidate[] => {
    const rows = list ?? []
    const byId = new Map(rows.map((folder) => [folder.id, folder]))
    const excluded = subtreeOf(rows, page.id)
    const pages = rows
      .filter(
        (folder) =>
          !excluded.has(folder.id) &&
          !folder.is_default &&
          folder.id !== currentParent &&
          mayDraw(
            { access: folder.my_access, isOwner: folder.is_owner, isDefault: folder.is_default },
            'folder.page.edit',
          ),
      )
      .map((folder): Candidate => ({
        id: folder.id,
        name: folder.name,
        path: pathOf(byId, folder).join(' / '),
        folder,
      }))
    return currentParent === null ? pages : [{ id: null, name: 'Top level', path: '' }, ...pages]
  }, [list, page.id, currentParent])

  const needle = query.trim().toLocaleLowerCase()
  const shown = needle === ''
    ? candidates
    : candidates.filter(
        (candidate) =>
          candidate.name.toLocaleLowerCase().includes(needle) ||
          candidate.path.toLocaleLowerCase().includes(needle),
      )

  function choose(target: Candidate): void {
    const previous = currentParent
    move.mutate(
      { id: page.id, body: { parent_folder_id: target.id } },
      {
        onSuccess: () => {
          pushUndo(
            target.id === null ? `Moved "${page.name}" to the top level` : `Moved "${page.name}" into ${target.name}`,
            () => {
              move.mutate({ id: page.id, body: { parent_folder_id: previous } })
            },
          )
        },
      },
    )
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>Move “{page.name}” to</DialogTitle>
        </DialogHeader>
        <div className="px-4 pt-3">
          <Input
            ref={inputRef}
            value={query}
            placeholder="Find a page"
            aria-label="Find a page"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              const first = shown[0]
              if (event.key === 'Enter' && first !== undefined) {
                event.preventDefault()
                choose(first)
              }
            }}
          />
        </div>
        <ul className="max-h-80 overflow-y-auto p-2" aria-label="Pages">
          {folders.isPending ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">Loading…</li>
          ) : shown.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">No page to move it to.</li>
          ) : (
            shown.map((candidate) => {
              const Glyph = candidate.folder === undefined ? null : markIcon(candidate.folder.icon)
              return (
                <li key={candidate.id ?? '__top'}>
                  <button
                    type="button"
                    onClick={() => choose(candidate)}
                    className={cn(
                      'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none',
                      'hover:bg-accent focus-visible:bg-accent',
                    )}
                  >
                    {Glyph === null ? (
                      <span className="size-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <Glyph
                        className="size-4 shrink-0"
                        style={{ color: candidate.folder?.color ?? IDENTITY_COLOR_FALLBACK }}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{candidate.name}</span>
                    {candidate.path === '' ? null : (
                      <span className="max-w-[50%] shrink truncate text-xs text-muted-foreground">
                        {candidate.path}
                      </span>
                    )}
                  </button>
                </li>
              )
            })
          )}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
