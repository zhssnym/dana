import { Folders, Import, Plus } from '../../lib/icons.js'
import { Button } from '../../components/ui/button.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu.js'

export function NewPageButton({
  onNewPage,
  onNewCollection,
  onImport,
}: {
  readonly onNewPage: () => void
  readonly onNewCollection: () => void
  readonly onImport: () => void
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 rounded-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          />
        }
        aria-label="Add to Library"
        title="Add to Library"
      >
        <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-40">
        <ProjectItems
          onNewPage={onNewPage}
          onNewCollection={onNewCollection}
          onImport={onImport}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ProjectItems({
  onNewPage,
  onNewCollection,
  onImport,
}: {
  readonly onNewPage: () => void
  readonly onNewCollection: () => void
  readonly onImport: () => void
}): React.JSX.Element {
  return (
    <>
      <DropdownMenuItem onClick={onNewPage}>
        <Plus strokeWidth={1.75} aria-hidden="true" />
        New work
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onNewCollection}>
        <Folders strokeWidth={1.75} aria-hidden="true" />
        New collection
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onImport}>
        <Import strokeWidth={1.75} aria-hidden="true" />
        Import work…
      </DropdownMenuItem>
    </>
  )
}

/* Opens at the pointer on a right-click of the sidebar's empty ground.
   A row with its own menu claims the event first. */
export function SidebarGroundMenu({
  at,
  onClose,
  onNewPage,
  onNewCollection,
  onImport,
}: {
  readonly at: { readonly x: number; readonly y: number } | null
  readonly onClose: () => void
  readonly onNewPage: () => void
  readonly onNewCollection: () => void
  readonly onImport: () => void
}): React.JSX.Element | null {
  if (at === null) return null
  return (
    <DropdownMenu
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DropdownMenuTrigger
        nativeButton={false}
        render={
          <span
            aria-hidden="true"
            className="pointer-events-none fixed size-0"
            style={{ left: at.x, top: at.y }}
          />
        }
      />
      <DropdownMenuContent sideOffset={0} className="w-auto min-w-40">
        <ProjectItems
          onNewPage={onNewPage}
          onNewCollection={onNewCollection}
          onImport={onImport}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
