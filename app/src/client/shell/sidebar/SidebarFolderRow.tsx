/* One page row in the Library, with its sub-pages under it. */
import { useNavigate } from 'react-router'
import { FolderRow } from '../../components/folder-row.js'
import { SidebarMenu } from '../../components/ui/sidebar.js'
import { useDuplicateFolder } from '../../api/mutations.js'
import { copyLink } from '../../lib/object-acts.js'
import { folderGates } from '../../lib/folder-authority.js'
import { folderRowDisplay } from '../../parts/presenters.js'
import { folderLink } from '../../lib/nav-links.js'
import { paths } from '../../routes.js'
import type { SortableItemState } from '../../lib/use-sortable-list.js'
import type { Folder } from '../../../shared/folders.js'
import { routerLink } from './router-link.js'
import { usePageTree } from './page-tree-context.js'

export function SidebarFolderRow({
  folder,
  activeId,
  nested = false,
  depth = 0,
  drag,
}: {
  readonly folder: Folder
  readonly activeId: string | null
  readonly nested?: boolean
  readonly depth?: number
  readonly drag?: {
    readonly itemRef: (element: HTMLElement | null) => void
    readonly rowProps: React.ComponentProps<'li'>
    readonly state: SortableItemState
    readonly proposal: string | null
  }
}): React.JSX.Element {
  const display = folderRowDisplay(folder)
  const navigate = useNavigate()
  const duplicate = useDuplicateFolder()
  const gates = folderGates({
    access: folder.my_access,
    isOwner: folder.is_owner,
    isDefault: folder.is_default,
  })
  const pages = usePageTree()
  const children = pages.tree.children.get(folder.id) ?? []
  const open = !pages.folded.has(folder.id)
  const canAddInside = !folder.is_default && pages.mayEdit(folder)
  return (
    <FolderRow
      itemRef={drag?.itemRef}
      rowProps={{ ...drag?.rowProps, 'data-drop-row': '' } as React.ComponentProps<'li'>}
      dragState={drag?.state}
      proposal={drag?.proposal ?? null}
      name={display.name}
      color={display.color}
      icon={display.icon}
      href={display.href}
      render={routerLink(display.href)}
      active={activeId === folder.id}
      nested={nested}
      pageId={folder.id}
      depth={depth}
      fold={children.length === 0 ? undefined : { open, onToggle: () => { pages.toggle(folder.id) } }}
      onAddInside={canAddInside ? () => { pages.addInside(folder) } : undefined}
      dropMark={pages.mark?.rowId === folder.id ? pages.mark.kind : null}
      renaming={pages.renaming === folder.id}
      onRename={(name) => {
        pages.rename(folder, name)
      }}
      menuKind={folder.project_id === folder.id ? 'project' : 'folder'}
      acts={
        folder.is_default
          ? {}
          : {
              rename: gates.identity
                ? () => {
                    pages.startRename(folder.id)
                  }
                : undefined,
              'copy-link': () => {
                copyLink(folderLink(folder.id))
              },
              duplicate: () => {
                duplicate.mutate(folder.id, {
                  onSuccess: (made) => {
                    void navigate(paths.folder(made.id))
                  },
                })
              },
              leave: gates.leave
                ? () => {
                    pages.leave(folder)
                  }
                : undefined,
              archive: gates.trash ? () => { pages.archive(folder) } : undefined,
              delete: gates.trash
                ? () => {
                    pages.trash(folder)
                  }
                : undefined,
            }
      }
    >
      {!open || children.length === 0 ? null : (
        <SidebarMenu>
          {children.map((child) => (
            <SidebarFolderRow
              key={child.id}
              folder={child}
              activeId={activeId}
              nested={nested}
              depth={depth + 1}
            />
          ))}
        </SidebarMenu>
      )}
    </FolderRow>
  )
}
