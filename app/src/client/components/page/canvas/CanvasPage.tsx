import { createReactBlockSpec } from '@blocknote/react'
import { useNavigate } from 'react-router'

import { useFolders } from '../../../api/queries.js'
import { folderMark } from '../../../parts/presenters.js'

const ROW = 'flex h-8 w-full min-w-0 items-center gap-2 rounded-sm px-1 text-left no-underline outline-none'

/**
 * One sub-page of this Folder (Wave 2, `page` block): its mark and its own
 * name, read from the viewer's `GET /folders` and never stored on the block.
 * A page the viewer cannot open (not a member, or in Trash) looks the same
 * as one that does not exist: no name, no way in.
 */
export function CanvasPage({ folderId }: { readonly folderId: string }): React.JSX.Element {
  const folders = useFolders()
  const navigate = useNavigate()
  const folder = folders.data?.find((candidate) => candidate.id === folderId)
  if (folder === undefined) {
    if (folders.isPending) return <div contentEditable={false} data-canvas-page-id={folderId} aria-busy="true" className="h-8" />
    return <p contentEditable={false} data-canvas-page-id={folderId} className={`${ROW} text-sm text-muted-foreground`}>Page you can't open</p>
  }
  const mark = folderMark(folder)
  const path = `/app/folders/${folderId}`
  return (
    <a
      contentEditable={false}
      data-canvas-page-id={folderId}
      href={path}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
        event.preventDefault()
        void navigate(path)
      }}
      className={`${ROW} transition-colors hover:bg-muted`}
    >
      <mark.icon className="size-4 shrink-0" style={{ color: mark.color }} strokeWidth={1.75} aria-hidden="true" />
      <span className="min-w-0 truncate text-sm text-foreground">{folder.name}</span>
    </a>
  )
}

export const createCanvasPageSpec = createReactBlockSpec(
  { type: 'danaPage', propSchema: { folderId: { default: '' } }, content: 'none' },
  {
    render: ({ block }) => <CanvasPage folderId={block.props.folderId} />,
    toExternalHTML: ({ block }) => <p><a href={`${window.location.origin}/app/folders/${block.props.folderId}`}>Page</a></p>,
  },
)
