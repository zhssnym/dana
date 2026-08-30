/*
9.10's shelf page, at /app/shelves/:id.

**This file is wiring and the markup is `screens/shelf-page.tsx`**, lifted
whole from `prototype-v2` at RFC 0004's S27; the screen's header names its
nine seams. What stood here was the S12 port of the same file, reworked onto
`BlocksEditor` and `IdentityHead`, and it retires with this row: the lift
discipline is that the prototype's file crosses, and the rulings sheet's C3
found 9.10 and the prototype agreeing line for line, so nothing about the
page's behaviour moves with the markup.

What the page supplies is what the screen cannot know. **The membership**:
folders whose personal label is this shelf's name (4.18, frozen since 4.4),
read off the folder list already in every page's cache, Desk never shelving
(9.10). **The arrangement**: 4.17's rows through `lib/shelf-layout.ts`, one
PUT of the whole list per change with the evidence it was read with, the
response handed back so the screen adopts the server's ids. **The acts**:
Copy link through `lib/nav-links.ts`, Duplicate as the page and no folders
(9.10: a folder is on one shelf), Save as workflow as 7.16's file, Delete
unlabelling its folders and keeping them, and Rename as 7.16's PATCH, whose
transaction rewrites the member labels (4.18's lockstep). **A folder row
opens as its own tab beside the shelf's** (9.1, the 2026-08-24 ruling), the
press appending through the tab store rather than retargeting.

**"New folder..." asks the shell for its dialog** through
`shell/overlays.ts`, carrying this shelf's name as the label the new folder
is filed under, which is the same two writes the sidebar's "Add folder to
{shelf}" performs.
*/
import { useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router'

import {
  useCreateShelf,
  useDeleteShelf,
  usePatchShelf,
  usePutShelfPage,
  useUpdateMyMembership,
} from '../api/mutations.js'
import { queryKeys } from '../api/keys.js'
import { queryClient } from '../api/queryClient.js'
import { useFolders, useShelf, useShelfPage } from '../api/queries.js'
import { copyShelfLink } from '../lib/shelf-acts.js'
import { shelfItemsOf, shelfWritesOf } from '../lib/shelf-layout.js'
import { DEFAULT_FOLDER_COLOR } from '../parts/presenters.js'
import { paths } from '../routes.js'
import { ShelfPage as ShelfScreen } from '../screens/shelf-page.js'
import type { ShelfFolder, ShelfItem } from '../screens/shelf-page.js'
import { openNewFolder } from '../shell/overlays.js'
import { openInNewTab } from '../shell/tabs.js'
import { PageBody } from '../states/PageStates.js'
import type { Folder } from '../../shared/folders.js'
import type { PageBlock } from '../../shared/pages.js'

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
  const shelfFolders = useMemo(
    (): ShelfFolder[] =>
      onShelf.map((folder) => ({
        id: folder.id,
        name: folder.name,
        color: folder.color ?? DEFAULT_FOLDER_COLOR,
        icon: folder.icon,
        pending: folder.counts.pending,
      })),
    [onShelf],
  )
  const addable = useMemo(
    () =>
      (folders.data ?? [])
        .filter(
          (folder) =>
            !folder.is_default && (folder.my_label === null || folder.my_label !== name),
        )
        .map((folder) => ({
          id: folder.id,
          name: folder.name,
          color: folder.color ?? DEFAULT_FOLDER_COLOR,
          icon: folder.icon,
        })),
    [folders.data, name],
  )

  /* The last read, for the evidence every write carries (4.17). A ref so the
     screen's save, which runs from its own effect, reads what the cache holds
     now rather than what it held when the callback was made. */
  const stored = useRef<readonly PageBlock[]>([])
  stored.current = page.data?.blocks ?? stored.current

  async function onLayoutChange(items: ShelfItem[]): Promise<ShelfItem[] | null> {
    try {
      const saved = await putPage.mutateAsync({
        id,
        body: { blocks: shelfWritesOf(items, stored.current) },
      })
      stored.current = saved.blocks
      queryClient()?.setQueryData(queryKeys.shelfPage(id), saved)
      return shelfItemsOf(saved.blocks)
    } catch {
      /* The 409 a stale write earns is already the 5.1 toast; the refetch
         is what replaces the loser on screen (LWW handled visibly). */
      void page.refetch()
      return null
    }
  }

  return (
    <PageBody query={shelf} isEmpty={false} emptyCopy="">
      <PageBody query={page} isEmpty={false} emptyCopy="">
        {/* polish: shelves F2. Mounted only once the folder list is here:
            mounted before it, the screen read an empty membership, dropped
            every folder row from its arrangement, wrote that, and then wrote
            the folders back with evidence the first write had already
            replaced. Every shelf page opened with a 409 nobody caused and a
            "Someone else changed this block" toast that reload re-raised;
            and a section inserted in between landed under the rows the
            second write re-appended. */}
        {page.data === undefined || folders.data === undefined ? null : (
          <ShelfScreen
            /* Remounted per shelf, the screen holding its arrangement as
               state the way the prototype does. */
            key={id}
            id={id}
            name={name}
            folders={shelfFolders}
            addableFolders={addable}
            initialItems={shelfItemsOf(page.data.blocks)}
            onLayoutChange={onLayoutChange}
            folderHref={(folderId) => paths.folder(folderId)}
            onOpenFolder={(folderId) => {
              void navigate(openInNewTab(paths.folder(folderId)))
            }}
            onAddFolder={(folderId) => {
              /* The same act the sidebar's "Move to shelf" performs: the
                 label is the membership (4.18), so the row joins the page
                 through the reconciliation with no reload (AC-223). */
              move.mutate({ id: folderId, body: { label: name } })
            }}
            onCreateFolder={() => {
              openNewFolder(name)
            }}
            onRename={(next) => {
              /* 9.10: renaming rewrites the member labels and re-addresses
                 the page in one act, and 4.18's lockstep makes that the
                 server's transaction rather than a client sweep. */
              patch.mutate({ id, body: { name: next } })
            }}
            onCopyLink={() => {
              copyShelfLink(id, name)
            }}
            onDuplicate={() => {
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
                        width_pct: block.width_pct,
                      }))
                    if (copied.length > 0) {
                      putNewPage.mutate({ id: made.id, body: { blocks: copied } })
                    }
                    void navigate(paths.shelf(made.id))
                  },
                },
              )
            }}
            onSaveWorkflow={() => {
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
            onDelete={() => {
              /* Unlabels its folders and keeps them (9.10); section 9 puts
                 no confirm on it, and the way back is making it again. */
              remove.mutate(id, {
                onSuccess: () => {
                  void navigate(paths.desk)
                },
              })
            }}
          />
        )}
      </PageBody>
    </PageBody>
  )
}
