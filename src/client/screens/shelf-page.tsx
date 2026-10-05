/*
 * The shelf page. A shelf is keyed by id, never by name. The body is the shelf canvas, passed as `children`.
 * Rename lives in the title: Enter or blur commits, Escape restores (AC-203).
 */

import { useEffect, useState } from "react"
import { useSearchParams } from "react-router"
import type { ReactNode } from "react"

import { FolderHeader } from "../components/folder-head.js"
import { markIcon } from "../components/page/icon-manifest.js"
import { ObjectMenu } from "../components/object-menu.js"
import { HistorySheet } from "../components/history-sheet.js"
import { IDENTITY_COLOR_FALLBACK } from "../parts/identity-colors.js"
import {
  savePageIdentity as savePrototypeFolderIdentity,
  usePageIdentity as useFolderIdentity,
} from "../lib/page-identity.js"
import { shelfKey } from "../lib/shelf-acts.js"
import { SHELF_ACTION_PARAM } from "../shell/app-sidebar.js"

export function ShelfPage({
  id,
  name,
  children,
  onRename,
  onCopyLink,
  onDuplicate,
  onDelete,
}: {
  id: string
  name: string
  children: ReactNode
  onRename?: (next: string) => void
  /* Absent acts are not drawn. */
  onCopyLink?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
}) {
  const key = shelfKey(id)
  const identity = useFolderIdentity(key)
  const Mark = markIcon(identity.glyph ?? null)

  const [historyOpen, setHistoryOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)

  /*
   * History or rename asked for by the Library (`?shelf-action=`): open it and drop the act so Back does not
   * repeat it.
   */
  const [search, setSearch] = useSearchParams()
  const action = search.get(SHELF_ACTION_PARAM)
  useEffect(() => {
    if (action === null) return
    if (action === "history") setHistoryOpen(true)
    if (action === "rename") setRenaming(true)
    setSearch(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete(SHELF_ACTION_PARAM)
        return next
      },
      { replace: true },
    )
  }, [action, setSearch])

  return (
    <div className="flex min-h-full w-full flex-col space-y-4">
      <FolderHeader
        name={name}
        icon={Mark}
        color={identity.color ?? IDENTITY_COLOR_FALLBACK}
        iconKey={identity.glyph ?? null}
        colorKey={identity.color ?? null}
        editable={onRename !== undefined}
        renaming={renaming}
        onRenamingChange={setRenaming}
        onRename={(next) => onRename?.(next)}
        onPickIdentity={(next) =>
          savePrototypeFolderIdentity(key, {
            ...(next.icon === undefined ? {} : { glyph: next.icon }),
            ...(next.color === undefined ? {} : { color: next.color }),
          })
        }
        actions={
          <ObjectMenu
            kind="shelf"
            name={name}
            width="w-52"
            handlers={{
              history: () => setHistoryOpen(true),
              "copy-link": onCopyLink,
              duplicate: onDuplicate,
              delete: onDelete,
            }}
          />
        }
      />
      <HistorySheet
        kind="shelf"
        subject={id}
        name={name}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />

      {/* The page's writing, folder rows among them. */}
      <section>{children}</section>
    </div>
  )
}
