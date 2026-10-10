import { useState } from 'react'
import type { ReactElement } from 'react'
import { Link } from 'react-router'
import { Megaphone, Search, Settings, Trash2 } from '../../lib/icons.js'
import { FeedbackDialog } from '../../components/feedback/FeedbackDialog.js'
import { SidebarFooter, SidebarTrigger } from '../../components/ui/sidebar.js'
import { NotificationsBell } from '../../components/notifications-bell.js'
import { MessagesButton } from '../../components/direct-message/MessagesButton.js'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip.js'
import { paths } from '../../routes.js'

const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** Shared by every foot button, including the bell and the collapse. */
export const FOOT_BUTTON =
  'flex size-(--control-height) shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-foreground [&_svg]:!size-4'

function FootTip({
  label,
  children,
}: {
  readonly label: React.ReactNode
  readonly children: ReactElement<Record<string, unknown>>
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

const SEARCH_KEYS = IS_MAC ? '⌘K' : 'Ctrl K'

export function SidebarFoot({
  currentPath,
  isMobile,
  onOpenSearch,
  onContextMenu,
}: {
  readonly currentPath: string
  readonly isMobile: boolean
  readonly onOpenSearch: () => void
  readonly onContextMenu: (event: React.MouseEvent) => void
}): React.JSX.Element {
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  return (
    <SidebarFooter className="border-t border-border p-2" onContextMenu={onContextMenu}>
      <button
        type="button"
        className="flex h-(--shell-sidebar-row-height) w-full items-center gap-2 rounded-md px-2 text-sm text-muted-foreground outline-none hover:bg-(--sidebar-row-hover) hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-md:h-(--row-height) [&_svg]:size-4 [&_svg]:shrink-0"
        onClick={() => setFeedbackOpen(true)}
      >
        <Megaphone strokeWidth={1.75} aria-hidden="true" />
        Send feedback
      </button>
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      <div className="flex items-center gap-1">
        <FootTip label={<>Search <kbd data-slot="kbd" className="font-sans opacity-70">{SEARCH_KEYS}</kbd></>}>
          <button type="button" aria-label="Search" aria-keyshortcuts={IS_MAC ? 'Meta+K' : 'Control+K'} className={FOOT_BUTTON} onClick={onOpenSearch}>
            <Search strokeWidth={1.75} aria-hidden="true" />
          </button>
        </FootTip>
        <NotificationsBell side="top" className={FOOT_BUTTON} />
        <MessagesButton className={FOOT_BUTTON} />
        <FootTip label="Settings">
          <Link
            to={paths.settings}
            aria-label="Settings"
            aria-current={currentPath.startsWith(paths.settings) ? 'page' : undefined}
            className={FOOT_BUTTON}
          >
            <Settings strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </FootTip>
        <FootTip label="Trash">
          <Link
            to={paths.trash}
            aria-label="Trash"
            aria-current={currentPath === paths.trash ? 'page' : undefined}
            className={FOOT_BUTTON}
          >
            <Trash2 strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </FootTip>
        <span className="min-w-0 flex-1" />
        <FootTip label={isMobile ? 'Close sidebar' : 'Collapse sidebar'}>
          <SidebarTrigger className={FOOT_BUTTON} />
        </FootTip>
      </div>
    </SidebarFooter>
  )
}
