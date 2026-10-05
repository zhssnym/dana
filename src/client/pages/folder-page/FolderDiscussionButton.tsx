import { Button } from '../../components/ui/button.js'
import { cn } from '../../components/ui/utils.js'
import { MessagesSquare } from '../../lib/icons.js'
import { closeChatDock, openChatDock } from '../../state/chat-dock.js'

export function FolderDiscussionButton({
  dockOpen,
  unreadThreads,
  headId,
  setSharing,
}: {
  readonly dockOpen: boolean
  readonly unreadThreads: boolean
  readonly headId: string
  readonly setSharing: (next: boolean) => void
}): React.JSX.Element {
  return (
    <Button
      variant="ghost"
      aria-pressed={dockOpen}
      className={cn('text-muted-foreground', dockOpen && 'bg-hover text-foreground')}
      onClick={() => {
        if (dockOpen) {
          closeChatDock()
          return
        }
        setSharing(false)
        openChatDock({ folderId: headId })
      }}
    >
      <MessagesSquare className="size-4" strokeWidth={1.75} aria-hidden="true" />
      Discussion
      {unreadThreads && !dockOpen ? (
        <span className="size-1.5 rounded-full bg-primary">
          <span className="sr-only">New messages</span>
        </span>
      ) : null}
    </Button>
  )
}
