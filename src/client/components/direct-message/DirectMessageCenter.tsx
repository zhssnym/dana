import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import type { DirectConversationSummary } from '../../../shared/direct-messages.js'
import { listDirectMessages } from '../../api/direct-messages.js'
import { queryKeys } from '../../api/keys.js'
import { useMe } from '../../api/queries.js'
import { MessageCircle, X } from '../../lib/icons.js'
import { PersonFace } from '../person-face.js'
import { Button } from '../ui/button.js'
import { Conversation } from './Conversation.js'

interface ChatTarget {
  readonly memberId: string
  readonly memberName: string
  readonly memberImage: string | null
  readonly conversationId?: string
  readonly folderId?: string
}

interface CenterValue {
  readonly conversations: readonly DirectConversationSummary[]
  readonly unread: number
  readonly open: (target: ChatTarget) => void
}

const CenterContext = createContext<CenterValue | null>(null)

export function useDirectMessageCenter(): CenterValue {
  const value = useContext(CenterContext)
  if (value === null) throw new Error('Direct messages need the app shell.')
  return value
}

export function DirectMessageCenter({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const me = useMe()
  const client = useQueryClient()
  const [target, setTarget] = useState<ChatTarget | null>(null)
  const [expanded, setExpanded] = useState(false)
  const seen = useRef<Map<string, string> | null>(null)
  const conversations = useQuery({
    queryKey: queryKeys.directConversations(),
    queryFn: listDirectMessages,
    enabled: me.data !== undefined,
    refetchInterval: 20_000,
  })
  const rows = conversations.data ?? []
  const unread = rows.reduce((count, row) => count + row.unread, 0)
  const refresh = useCallback(() => {
    void client.invalidateQueries({ queryKey: queryKeys.directConversations() })
  }, [client])
  const open = useCallback((next: ChatTarget) => {
    setTarget(next)
    setExpanded(true)
  }, [])
  const close = (): void => {
    setTarget(null)
    setExpanded(false)
  }

  useEffect(() => {
    if (conversations.data === undefined) return
    if (seen.current === null) {
      seen.current = new Map(rows.map((row) => [row.id, row.latest_id]))
      return
    }
    const newest = rows.find((row) => row.unread > 0 && row.latest_author_id !== me.data?.user.id
      && seen.current?.get(row.id) !== row.latest_id)
    for (const row of rows) seen.current.set(row.id, row.latest_id)
    if (target !== null || newest === undefined) return
    setTarget({ memberId: newest.member_id, memberName: newest.member_name,
      memberImage: newest.member_image, conversationId: newest.id })
    setExpanded(false)
  }, [conversations.data, me.data?.user.id, rows, target])

  const viewerId = me.data?.user.id
  return <CenterContext.Provider value={{ conversations: rows, unread, open }}>
    {children}
    {target !== null && viewerId !== undefined ? <div className="fixed right-[var(--person-card-padding)] bottom-[var(--person-card-padding)] z-[var(--direct-message-layer)]">
      <div hidden={!expanded}><Conversation key={target.memberId} active={expanded}
        conversationId={target.conversationId} folderId={target.folderId}
        memberId={target.memberId} memberName={target.memberName} memberImage={target.memberImage}
        viewerId={viewerId} onMinimize={() => setExpanded(false)} onClose={close} onChange={refresh} /></div>
      {!expanded ? <div className="flex items-center gap-[var(--space-inline)] rounded-[var(--radius-card)] border border-border bg-popover p-[var(--space-inline)] shadow-md">
          <button type="button" onClick={() => setExpanded(true)} aria-label={`Open conversation with ${target.memberName}${rows.some((row) => row.member_id === target.memberId && row.unread > 0) ? ', unread messages' : ''}`}
            className="flex min-w-0 items-center gap-[var(--space-inline)] rounded-md px-[var(--space-inline)] text-sm text-foreground hover:bg-accent">
            <PersonFace id={target.memberId} name={target.memberName} image={target.memberImage} />
            <span className="max-w-[var(--direct-message-name-width)] truncate font-section">{target.memberName}</span>
            {rows.some((row) => row.member_id === target.memberId && row.unread > 0) ?
              <span className="size-[var(--direct-message-dot)] rounded-full bg-primary" aria-hidden="true" /> :
              <MessageCircle className="size-[var(--icon-size-compact)] text-muted-foreground" aria-hidden="true" />}
          </button>
          <Button variant="ghost" size="icon-sm" aria-label={`Close conversation with ${target.memberName}`} onClick={close}>
            <X aria-hidden="true" />
          </Button>
        </div> : null}
    </div> : null}
  </CenterContext.Provider>
}
