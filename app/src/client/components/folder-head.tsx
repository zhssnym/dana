// The folder header: mark, name and project controls, all edited in place. A viewer
// below Can edit gets the same rows with nothing pressable.
import { useRef, useState } from 'react'
import { useLocation, useMatch } from 'react-router'

import { useFolder } from '../api/queries.js'
import type { LucideIcon } from '../lib/icons.js'
import {
  coverPhotoPicker,
  coverTiersFor,
  coverUploader,
  savePageIdentity,
  usePageIdentity,
} from '../lib/page-identity.js'
import { FolderCoverPicker } from './folder-cover.js'
import { AddCoverAction } from './page-cover.js'
import { T_FAST } from './task-row.js'
import { IconPicker } from './page/IconPicker.js'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog.js'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.js'
import { cn } from './ui/utils.js'

const FIELD = 'min-w-0 rounded-md bg-transparent outline-none'

export function FolderHeader({
  name,
  icon: Icon,
  color,
  iconKey,
  colorKey,
  editable,
  renaming,
  onRenamingChange,
  onRename,
  onPickIdentity,
  onRemoveIcon,
  actions,
  coverKey,
}: {
  readonly name: string
  readonly icon: LucideIcon
  readonly color: string
  readonly iconKey: string | null
  readonly colorKey: string | null
  readonly editable: boolean
  readonly renaming: boolean
  readonly onRenamingChange: (next: boolean) => void
  readonly onRename: (next: string) => void
  readonly onPickIdentity: (next: { icon?: string; color?: string }) => void
  /** Without it the picker offers no Remove. */
  readonly onRemoveIcon?: () => void
  readonly actions: React.ReactNode
  /** With it, an editor gets "Add cover". */
  readonly coverKey?: string
}): React.JSX.Element {
  const [markOpen, setMarkOpen] = useState(false)
  // Where the heading click landed, so the field opens with the caret there; null selects all.
  const caretAt = useRef<number | null>(null)
  const routeId = useMatch('/app/folders/:id')?.params.id ?? null
  const routePage = useFolder(routeId ?? '', routeId !== null).data
  const location = useLocation()
  const query = new URLSearchParams(location.search)
  const discussionAsked = query.has('discussion') || query.get('conversation') === 'open'
  const fullScreenDiscussion =
    routePage !== undefined &&
    !routePage.is_default &&
    (routePage.kind === 'discussion' || discussionAsked)

  const glyph = (
    <Icon className="size-7" style={{ color }} strokeWidth={1.5} aria-hidden="true" />
  )
  return (
    <header className="group/head space-y-1 pt-2">
      {editable && coverKey !== undefined ? (
        <div
          className={cn(
            'opacity-0 transition-opacity group-hover/head:opacity-100 group-focus-within/head:opacity-100',
            T_FAST,
          )}
        >
          <AddCoverAction storageName={coverKey} />
        </div>
      ) : null}
      <div className="flex min-w-0 items-start gap-2">
        {editable ? (
          <Popover open={markOpen} onOpenChange={setMarkOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label={`Icon and colour for ${name}`}
                  className="mt-1 flex size-[var(--control-height)] shrink-0 items-center justify-center rounded-md hover:bg-accent"
                />
              }
            >
              {glyph}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <IconPicker
                icon={iconKey}
                color={colorKey}
                onPick={onPickIdentity}
                {...(onRemoveIcon === undefined ? {} : { onRemove: () => { onRemoveIcon(); setMarkOpen(false) } })}
              />
            </PopoverContent>
          </Popover>
        ) : (
          <span className="mt-1 flex size-[var(--control-height)] shrink-0 items-center justify-center">{glyph}</span>
        )}
        {editable && renaming ? (
          // A textarea sized to its content, so a long name wraps while edited.
          <textarea
            key={name}
            defaultValue={name}
            data-page-title={name}
            aria-label="Page name"
            maxLength={100}
            rows={1}
            autoFocus
            data-focus="self"
            onFocus={(event) => {
              const at = caretAt.current
              caretAt.current = null
              if (at === null) event.currentTarget.select()
              else event.currentTarget.setSelectionRange(at, at)
            }}
            onBlur={(event) => {
              const next = event.target.value.replace(/\s+/g, ' ').trim()
              onRenamingChange(false)
              if (next !== '' && next !== name) onRename(next)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault()
                const header = event.currentTarget.closest('header')
                event.currentTarget.blur()
                // Enter in the title continues in the body.
                if (header !== null) focusBodyAfter(header)
              }
              if (event.key === 'Escape') {
                event.currentTarget.value = name
                event.currentTarget.blur()
              }
            }}
            className={cn(
              FIELD,
              'flex-1 resize-none overflow-hidden [field-sizing:content] break-words text-[length:var(--text-title-size)] leading-[var(--text-title-line)] font-title text-foreground',
            )}
          />
        ) : (
          <h1
            data-page-title=""
            onClick={
              editable
                ? (event) => {
                    caretAt.current = caretOffset(event.currentTarget, event.clientX, event.clientY)
                    onRenamingChange(true)
                  }
                : undefined
            }
            className={cn(
              'min-w-0 flex-1 break-words [overflow-wrap:anywhere] text-[length:var(--text-title-size)] leading-[var(--text-title-line)] font-title text-foreground',
              editable ? 'cursor-text' : '',
            )}
          >
            {name}
          </h1>
        )}
        <div className="mt-1 flex shrink-0 items-center gap-1">
          {/* Hide the Discussion trigger while its full-screen view is already on screen. */}
          <div className={cn('contents', fullScreenDiscussion && '[&>button[aria-pressed]]:hidden')}>
            {actions}
          </div>
        </div>
      </div>
    </header>
  )
}

function caretOffset(heading: HTMLElement, x: number, y: number): number {
  const length = heading.textContent?.length ?? 0
  let node: Node | null = null
  let offset = length
  if (typeof document.caretPositionFromPoint === 'function') {
    const position = document.caretPositionFromPoint(x, y)
    node = position?.offsetNode ?? null
    offset = position?.offset ?? length
  } else if (typeof document.caretRangeFromPoint === 'function') {
    const range = document.caretRangeFromPoint(x, y)
    node = range?.startContainer ?? null
    offset = range?.startOffset ?? length
  }
  if (node === null || !heading.contains(node)) return length
  return Math.min(offset, length)
}

// Nothing editable below (another tab, a viewer) leaves focus alone.
function focusBodyAfter(header: HTMLElement): void {
  requestAnimationFrame(() => {
    for (const node of document.querySelectorAll<HTMLElement>('[contenteditable="true"]')) {
      if (!(header.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) continue
      if (node.closest('[role="dialog"]') !== null) continue
      node.focus({ preventScroll: true })
      const selection = window.getSelection()
      const first = node.querySelector('[contenteditable="true"] *, p, h1, h2, h3, li') ?? node
      if (selection !== null) {
        const range = document.createRange()
        range.setStart(first, 0)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
      }
      return
    }
  })
}

/** The cover picker for the sidebar's `?folder-action=cover` link: images only. */
export function FolderCoverDialog({
  storageName,
  open,
  onOpenChange,
}: {
  readonly storageName: string
  readonly open: boolean
  readonly onOpenChange: (next: boolean) => void
}): React.JSX.Element {
  const identity = usePageIdentity(storageName)
  const upload = coverUploader(storageName)
  const pickPhoto = coverPhotoPicker(storageName)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-auto max-w-[calc(100vw-2rem)] p-0">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>Cover</DialogTitle>
        </DialogHeader>
        <FolderCoverPicker
          value={identity.cover}
          folderName={storageName}
          tiers={coverTiersFor(storageName).filter((tier) => tier !== 'gallery')}
          {...(upload === undefined
            ? {}
            : { onUpload: (file: File) => { upload(file); onOpenChange(false) } })}
          {...(pickPhoto === undefined
            ? {}
            : { onPickPhoto: (id: string) => { pickPhoto(id); onOpenChange(false) } })}
          onPick={(key) => {
            savePageIdentity(storageName, { cover: key, coverPos: 50 })
            onOpenChange(false)
          }}
          onRemove={() => {
            savePageIdentity(storageName, { cover: undefined })
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
