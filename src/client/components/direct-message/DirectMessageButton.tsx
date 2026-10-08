import { useMe } from '../../api/queries.js'
import { MessageCircle } from '../../lib/icons.js'
import { Button } from '../ui/button.js'
import { useDirectMessageCenter } from './DirectMessageCenter.js'

export function DirectMessageButton({ folderId, memberId, memberName, memberImage, prominent = false }: {
  readonly folderId: string
  readonly memberId: string
  readonly memberName: string
  readonly memberImage?: string | null
  readonly prominent?: boolean
}): React.JSX.Element | null {
  const me = useMe()
  const center = useDirectMessageCenter()
  if (me.data === undefined || me.data.user.id === memberId) return null
  return <Button variant={prominent ? 'default' : 'ghost'} size="sm" aria-label={`Message ${memberName}`}
    className={prominent ? undefined : 'text-muted-foreground hover:text-foreground'}
    onClick={() => center.open({ folderId, memberId, memberName, memberImage: memberImage ?? null })}>
    <MessageCircle strokeWidth={1.75} aria-hidden="true" /> Message
  </Button>
}
