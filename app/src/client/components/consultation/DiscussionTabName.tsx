/*
The Discussion tab's name, heavier while any open thread on the page has a
post this person has not read (r7). Weight only, as the list itself marks
unread: no badge, no count. It reads the open threads only (its own key,
polled every twenty seconds like the list's).
*/
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
