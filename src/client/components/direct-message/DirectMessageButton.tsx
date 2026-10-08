import { useEffect, useId, useRef, useState } from 'react'

import type { DirectMessage } from '../../../shared/direct-messages.js'
import { openDirectMessage, readDirectMessages, sendDirectMessage } from '../../api/direct-messages.js'
import { ApiError } from '../../api/http.js'
import { useMe } from '../../api/queries.js'
import { X } from '../../lib/icons.js'
import { Button } from '../ui/button.js'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '../ui/dialog.js'

function merged(current: readonly DirectMessage[], incoming: readonly DirectMessage[]): DirectMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) byId.set(message.id, message)
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}

function errorText(error: unknown): string {
  return error instanceof ApiError && error.status === 404
    ? 'This person is no longer available on this Team.'
    : 'The conversation could not load. Try again.'
}

function Conversation({ folderId, memberId, memberName, viewerId }: {
  readonly folderId: string
  readonly memberId: string
  readonly memberName: string
  readonly viewerId: string
}): React.JSX.Element {
  const [id, setId] = useState<string | null>(null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const scroll = useRef<HTMLOListElement>(null)
  const inputId = useId()

  useEffect(() => {
    let active = true
    void openDirectMessage(folderId, memberId).then(
      (conversation) => { if (active) setId(conversation.id) },
      (error: unknown) => { if (active) { setProblem(errorText(error)); setLoading(false) } },
    )
    return () => { active = false }
  }, [folderId, memberId])

  useEffect(() => {
    if (id === null) return undefined
    let active = true
    const load = async (first: boolean): Promise<void> => {
      try {
        const page = await readDirectMessages(id)
        if (!active) return
        const atEnd = scroll.current === null || scroll.current.scrollHeight - scroll.current.scrollTop - scroll.current.clientHeight < 32
        setMessages((current) => merged(current, page.messages))
        if (first) { setHasMore(page.has_more); setLoading(false) }
        if (atEnd) requestAnimationFrame(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight }) })
      } catch (error) {
        if (active && first) { setProblem(errorText(error)); setLoading(false) }
      }
    }
    void load(true)
    const timer = window.setInterval(() => { void load(false) }, 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [id])

  const earlier = async (): Promise<void> => {
    const oldest = messages[0]
    if (id === null || oldest === undefined || loadingEarlier) return
    setLoadingEarlier(true)
    const oldHeight = scroll.current?.scrollHeight ?? 0
    try {
      const page = await readDirectMessages(id, oldest.id)
      setMessages((current) => merged(current, page.messages))
      setHasMore(page.has_more)
      requestAnimationFrame(() => { if (scroll.current) scroll.current.scrollTop += scroll.current.scrollHeight - oldHeight })
    } catch (error) { setProblem(errorText(error)) }
    finally { setLoadingEarlier(false) }
  }

  const send = async (): Promise<void> => {
    if (id === null || sending || draft.trim() === '') return
    const body = draft
    setSending(true)
    setProblem(null)
    try {
      const message = await sendDirectMessage(id, body)
      setMessages((current) => merged(current, [message]))
      setDraft((current) => current === body ? '' : current)
      requestAnimationFrame(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight }) })
    } catch { setProblem('The message could not send. Try again.') }
    finally { setSending(false) }
  }

  return <DialogContent className="flex h-[var(--direct-message-height)] max-h-[var(--direct-message-max-height)] flex-col gap-0 p-0 shadow-none">
    <DialogHeader className="flex flex-row items-center border-b border-border p-[var(--space-inline)]">
      <DialogTitle className="min-w-0 flex-1 truncate">DM {memberName}</DialogTitle>
      <DialogDescription className="sr-only">Private conversation with {memberName}</DialogDescription>
      <DialogClose render={<Button variant="ghost" size="icon-sm" aria-label="Close conversation"><X aria-hidden="true" /></Button>} />
    </DialogHeader>
    <ol ref={scroll} aria-label="Messages" className="min-h-0 flex-1 overflow-y-auto p-[var(--space-inline)]">
      {hasMore ? <li className="text-center"><Button variant="ghost" size="sm" disabled={loadingEarlier} onClick={() => { void earlier() }}>{loadingEarlier ? 'Loading…' : 'Load earlier'}</Button></li> : null}
      {loading ? <li className="text-sm text-muted-foreground">Loading messages…</li>
        : messages.length === 0 && problem === null ? <li className="text-sm text-muted-foreground">Start a private conversation.</li> : null}
      {messages.map((message) => <li key={message.id} className="border-b border-border py-[var(--space-inline)] last:border-b-0">
        <div className="flex items-baseline gap-[var(--space-inline)]">
          <span className="text-xs font-medium text-foreground">{message.author_id === viewerId ? 'You' : memberName}</span>
          <time dateTime={message.created_at} className="text-xs text-muted-foreground">{new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">{message.body}</p>
      </li>)}
    </ol>
    <form className="border-t border-border p-[var(--space-inline)]" onSubmit={(event) => { event.preventDefault(); void send() }}>
      {problem === null ? null : <p role="alert" className="pb-[var(--space-inline)] text-sm text-destructive">{problem}</p>}
      <label htmlFor={inputId} className="sr-only">Message</label>
      <textarea id={inputId} value={draft} maxLength={4000} rows={2} placeholder={`Message ${memberName}`}
        className="w-full resize-none rounded-md border border-input bg-background p-[var(--space-inline)] text-sm text-foreground outline-none focus-visible:border-ring"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() }
        }} />
      <div className="flex justify-end pt-[var(--space-inline)]"><Button variant="commit" disabled={id === null || sending || draft.trim() === ''}>Send</Button></div>
    </form>
  </DialogContent>
}

export function DirectMessageButton({ folderId, memberId, memberName }: {
  readonly folderId: string
  readonly memberId: string
  readonly memberName: string
}): React.JSX.Element | null {
  const me = useMe()
  const [open, setOpen] = useState(false)
  if (me.data === undefined || me.data.user.id === memberId) return null
  return <Dialog open={open} onOpenChange={setOpen}>
    <Button variant="ghost" size="sm" aria-label={`DM ${memberName}`} onClick={() => setOpen(true)}>DM</Button>
    {open ? <Conversation folderId={folderId} memberId={memberId} memberName={memberName} viewerId={me.data.user.id} /> : null}
  </Dialog>
}
