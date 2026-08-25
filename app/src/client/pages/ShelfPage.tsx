/*
9.10's shelf page, ported at S12 from the designer's `shelf-page.tsx`: the
folder page one level up, a per-user arrangement of folders with a page of
its own.

**Presence is the membership's fact, position the page's arrangement**
(DES-219, 9.10's own sentence). Which folders are on this shelf is
`folder_members.label` equalling the shelf's name (4.18, frozen since 4.4),
read off the folder list already in every page's cache; where a folder row
sits among the writing is a `folder_ref` block. The reconciliation is the
design's: a stored row whose membership is gone is dropped on read, a
member the layout has never seen joins after the last folder row, or leads
the page when there are none. The joins render before they are written; a
later block edit writes the arrangement as it stands, so the page needs no
write of its own to be truthful.

**Keyed by id, never by name** (11.15's v2 hazard): the shelf's identity is
its uuid, a rename keeps the page, and `ref_folder_id` is what a folder row
stores. His prototype keys by name because fixtures have no ids; this port
does not copy that shape.

**A folder row opens as its own tab beside the shelf's** (9.1, Imran's
ruling of 2026-08-24): a shelf is where a workflow is presented, so a
folder opened from it stays open beside it. The row is a link (9.1's roles
table), and the press appends through the tab store rather than
retargeting.

**No views, no filter** (9.10): a view redraws tasks and a shelf holds
folders; its list is its label, and narrowing it would be editing it. The
overflow carries the shelf's contract: History, Rename, Copy link,
Duplicate (the page, no folders), Save as workflow, Delete. Delete unlabels
and keeps every folder (AC-203's server half), and 9 puts no confirm on it.

**Save as workflow exports structure and titles only** (DES-206): the
folders on this shelf by name, which is exactly what the import's schema
would keep of a richer file.
*/
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import {
  useCreateShelf,
  useDeleteShelf,
  usePatchShelf,
  usePutShelfPage,
  useUpdateMyMembership,
} from '../api/mutations.js'
import { useFolders, useShelf, useShelfPage } from '../api/queries.js'
import { BlocksEditor, carryAll } from '../components/page/BlocksEditor.js'
import { IdentityHead } from '../components/page/IdentityHead.js'
import { markIcon } from '../components/page/icon-manifest.js'
import { Button } from '../components/ui/button.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.js'
import { MORE_ACTIONS } from '../components/ui/copy.js'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../components/ui/sheet.js'
import { FolderPlus, MoreHorizontal, Plus } from '../lib/icons.js'
import { formatAgo } from '../parts/format-dates.js'
import { useSubjectEvents } from '../api/queries.js'
import { paths } from '../routes.js'
import { openInNewTab } from '../shell/tabs.js'
import { WindowBarActions } from '../shell/WindowBar.js'
import { PageBody } from '../states/PageStates.js'
import type { Folder } from '../../shared/folders.js'
import type { PageBlock, PageBlockWrite } from '../../shared/pages.js'

/** The workflow file this shelf exports: its folders, by name (DES-206). */
function shelfWorkflowFile(name: string, folders: readonly Folder[]): string {
  return JSON.stringify(
    {
      dana: 'workflow',
      version: 1,
      name,
      folders: folders.map((folder) => ({ name: folder.name })),
    },
    null,
    2,
  )
}

export function ShelfPage(): React.JSX.Element {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const shelf = useShelf(id)
  const page = useShelfPage(id)
  const folders = useFolders()
  const patch = usePatchShelf()
  const putPage = usePutShelfPage()
  const remove = useDeleteShelf()
  const createShelf = useCreateShelf()
  const putNewPage = usePutShelfPage()
  const move = useUpdateMyMembership()
  const [historyOpen, setHistoryOpen] = useState(false)
  // 9.10's inline rename: the name is a heading until this is true.
  const [renaming, setRenaming] = useState(false)
  const events = useSubjectEvents(historyOpen ? `shelf:${id}` : null)

  const detail = shelf.data
  const name = detail?.name ?? ''

  /* The membership: folders whose personal label is this shelf's name.
     Desk never shelves (9.10), and is_default is what Desk is. */
  const onShelf = useMemo(
    () =>
      (folders.data ?? []).filter(
        (folder) => !folder.is_default && folder.my_label === name && name !== '',
      ),
    [folders.data, name],
  )
  const addable = (folders.data ?? []).filter(
    (folder) =>
      !folder.is_default && (folder.my_label === null || folder.my_label !== name),
  )

  /*
  Presence from the membership, position from the layout (DES-219). Stored
  rows whose membership is gone are dropped; members the layout has never
  placed join after the last folder row, or lead the page. The joined rows
  are render-only until the next block write carries them.
  */
  const blocks = useMemo((): readonly PageBlock[] => {
    const stored = page.data?.blocks ?? []
    const membership = new Map(onShelf.map((folder) => [folder.id, folder]))
    const kept = stored.filter(
      (block) =>
        block.kind !== 'folder_ref' ||
        (block.ref_folder_id !== null && membership.has(block.ref_folder_id)),
    )
    const placed = new Set(
      kept.flatMap((block) =>
        block.kind === 'folder_ref' && block.ref_folder_id !== null
          ? [block.ref_folder_id]
          : [],
      ),
    )
    const missing = onShelf
      .filter((folder) => !placed.has(folder.id))
      .map(
        (folder, extra): PageBlock => ({
          /* A render-only row: no stored block yet, so its id is its
             folder's, which the next write sends as a fresh insert. */
          id: `unplaced-${folder.id}`,
          kind: 'folder_ref',
          position: kept.length + extra,
          text: null,
          file_id: null,
          ref_folder_id: folder.id,
          updated_at: '',
        }),
      )
    if (missing.length === 0) return kept
    let lastFolderAt = -1
    kept.forEach((block, index) => {
      if (block.kind === 'folder_ref') lastFolderAt = index
    })
    const at = lastFolderAt + 1
    return [...kept.slice(0, at), ...missing, ...kept.slice(at)]
  }, [page.data?.blocks, onShelf])

  /** A rendered block as a write: stored rows carry their evidence,
   * render-only folder rows become inserts (no id that never was). */
  function writeOf(block: PageBlock): PageBlockWrite {
    if (block.id.startsWith('unplaced-')) {
      return {
        kind: 'folder_ref',
        position: block.position,
        ref_folder_id: block.ref_folder_id,
      }
    }
    return carryAll([block])[0] as PageBlockWrite
  }

  function put(body: PageBlockWrite[]): void {
    putPage.mutate(
      { id, body: { blocks: body } },
      /* The 409 a stale write earns is already the 5.1 toast; the refetch
         is what replaces the loser on screen (LWW handled visibly). */
      { onError: () => void page.refetch() },
    )
  }

  const addFolderRow = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex h-[var(--control-height)] w-full items-center gap-3 rounded-md px-2 text-left text-sm text-[var(--color-graphite-500)] transition-colors outline-none hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-700)] focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)]"
          />
        }
      >
        <Plus className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        Add folder
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
        {addable.map((folder) => {
          const Glyph = markIcon(folder.icon)
          return (
            <DropdownMenuItem
              key={folder.id}
              onClick={() => {
                /* The same act the sidebar's "Move to shelf" performs: the
                   label is the membership (4.18), so the row joins the page
                   through the reconciliation with no reload (AC-223). */
                move.mutate({ id: folder.id, body: { label: name } })
              }}
            >
              <Glyph
                className="size-4"
                style={{ color: folder.color ?? 'var(--color-graphite-700)' }}
                aria-hidden="true"
              />
              <span className="truncate">{folder.name}</span>
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            navigate(paths.desk)
          }}
        >
          <FolderPlus className="size-4" aria-hidden="true" />
          New folder…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  let lastFolderAt = -1
  blocks.forEach((block, index) => {
    if (block.kind === 'folder_ref') lastFolderAt = index
  })

  return (
    <div className="space-y-4">
      <PageBody query={shelf} isEmpty={false} emptyCopy="">
        <WindowBarActions>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={MORE_ACTIONS}
                  className="size-7 rounded-md text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-900)]"
                />
              }
            >
              <MoreHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onClick={() => {
                  setHistoryOpen(true)
                }}
              >
                History
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setRenaming(true)
                }}
              >
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  void navigator.clipboard.writeText(
                    `${globalThis.location.origin}${paths.shelf(id)}`,
                  )
                }}
              >
                Copy link
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  /* The page, no folders (9.10): a folder is on one shelf. */
                  createShelf.mutate(
                    {
                      name: `${name} copy`.slice(0, 40),
                      icon: detail?.icon ?? null,
                      color: detail?.color ?? null,
                      description: detail?.description ?? null,
                    },
                    {
                      onSuccess: (made) => {
                        const copied = (page.data?.blocks ?? [])
                          .filter((block) => block.kind !== 'folder_ref')
                          .map((block, position) => ({
                            kind: block.kind,
                            position,
                            text: block.text,
                            file_id: block.file_id,
                          }))
                        if (copied.length > 0) {
                          putNewPage.mutate({ id: made.id, body: { blocks: copied } })
                        }
                        navigate(paths.shelf(made.id))
                      },
                    },
                  )
                }}
              >
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const blob = new Blob([shelfWorkflowFile(name, onShelf)], {
                    type: 'application/json',
                  })
                  const url = URL.createObjectURL(blob)
                  const anchor = document.createElement('a')
                  anchor.href = url
                  anchor.download = `${name}.dana-workflow.json`
                  anchor.click()
                  URL.revokeObjectURL(url)
                }}
              >
                Save as workflow
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  /* Unlabels its folders and keeps them (9.10); section 9
                     puts no confirm on it, and the way back is making it
                     again. */
                  remove.mutate(id, {
                    onSuccess: () => {
                      navigate(paths.desk)
                    },
                  })
                }}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </WindowBarActions>

        <IdentityHead
          kind="shelf"
          identity={{
            name,
            icon: detail?.icon ?? null,
            color: detail?.color ?? null,
            coverFileId: detail?.cover_file_id ?? null,
            description: detail?.description ?? null,
          }}
          canRename
          canCover={false}
          renaming={renaming}
          onStartRename={() => {
            setRenaming(true)
          }}
          onEndRename={() => {
            setRenaming(false)
          }}
          onIdentity={(next) => {
            patch.mutate({ id, body: next })
          }}
          onRename={(next) => {
            /* 9.10: renaming rewrites the member labels and re-addresses the
               page in one act, and 4.18's lockstep makes that the server's
               transaction rather than a client sweep. */
            patch.mutate({ id, body: { name: next } })
          }}
          onDescription={(next) => {
            patch.mutate({ id, body: { description: next } })
          }}
          onCover={() => undefined}
        />

        <section className="pt-4">
          {onShelf.length === 0 ? (
            <p className="mb-1 rounded-lg border border-dashed border-[var(--color-graphite-200)] px-4 py-8 text-center text-[13px] leading-5 text-[var(--color-graphite-500)]">
              Nothing on this shelf yet. Add a folder below, or move one here
              from its own menu.
            </p>
          ) : null}
          {lastFolderAt < 0 ? addFolderRow : null}
          <PageBody query={page} isEmpty={false} emptyCopy="">
            <BlocksEditor
              blocks={blocks}
              writeOf={writeOf}
              onPut={put}
              folderRow={(block) => {
                const folder = onShelf.find(
                  (candidate) => candidate.id === block.ref_folder_id,
                )
                if (folder === undefined) return null
                const Glyph = markIcon(folder.icon)
                return (
                  <div>
                    <a
                      href={paths.folder(folder.id)}
                      onClick={(event) => {
                        event.preventDefault()
                        /* Opens as its own tab beside the shelf's and lands
                           on it (9.1, the 2026-08-24 ruling). */
                        navigate(openInNewTab(paths.folder(folder.id)))
                      }}
                      className="flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left transition-colors outline-none hover:bg-[var(--color-graphite-50)] focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)]"
                    >
                      <Glyph
                        className="size-4 shrink-0"
                        style={{ color: folder.color ?? 'var(--color-graphite-700)' }}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate text-[14px] leading-5 text-[var(--color-graphite-800)]">
                        {folder.name}
                      </span>
                      {folder.counts.pending > 0 ? (
                        <span className="shrink-0 text-[12px] leading-4 text-[var(--color-graphite-500)] tabular-nums">
                          {folder.counts.pending}
                        </span>
                      ) : null}
                    </a>
                    {blocks.indexOf(block) === lastFolderAt ? addFolderRow : null}
                  </div>
                )
              }}
            />
          </PageBody>
        </section>
      </PageBody>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="right" className="w-[380px]">
          <SheetHeader>
            <SheetTitle>History</SheetTitle>
            <SheetDescription>What happened to {name}.</SheetDescription>
          </SheetHeader>
          <div className="space-y-2 overflow-y-auto px-4 pb-4">
            {(events.data?.events ?? []).map((event) => (
              <p key={event.id} className="text-[13px] leading-5 text-[var(--color-graphite-700)]">
                {event.verb} {event.subject_name}
                {event.detail === null ? '' : `, ${event.detail}`}
                <span className="block text-[11px] leading-4 text-[var(--color-graphite-400)]">
                  {formatAgo(event.created_at, Date.now())}
                </span>
              </p>
            ))}
            {(events.data?.events.length ?? 0) === 0 ? (
              <p className="text-[13px] leading-5 text-[var(--color-graphite-500)]">
                Nothing yet.
              </p>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
