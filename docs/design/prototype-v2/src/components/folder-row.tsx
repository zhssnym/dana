import {
  FolderInput,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Trash2,
} from "@/lib/icons"

import { folderGlyph } from "@/components/folder-icon-picker"
import { useFolderIdentity } from "@/lib/folder-presentation"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

export interface FolderRowProps {
  name: string
  color: string
  pending: number
  active?: boolean
  nested?: boolean
  tree?: boolean
  treeLast?: boolean
  groupLabels?: string[]
  currentLabel?: string | null
  onSelect?: () => void
  onAddTask?: () => void
  onMoveToLabel?: (label: string | null) => void
  onRename?: () => void
  onEditAppearance?: () => void
  onDelete?: () => void
}

export function FolderRow({
  name,
  color,
  pending,
  active = false,
  nested = false,
  tree = false,
  treeLast = false,
  groupLabels = [],
  currentLabel = null,
  onSelect,
  onAddTask,
  onMoveToLabel,
  onRename,
  onEditAppearance,
  onDelete,
}: FolderRowProps) {
  const hasFolderMenu = Boolean(
    onRename || onEditAppearance || onMoveToLabel || onDelete,
  )
  const hasActions = Boolean(onAddTask || hasFolderMenu)
  /* The mark a person put on the folder follows it into the sidebar
     (DES-130); a folder nobody has touched keeps the plain folder glyph. */
  const identity = useFolderIdentity(name)
  const Glyph = folderGlyph(identity.glyph)
  const glyphColor = identity.color ?? color

  return (
    <SidebarMenuItem
      className={cn(
        "group/folder-row",
        tree &&
          "before:absolute before:-top-0.5 before:left-6 before:z-0 before:h-[calc(50%+2px)] before:w-1.5 before:rounded-bl-[6px] before:border-b before:border-l before:border-[var(--color-graphite-300)] before:content-[''] after:absolute after:top-1/2 after:-bottom-0.5 after:left-6 after:z-0 after:border-l after:border-[var(--color-graphite-300)] after:content-['']",
        tree && treeLast && "after:hidden",
      )}
    >
      <SidebarMenuButton
        data-sidebar-tier="folder"
        isActive={active}
        aria-current={active ? "page" : undefined}
        title={name}
        tooltip={name}
        onClick={onSelect}
        className={cn(
          "relative h-[var(--shell-sidebar-row-height)] gap-2 border-0 bg-transparent px-3 text-[13px] font-medium text-[var(--color-graphite-600)] hover:bg-transparent hover:text-[var(--color-graphite-600)] data-active:bg-transparent data-active:font-semibold data-active:text-[var(--color-graphite-900)] before:pointer-events-none before:absolute before:inset-x-1 before:inset-y-px before:rounded-md before:content-[''] hover:before:bg-[var(--color-graphite-100)] group-hover/folder-row:before:bg-[var(--color-graphite-100)] data-active:before:bg-[var(--color-graphite-100)] [&>*]:relative [&>*]:z-10",
          nested && !tree && "pl-7",
          tree && "pl-10 before:!left-8",
          (pending > 0 || hasActions) && "pr-[4.75rem]",
        )}
      >
        <Glyph
          className="!size-4 shrink-0 opacity-90"
          style={{ color: glyphColor }}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate">{name}</span>
      </SidebarMenuButton>

      {pending > 0 ? (
        <SidebarMenuBadge
          className={cn(
            "right-3 h-5 min-w-5 rounded-full bg-[var(--color-graphite-200)] px-1.5 text-[0.625rem] text-[var(--color-graphite-600)] peer-data-active/menu-button:bg-[var(--color-graphite-200)] peer-data-active/menu-button:text-[var(--color-graphite-800)]",
            hasActions &&
              "transition-opacity group-hover/folder-row:pointer-events-none group-hover/folder-row:opacity-0 group-focus-within/folder-row:pointer-events-none group-focus-within/folder-row:opacity-0",
          )}
        >
          {pending}
        </SidebarMenuBadge>
      ) : null}

      {hasActions ? (
        <div className="pointer-events-none absolute top-1/2 right-1 z-20 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/folder-row:pointer-events-auto group-hover/folder-row:opacity-100 group-focus-within/folder-row:pointer-events-auto group-focus-within/folder-row:opacity-100">
          {onAddTask ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 rounded-md text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-900)]"
              aria-label={`Add task to ${name}`}
              onClick={onAddTask}
            >
              <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </Button>
          ) : null}

          {hasFolderMenu ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 rounded-md text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-900)]"
                    aria-label={`Manage ${name} folder`}
                  />
                }
              >
                <MoreHorizontal className="size-4" strokeWidth={1.75} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {onRename ? (
                  <DropdownMenuItem onClick={onRename}>
                    <Pencil className="size-4" />Rename
                  </DropdownMenuItem>
                ) : null}
                {onEditAppearance ? (
                  <DropdownMenuItem onClick={onEditAppearance}>
                    <Palette className="size-4" />Label and color
                  </DropdownMenuItem>
                ) : null}
                {onMoveToLabel ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <FolderInput className="size-4" />Move to group
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-44">
                      <DropdownMenuRadioGroup
                        value={currentLabel || "__none"}
                        onValueChange={(value) =>
                          onMoveToLabel(value === "__none" ? null : value)
                        }
                      >
                        {groupLabels.map((label) => (
                          <DropdownMenuRadioItem
                            key={label}
                            value={label}
                            closeOnClick
                          >
                            {label}
                          </DropdownMenuRadioItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuRadioItem value="__none" closeOnClick>
                          No group
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : null}
                {onDelete ? <DropdownMenuSeparator /> : null}
                {onDelete ? (
                  <DropdownMenuItem variant="destructive" onClick={onDelete}>
                    <Trash2 className="size-4" />Delete folder…
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : null}
    </SidebarMenuItem>
  )
}
