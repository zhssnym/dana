/*
 * A shelf (collection) page: wiring; the markup is `screens/shelf-page.tsx`. Members are folders whose personal
 * label is the shelf's name; Desk never shelves.
 */
import { lazy, Suspense, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import {
  useDeleteShelf,
  useDuplicateShelf,
  usePatchShelf,
  useUpdateMyMembership,
} from '../api/mutations.js'
import { useFolders, useShelf, useShelfPage } from '../api/queries.js'
import { copyShelfLink } from '../lib/shelf-acts.js'
import { DEFAULT_FOLDER_COLOR } from '../parts/presenters.js'
import { paths } from '../routes.js'
import { ShelfPage as ShelfScreen } from '../screens/shelf-page.js'
import type { CanvasFolderRow } from '../components/page/canvas/CanvasFolder.js'
import { deleteGroupConfirm } from '../shell/folder-groups.js'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js'
import { PageBody } from '../components/page/PageStates.js'

const ShelfCanvas = lazy(() => import('../components/page/canvas/ShelfCanvas.js'))

export function ShelfPage(): React.JSX.Element {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const shelf = useShelf(id)
  const page = useShelfPage(id)
  const folders = useFolders()
  const patch = usePatchShelf()
  const remove = useDeleteShelf()
  const duplicate = useDuplicateShelf()
  const move = useUpdateMyMembership()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const detail = shelf.data
  const name = detail?.name ?? ''

  /* Desk never shelves; is_default is what Desk is. */
  const onShelf = useMemo(
    () =>
      (folders.data ?? []).filter(
        (folder) => !folder.is_default && folder.my_shelf === name && name !== '',
      ),
    [folders.data, name],
  )
  const shelfFolders = useMemo(
    (): CanvasFolderRow[] =>
      onShelf.map((folder) => ({
        id: folder.id,
        name: folder.name,
        color: folder.color ?? DEFAULT_FOLDER_COLOR,
        icon: folder.icon,
      })),
    [onShelf],
  )

  return (
    <PageBody query={shelf} isEmpty={false} emptyCopy="">
      <PageBody query={page} isEmpty={false} emptyCopy="">
        {/* Mount only once the folder list is here: an empty membership would rewrite the arrangement and cause a 409. */}
        {page.data === undefined || folders.data === undefined ? null : (
          <ShelfScreen
            /* Remounted per shelf; the screen holds its arrangement as state. */
            key={id}
            id={id}
            name={name}
            onRename={(next) => {
              /* The server renames the member labels in the same transaction. */
              patch.mutate({ id, body: { name: next } })
            }}
            onCopyLink={() => {
              copyShelfLink(id)
            }}
            onDuplicate={() => {
              /*
               * One server act: POST /shelves refuses cover fields, two calls can leave a half copy, and the
               * copy needs its own cover file. It does not carry the page's blocks.
               */
              duplicate.mutate(id, {
                onSuccess: (made) => {
                  /* The mutation cache's invalidation refreshes the shelves list. */
                  void navigate(paths.shelf(made.id))
                },
              })
            }}
            onDelete={() => {
              /* Folders stay, but the shelf's writing goes, so it asks first. */
              setConfirmingDelete(true)
            }}
          >
            {/* One quiet line, so an empty collection is not a bare title. */}
            {onShelf.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pages in this collection yet.</p>
            ) : null}
            <Suspense fallback={<p role="status" className="sr-only">Loading writing…</p>}>
              <ShelfCanvas
                shelfId={id}
                page={page.data}
                folders={shelfFolders}
                folderHref={paths.folder}
                settled={!shelf.isFetching && !folders.isFetching}
                onOpenFolder={(folderId) => {
                  void navigate(paths.folder(folderId))
                }}
                onRemoveFolder={async (folderId) => {
                  await move.mutateAsync({ id: folderId, body: { shelf: null } })
                }}
              />
            </Suspense>
          </ShelfScreen>
        )}
        {confirmingDelete ? (
          <ConfirmDialog
            message={deleteGroupConfirm(onShelf.length)}
            confirmLabel="Delete collection"
            onContinue={() => {
              setConfirmingDelete(false)
              remove.mutate(id, {
                onSuccess: () => {
                  void navigate(paths.today)
                },
              })
            }}
            onCancel={() => {
              setConfirmingDelete(false)
            }}
          />
        ) : null}
      </PageBody>
    </PageBody>
  )
}
