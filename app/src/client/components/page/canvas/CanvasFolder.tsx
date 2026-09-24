import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { createReactBlockSpec } from '@blocknote/react'

import { markIcon } from '../icon-manifest.js'
import { cn } from '../../ui/utils.js'

/** What a Shelf's native Folder row draws: the membership's own facts, read
 * from Dana's folder list rather than stored on the block (#221). */
export interface CanvasFolderRow {
  readonly id: string
  readonly name: string
  readonly color: string
  readonly icon: string | null
}
interface FolderBridge {
  readonly byId: ReadonlyMap<string, CanvasFolderRow>
  readonly href: (folderId: string) => string
  readonly open: (folderId: string) => void
}

const FolderContext = createContext<FolderBridge | null>(null)

export function CanvasFolderProvider({ value, children }: { readonly value: FolderBridge; readonly children: ReactNode }): React.JSX.Element {
  return <FolderContext.Provider value={value}>{children}</FolderContext.Provider>
}

/** A native Folder row on a Shelf (`folder_ref`): placement only, the Folder's
 * membership of the Shelf stays `folder_members.shelf_name`. Icon and name,
 * nothing else; it opens the Folder (AC-223). */
function CanvasFolder({ folderId }: { readonly folderId: string }): React.JSX.Element {
  const bridge = useContext(FolderContext)
  const folder = bridge?.byId.get(folderId)
  const Glyph = markIcon(folder?.icon ?? null)
  if (bridge === null || folder === undefined) {
    return <p contentEditable={false} className="py-2 text-sm text-muted-foreground">This page is unavailable.</p>
  }
  return (
    <a
      contentEditable={false}
      data-canvas-folder-id={folderId}
      href={bridge.href(folderId)}
      onClick={(event) => { event.preventDefault(); bridge.open(folderId) }}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-sm px-1 text-left no-underline outline-none transition-colors',
        'hover:bg-muted',
      )}
    >
      <Glyph className="size-4 shrink-0" style={{ color: folder.color }} strokeWidth={1.75} aria-hidden="true" />
      <span className="min-w-0 truncate text-sm text-foreground">{folder.name}</span>
    </a>
  )
}

export const createCanvasFolderSpec = createReactBlockSpec(
  { type: 'danaFolder', propSchema: { folderId: { default: '' } }, content: 'none' },
  { render: ({ block }) => <CanvasFolder folderId={block.props.folderId} /> },
)
