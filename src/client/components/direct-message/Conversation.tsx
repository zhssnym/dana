import { useEffect, useId, useRef, useState } from 'react'

import type { DirectMessage } from '../../../shared/direct-messages.js'
import { markDirectMessagesRead, openDirectMessage, readDirectMessages, sendDirectMessage } from '../../api/direct-messages.js'
import { ApiError } from '../../api/http.js'
import { ArrowUp, LoaderCircle, LockKeyhole, MessageCircle, Minus, X } from '../../lib/icons.js'
import { PersonFace } from '../person-face.js'
import { Button } from '../ui/button.js'

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

export function Conversation({ active, conversationId, folderId, memberId, memberName, memberImage, viewerId, onMinimize, onClose, onChange }: {
  readonly active: boolean
  readonly conversationId?: string
  readonly folderId?: string
  readonly memberId: string
  readonly memberName: string
  readonly memberImage?: string | null
  readonly viewerId: string
  readonly onMinimize: () => void
  readonly onClose: () => void
  readonly onChange: () => void
}): React.JSX.Element {
  const [id, setId] = useState<string | null>(conversationId ?? null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const scroll = useRef<HTMLOListElement>(null)
  const lastMarked = useRef<string | null>(null)
  const inputId = useId()

  useEffect(() => {
    if (!active || conversationId !== undefined || folderId === undefined) return undefined
    let mounted = true
    void openDirectMessage(folderId, memberId).then(
      (conversation) => { if (mounted) setId(conversation.id) },
      (error: unknown) => { if (mounted) { setProblem(errorText(error)); setLoadFailed(true); setLoading(false) } },
    )
    return () => { mounted = false }
  }, [active, conversationId, folderId, memberId, retry])

  useEffect(() => {
    if (!active || id === null) return undefined
    let mounted = true
    const load = async (first: boolean): Promise<void> => {
      try {
        const page = await readDirectMessages(id)
        if (!mounted) return
        const atEnd = scroll.current === null || scroll.current.scrollHeight - scroll.current.scrollTop - scroll.current.clientHeight < 32
        setMessages((current) => merged(current, page.messages))
        const newest = page.messages.at(-1)
        if (newest !== undefined && newest.id !== lastMarked.current) {
          lastMarked.current = newest.id
          void markDirectMessagesRead(id, newest.id).then(onChange, () => { lastMarked.current = null })
        }
        if (first) { setHasMore(page.has_more); setLoadFailed(false); setLoading(false) }
        if (atEnd) requestAnimationFrame(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight }) })
      } catch (error) {
        if (mounted && first) { setProblem(errorText(error)); setLoadFailed(true); setLoading(false) }
      }
    }
    void load(true)
    const timer = window.setInterval(() => { void load(false) }, 5000)
    return () => { mounted = false; window.clearInterval(timer) }
  }, [active, id, retry, onChange])

  const tryAgain = (): void => {
    setProblem(null)
    setLoading(true)
    setLoadFailed(false)
    setRetry((current) => current + 1)
  }

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
    if (id === null || sending || loadFailed || draft.trim() === '') return
    const body = draft
    setSending(true)
    setProblem(null)
    try {
      const message = await sendDirectMessage(id, body)
      setMessages((current) => merged(current, [message]))
      onChange()
      setDraft((current) => current === body ? '' : current)
      requestAnimationFrame(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight }) })
    } catch { setProblem('The message could not send. Try again.') }
    finally { setSending(false) }
  }

  return <section aria-label={`Private message with ${memberName}`} className="flex h-[var(--direct-message-height)] max-h-[var(--direct-message-max-height)] w-[var(--direct-message-width)] max-w-[var(--direct-message-max-width)] flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-popover text-foreground shadow-md">
    <div className="flex shrink-0 items-center gap-[var(--person-card-padding)] border-b border-border px-[var(--person-card-padding)] py-[var(--space-inline)]">
      <PersonFace id={memberId} name={memberName} image={memberImage} className="size-[var(--row-height)] data-[size=sm]:size-[var(--row-height)]" />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-title">{memberName}</h2>
        <p className="flex items-center gap-[var(--space-row)] text-xs text-muted-foreground">
          <LockKeyhole className="size-[var(--icon-size-compact)]" strokeWidth={1.75} aria-hidden="true" /> Private message
        </p>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label="Minimize conversation" title="Minimize" className="text-muted-foreground hover:text-foreground" onClick={onMinimize}><Minus aria-hidden="true" /></Button>
      <Button variant="ghost" size="icon-sm" aria-label="Close conversation" title="Close" className="text-muted-foreground hover:text-foreground" onClick={onClose}><X aria-hidden="true" /></Button>
    </div>
    <ol ref={scroll} aria-label="Messages" className="min-h-0 flex-1 space-y-[var(--person-card-padding)] overflow-y-auto px-[var(--person-card-padding)] py-[var(--space-group)]">
      {hasMore ? <li className="text-center"><Button variant="ghost" size="sm" disabled={loadingEarlier} onClick={() => { void earlier() }}>{loadingEarlier ? 'Loading…' : 'Load earlier'}</Button></li> : null}
      {loading ? <li className="flex h-full items-center justify-center gap-[var(--space-inline)] text-sm text-muted-foreground"><LoaderCircle className="size-[var(--icon-size-compact)] animate-spin motion-reduce:animate-none" strokeWidth={1.75} aria-hidden="true" />Loading messages…</li>
        : loadFailed ? <li className="flex h-full flex-col items-center justify-center gap-[var(--space-inline)] text-center"><p role="alert" className="text-sm text-muted-foreground">{problem}</p><Button variant="ghost" size="sm" onClick={tryAgain}>Try again</Button></li>
          : messages.length === 0 ? <li className="flex h-full flex-col items-center justify-center gap-[var(--space-inline)] text-center">
            <span className="flex size-[var(--row-height)] items-center justify-center rounded-md bg-accent text-muted-foreground"><MessageCircle className="size-[var(--icon-size-compact)]" strokeWidth={1.75} aria-hidden="true" /></span>
            <p className="text-sm font-section text-foreground">No messages yet</p>
            <p className="text-xs text-muted-foreground">Send a private message to {memberName}.</p>
          </li> : null}
      {messages.map((message, index) => {
        const mine = message.author_id === viewerId
        const sentAt = new Date(message.created_at)
        const previous = messages[index - 1]
        const newDay = previous === undefined || new Date(previous.created_at).toDateString() !== sentAt.toDateString()
        return <li key={message.id} className="flex flex-col gap-[var(--person-card-padding)]">
          {newDay ? <time dateTime={message.created_at} className="self-center text-xs text-muted-foreground">{sentAt.toLocaleDateString([], { dateStyle: 'medium' })}</time> : null}
          <article aria-label={`${mine ? 'You' : memberName}, ${sentAt.toLocaleString()}`} className={`flex min-w-0 flex-col ${mine ? 'items-end' : 'items-start'}`}>
            <p className={`max-w-[var(--direct-message-bubble-width)] whitespace-pre-wrap break-words rounded-[var(--radius-card)] px-[var(--person-card-padding)] py-[var(--space-inline)] text-sm text-foreground ${mine ? 'bg-secondary' : 'border border-border bg-background'}`}>{message.body}</p>
            <time dateTime={message.created_at} className="mt-[var(--space-row)] text-xs text-muted-foreground">{sentAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
          </article>
        </li>
      })}
    </ol>
    <form className="shrink-0 border-t border-border p-[var(--person-card-padding)]" onSubmit={(event) => { event.preventDefault(); void send() }}>
      {problem === null || loadFailed ? null : <p role="alert" className="pb-[var(--space-inline)] text-sm text-destructive">{problem}</p>}
      <div className="flex items-end gap-[var(--space-row)] rounded-[var(--radius-card)] border border-input bg-background p-[var(--space-row)] focus-within:border-ring">
        <label htmlFor={inputId} className="sr-only">Message</label>
        <textarea id={inputId} value={draft} maxLength={4000} rows={2} placeholder={`Message ${memberName}`}
          disabled={loading || loadFailed}
          className="min-w-0 flex-1 resize-none bg-transparent p-[var(--space-inline)] text-sm text-foreground outline-none placeholder:text-quiet-foreground"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() }
          }} />
        <Button type="submit" variant="commit" size="icon" aria-label="Send message" title="Send message" className="rounded-full" disabled={id === null || sending || loading || loadFailed || draft.trim() === ''}>
          <ArrowUp className="size-[var(--icon-size-compact)]" strokeWidth={2} aria-hidden="true" />
        </Button>
      </div>
    </form>
  </section>
}
