// The Discussion tab name, heavier while an open thread has an unread post.
import { useDiscussions } from '../../api/consultation.js'
import { useMe } from '../../api/queries.js'
import { cn } from '../ui/utils.js'
import { isUnread } from './DiscussionList.js'

export function DiscussionTabName({ folderId, name }: { readonly folderId: string; readonly name: string }): React.JSX.Element {
  const list = useDiscussions(folderId, 'open', '')
  const viewerId = useMe().data?.user.id ?? null
  const unread = list.data?.pages.some((page) => page.discussions.some((d) => isUnread(d, viewerId))) ?? false
  return <span className={cn(unread && 'font-title text-foreground')}>{name}</span>
}
