/*
The content kept on a Linear step: its notes, images and links, drawn as rows
on the step's line. Each row carries the caller's line segment first, a mark
centred on the line in the gutter, then the content. Full mode shows every
block and lets notes be edited in place; compact and latest are one line each.
*/
import { useLayoutEffect, useRef, useState } from 'react'
import type React from 'react'
import { cn } from '../../components/ui/utils.js'
import { Image as ImageIcon, Link2 as LinkIcon } from '../../lib/icons.js'
import type { PageBlock } from '../../../shared/pages.js'

const TEXT_KINDS: ReadonlySet<string> = new Set([
  'paragraph', 'heading1', 'heading2', 'heading3', 'bullet', 'numbered',
  'checklist', 'toggle', 'quote', 'callout', 'code',
])
const MEDIA_KINDS: ReadonlySet<string> = new Set(['image', 'file', 'audio', 'video'])

function linkOf(block: PageBlock): { href: string; text: string } | null {
  if (block.kind !== 'paragraph') return null
  const run = block.rich_content?.runs.find((r) => r.href !== undefined)
  if (run?.href === undefined) return null
  return { href: run.href, text: block.text ?? run.text }
}

export function contentMark(block: PageBlock): 'note' | 'image' | 'link' {
  if (MEDIA_KINDS.has(block.kind)) return 'image'
  if (linkOf(block) !== null) return 'link'
  return 'note'
}

function Mark({ kind, inCard }: { kind: 'note' | 'image' | 'link'; inCard: boolean }) {
  return (
    <span
      aria-hidden
      className={cn('flex shrink-0 items-start justify-center pt-2 text-quiet-foreground', inCard ? 'w-4' : 'w-6')}
    >
      {kind === 'note' ? (
        <span className="mt-1 block size-1.5 rounded-full bg-quiet-foreground" />
      ) : kind === 'image' ? (
        <ImageIcon className="size-3" />
      ) : (
        <LinkIcon className="size-3" />
      )}
    </span>
  )
}

function RemoveButton({ onRemove }: { onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="hidden h-6 shrink-0 items-center rounded-sm px-2 text-xs text-muted-foreground hover:bg-muted group-hover/content:inline-flex group-focus-within/content:inline-flex [@media(hover:none)]:inline-flex"
    >
      Remove
    </button>
  )
}

function EditableText({
  text,
  onSave,
}: {
  text: string
  onSave: (text: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const ref = useRef<HTMLTextAreaElement>(null)
  const reverting = useRef(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft, editing])

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(text)
          setEditing(true)
        }}
        className="min-w-0 flex-1 cursor-text whitespace-pre-wrap break-words py-1 text-left text-sm text-foreground"
      >
        {text}
      </button>
    )
  }

  const commit = () => {
    setEditing(false)
    if (reverting.current) {
      reverting.current = false
      setDraft(text)
      return
    }
    const next = draft.trim()
    if (next !== text) onSave(next)
  }

  return (
    <textarea
      ref={ref}
      autoFocus
      rows={1}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          reverting.current = true
          e.currentTarget.blur()
        }
      }}
      className="min-w-0 flex-1 resize-none overflow-hidden border-0 bg-transparent p-0 py-1 text-sm text-foreground outline-none"
    />
  )
}

export function LineContent(props: {
  readonly blocks: readonly PageBlock[]
  readonly line: React.ReactNode
  readonly mode: 'full' | 'compact' | 'latest'
  readonly editable: boolean
  readonly onEditText?: (id: string, text: string) => void
  readonly onRemove?: (id: string) => void
  readonly inCard?: boolean
}): React.JSX.Element | null {
  const { mode, editable, onEditText, onRemove, inCard = false } = props
  const full = mode === 'full'

  let blocks = props.blocks.filter(
    (b) => TEXT_KINDS.has(b.kind) || MEDIA_KINDS.has(b.kind) || (b.text ?? '').trim() !== '',
  )
  if (mode === 'latest') {
    const last = [...blocks].reverse().find((b) => TEXT_KINDS.has(b.kind) && (b.text ?? '') !== '')
    blocks = last ? [last] : []
  }
  if (blocks.length === 0) return null

  const tone = full ? 'text-foreground' : 'text-muted-foreground'
  const canEdit = full && editable

  return (
    <ul role="list">
      {blocks.map((block) => {
        const mark = contentMark(block)
        const link = linkOf(block)
        const known = TEXT_KINDS.has(block.kind) || MEDIA_KINDS.has(block.kind)
        let body: React.ReactNode

        if (MEDIA_KINDS.has(block.kind)) {
          body =
            block.kind === 'image' && block.file_id ? (
              <img
                src={`/api/v1/files/${block.file_id}`}
                alt={block.file_name ?? ''}
                className={cn('my-1 rounded-md object-cover', full ? 'max-h-40 max-w-60' : 'max-h-16')}
              />
            ) : (
              <span className={cn('min-w-0 truncate py-1 text-sm', tone)}>{block.file_name ?? 'File'}</span>
            )
        } else if (link) {
          body = (
            <a
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className={cn('min-w-0 py-1 text-sm text-primary', !full && 'truncate')}
            >
              {link.text}
            </a>
          )
        } else if (canEdit && known && onEditText) {
          body = (
            <EditableText
              text={block.text ?? ''}
              onSave={(text) => {
                if (text === '') onRemove?.(block.id)
                else onEditText(block.id, text)
              }}
            />
          )
        } else {
          body = (
            <span
              className={cn(
                'min-w-0 py-1 text-sm',
                known ? tone : 'text-quiet-foreground',
                full ? 'whitespace-pre-wrap break-words' : 'truncate',
              )}
            >
              {block.text}
            </span>
          )
        }

        const removable = canEdit && onRemove && (mark === 'image' || mark === 'link')

        return (
          <li
            key={block.id}
            className={cn('group/content relative flex min-h-7', inCard ? 'gap-1' : 'gap-2')}
          >
            {inCard ? null : props.line}
            <Mark kind={mark} inCard={inCard} />
            <div className={cn('flex min-w-0 flex-1 items-start gap-2', !inCard && 'px-1.5')}>
              {body}
              {removable ? <RemoveButton onRemove={() => onRemove(block.id)} /> : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
