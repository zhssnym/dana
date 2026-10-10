// Operators' feedback board: one column per status. Drag a card to another column to move it.
import { useRef, useState } from 'react'

import { postPlainText } from '../../../shared/comments.js'
import { FEEDBACK_STATUSES } from '../../../shared/feedback.js'
import type { FeedbackItem, FeedbackStatus } from '../../../shared/feedback.js'
import { useFeedback, useSetFeedbackStatus } from '../../api/feedback.js'
import { swallowNextClick, useSortableList } from '../../lib/use-sortable-list.js'
import { InlineError, SkeletonList } from '../state-patterns.js'
import { PostView } from '../thread/PostView.js'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog.js'
import { Segmented } from '../ui/segmented.js'
import { cn } from '../ui/utils.js'

const STATUS_WORD: Record<FeedbackStatus, string> = { new: 'New', doing: 'In progress', done: 'Done', wont: 'Will not do' }
const KIND_WORD = { bug: 'Problem', idea: 'Idea', other: 'Other' } as const

const when = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

type Zones = Map<FeedbackStatus, HTMLElement>

function columnAt(zones: Zones, point: { x: number, y: number }): FeedbackStatus | null {
  for (const [status, node] of zones) {
    const box = node.getBoundingClientRect()
    if (point.x >= box.left && point.x <= box.right) return status
  }
  return null
}

/** Every card is the same size: the first line is the title, the next lines a short preview. */
function Card({ item }: { readonly item: FeedbackItem }): React.JSX.Element {
  const [title = '', ...rest] = postPlainText(item.content).split('\n')
  return (
    <div className="flex h-36 flex-col gap-1 rounded-(--radius-card) border border-border bg-background p-3 text-sm hover:border-quiet-foreground">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{KIND_WORD[item.kind]}</span>
        <span className="tabular-nums">{when(item.created_at)}</span>
      </div>
      <p className="line-clamp-2 break-words font-section text-foreground">{title === '' ? 'Files only' : title}</p>
      <p className="line-clamp-1 break-words text-muted-foreground">{rest.join(' ')}</p>
      <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{item.display_name ?? item.email ?? 'No name'}</span>
        {item.files.length > 0 ? <span className="shrink-0 tabular-nums">{item.files.length} {item.files.length === 1 ? 'file' : 'files'}</span> : null}
      </div>
    </div>
  )
}

function Column({ status, items, zones, over, onOver, onMove, onOpen }: {
  readonly status: FeedbackStatus
  readonly items: readonly FeedbackItem[]
  readonly zones: React.RefObject<Zones>
  readonly over: FeedbackStatus | null
  readonly onOver: (status: FeedbackStatus | null) => void
  readonly onMove: (item: FeedbackItem, status: FeedbackStatus) => void
  readonly onOpen: (item: FeedbackItem) => void
}): React.JSX.Element {
  const drag = useSortableList({
    count: items.length,
    followAcross: true,
    crossAxis: true,
    onLift: swallowNextClick,
    describe: (index) => postPlainText(items[index]!.content).slice(0, 60) || 'Feedback',
    // Order inside a column is always newest first, so a drop there changes nothing.
    onReorder: () => undefined,
    onOver: (_from, point) => {
      const landing = columnAt(zones.current, point)
      const target = landing === status ? null : landing
      onOver(target)
      return target
    },
    onDropAt: (from, point) => {
      onOver(null)
      const landing = columnAt(zones.current, point)
      const item = items[from]
      if (landing !== null && landing !== status && item !== undefined) onMove(item, landing)
      return true
    },
  })

  return (
    <section
      aria-label={STATUS_WORD[status]}
      ref={(node) => {
        if (node) zones.current.set(status, node)
        else zones.current.delete(status)
      }}
      className={cn('flex min-h-40 flex-col gap-2 rounded-(--radius-card) bg-muted p-2 transition-colors',
        over === status && 'bg-hover')}
    >
      <div className="flex h-7 items-center gap-2 px-1">
        <h2 className="text-sm font-section text-foreground">{STATUS_WORD[status]}</h2>
        <span className="ml-auto text-xs text-quiet-foreground tabular-nums">{items.length}</span>
      </div>
      {items.map((item, index) => {
        const state = drag.itemState(index)
        const moving = state.isActive || state.offset !== 0 || state.crossOffset !== 0
        return (
          <div
            key={item.id}
            ref={drag.setItemRef(index)}
            role="button"
            tabIndex={0}
            aria-label={`Open feedback from ${item.display_name ?? item.email ?? 'someone'}`}
            {...drag.surfaceProps(index, () => onOpen(item))}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(item) } }}
            className="cursor-grab touch-none rounded-(--radius-card) outline-none select-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
            style={{
              transform: moving ? `translate3d(${String(state.crossOffset)}px, ${String(state.offset)}px, 0)` : undefined,
              transition: state.isActive && !state.isSettling ? 'none' : 'transform var(--duration-base) var(--ease-enter)',
              zIndex: state.isActive ? 20 : undefined,
              position: 'relative',
              boxShadow: state.isActive ? 'var(--elevation-2)' : undefined,
              rotate: state.isActive ? '1.5deg' : undefined,
            }}
          >
            <Card item={item} />
          </div>
        )
      })}
      <span className="sr-only" aria-live="polite">{drag.announcement}</span>
    </section>
  )
}

export function FeedbackBoard(): React.JSX.Element {
  const feedback = useFeedback()
  const setStatus = useSetFeedbackStatus()
  const zones = useRef<Zones>(new Map())
  const [over, setOver] = useState<FeedbackStatus | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  if (feedback.isPending) return <SkeletonList />
  if (feedback.isError) return <InlineError onRetry={() => { void feedback.refetch() }} />
  const items = feedback.data.items
  const open = items.find((item) => item.id === openId)

  return (
    <>
      <div className="grid items-start gap-3 px-2 sm:grid-cols-2 lg:grid-cols-4">
        {FEEDBACK_STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            items={items.filter((item) => item.status === status)}
            zones={zones}
            over={over}
            onOver={(next) => { if (next !== over) setOver(next) }}
            onMove={(item, next) => setStatus.mutate({ id: item.id, status: next })}
            onOpen={(item) => setOpenId(item.id)}
          />
        ))}
      </div>
      <Dialog open={open !== undefined} onOpenChange={(next) => { if (!next) setOpenId(null) }}>
        {open === undefined ? null : (
          <DialogContent className="max-h-[85vh] w-[min(720px,calc(100vw-32px))] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{KIND_WORD[open.kind]} from {open.display_name ?? open.email ?? 'someone'}</DialogTitle>
              <DialogDescription>
                {open.email ?? 'No email'} · {new Date(open.created_at).toLocaleString()}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 flex flex-col gap-4">
              <Segmented
                label="Status"
                value={open.status}
                options={FEEDBACK_STATUSES.map((status) => ({ value: status, label: STATUS_WORD[status] }))}
                onValueChange={(status) => setStatus.mutate({ id: open.id, status })}
                className="self-start"
              />
              <PostView content={open.content} body={null} files={open.files} />
              <p className="text-xs break-all text-muted-foreground">
                {open.context.path} · {open.context.viewport} · {open.context.theme} · {open.context.user_agent}
              </p>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}
