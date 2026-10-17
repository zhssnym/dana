import { useState } from 'react'
import type { ReactElement } from 'react'
import { Link } from 'react-router'
import { Megaphone, Search, Settings, Trash2 } from '../../lib/icons.js'
import { FeedbackDialog } from '../../components/feedback/FeedbackDialog.js'
import { HelpMenu } from '../../components/help/HelpMenu.js'
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
    <>
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      {/* One sidebar row above the foot, not a card. */}
      <section aria-label="Beta feedback" className="border-t border-sidebar-border" onContextMenu={onContextMenu}>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-4 py-2 text-sm text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:bg-sidebar-accent focus-visible:text-foreground"
          onClick={() => setFeedbackOpen(true)}
        >
          <Megaphone strokeWidth={1.75} aria-hidden="true" />
          Share feedback
        </button>
      </section>
      <SidebarFooter className="border-t border-sidebar-border px-1 py-1" onContextMenu={onContextMenu}>
        {/* One balanced row: seven 28px controls fit inside the 224px minimum sidebar
            without changing hit sizes, leaving empty grid cells or widening the footer. */}
        <div className="grid grid-cols-7 items-center justify-items-center gap-0.5">
          <FootTip label={<>Search <kbd data-slot="kbd" className="font-sans opacity-70">{SEARCH_KEYS}</kbd></>}>
            <button type="button" aria-label="Search" aria-keyshortcuts={IS_MAC ? 'Meta+K' : 'Control+K'} className={FOOT_BUTTON} onClick={onOpenSearch}>
              <Search strokeWidth={1.75} aria-hidden="true" />
            </button>
          </FootTip>
          <NotificationsBell side="top" className={FOOT_BUTTON} />
          <MessagesButton className={FOOT_BUTTON} />
          <HelpMenu className={FOOT_BUTTON} onFeedback={() => setFeedbackOpen(true)} />
          <FootTip label="Settings">
            <Link to={paths.settings} aria-label="Settings"
              aria-current={currentPath.startsWith(paths.settings) ? 'page' : undefined}
              className={FOOT_BUTTON}>
              <Settings strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </FootTip>
          <FootTip label="Trash">
            <Link to={paths.trash} aria-label="Trash"
              aria-current={currentPath === paths.trash ? 'page' : undefined}
              className={FOOT_BUTTON}>
              <Trash2 strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </FootTip>
          <FootTip label={isMobile ? 'Close sidebar' : 'Collapse sidebar'}>
            <SidebarTrigger className={FOOT_BUTTON} />
          </FootTip>
        </div>
      </SidebarFooter>
    </>
  )
}
