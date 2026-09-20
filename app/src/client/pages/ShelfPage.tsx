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
Copy link through `lib/nav-links.ts`, Duplicate as one call to
`POST /shelves/:id/duplicate` and no folders (9.10: a folder is on one shelf),
which carries the mark, the colour, the description and a cover picture of the
copy's own and does not carry the blocks — see the act's own note — Save as
workflow as 7.16's file, Delete
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
  useDeleteShelf,
  useDuplicateShelf,
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
import { PageBody } from '../components/page/PageStates.js'
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
  const duplicate = useDuplicateShelf()
  const move = useUpdateMyMembership()

  const detail = shelf.data
  const name = detail?.name ?? ''

  /* The membership: folders whose personal label is this shelf's name.
     Desk never shelves (9.10), and is_default is what Desk is. */
  const onShelf = useMemo(
    () =>
      (folders.data ?? []).filter(
        (folder) => !folder.is_default && folder.my_shelf === name && name !== '',
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
            !folder.is_default && (folder.my_shelf === null || folder.my_shelf !== name),
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
                 `shelf` field is the membership (4.18), so the row joins the
                 page through the reconciliation with no reload (AC-223). */
              move.mutate({ id: folderId, body: { shelf: name } })
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
              /*
              One act on the server (7.16 as amended 2026-09-04; issues #117
              and #128), and no folders, 9.10's rule that a folder is on one
              shelf. What stood here was `POST /shelves` carrying the icon,
              the colour and the description read out of this page, then a
              second write of the copied blocks — and it could not carry the
              cover at all, `POST /shelves` refusing all three cover fields
              out loud rather than dropping them silently (#40's ruling). So
              a duplicated shelf lost one of the four things that made it
              look like itself the day #20 gave a shelf a cover to lose.

              Two calls also have a gap in them, and a failure landing in it
              is the half-duplicated shelf #128 asks not to exist; and a copy
              that pointed at the same `cover_file_id` would not be
              independent, the foreign key's ON DELETE SET NULL blanking both
              shelves the moment that file went. Both are why this is the
              server's one transaction rather than the client's two writes.

              **The copy no longer carries this shelf's blocks**, and that is
              a real change rather than an oversight here: 7.16's amendment
              says the duplicate does not carry the page (4.17), on the
              reading that 9.10's "the page, no folders" distinguishes the
              shelf from its membership rather than promising its prose. The
              blocks are named in the annotation on 9.10 so the next reader
              meets the decision rather than the difference.
              */
              duplicate.mutate(id, {
                onSuccess: (made) => {
                  /* The shelves list refetches through the mutation cache's
                     own onSuccess (8.3), which invalidates everything after
                     every successful write, so the sidebar and the Library
                     hold the copy without this page naming the key a second
                     time. */
                  void navigate(paths.shelf(made.id))
                },
              })
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
