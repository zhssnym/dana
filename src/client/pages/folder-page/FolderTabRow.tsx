import { FolderTabs } from '../../components/folder-tabs.js'
import type { Folder } from '../../../shared/folders.js'
import type { FolderActs } from './folder-acts.js'

export function FolderTabRow({
  failed,
  tabs,
  activeId,
  onSelect,
  editable,
  acts,
  tools,
}: {
  readonly failed: boolean
  readonly tabs: readonly Folder[]
  readonly activeId: string
  readonly onSelect: (tab: Folder) => void
  readonly editable: boolean
  readonly acts: Pick<FolderActs, 'reorderTabs' | 'addTab' | 'renameTab' | 'removeTab'>
  readonly tools: React.ReactNode
}): React.JSX.Element {
  return failed ? (
    <p role="alert" className="text-sm text-muted-foreground">
      Could not load this page’s tabs. Reload to try again.
    </p>
  ) : (
    <FolderTabs
      tabs={tabs}
      activeId={activeId}
      onSelect={onSelect}
      editable={editable}
      onReorder={acts.reorderTabs}
      onAdd={acts.addTab}
      onRename={acts.renameTab}
      onDelete={acts.removeTab}
      tools={tools}
    />
  )
}
