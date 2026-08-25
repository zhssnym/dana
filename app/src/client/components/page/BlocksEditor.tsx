/*
The page's blocks (4.17), drawn and edited: sections, paragraphs, images,
and folder rows, with the insert affordance between blocks (9.6, 9.10).
Ported at S12 from the designer's `folder-page-v2.tsx` and `shelf-page.tsx`
block grammar; one component for both pages so a shelf's blocks behave
exactly like a folder's rather than nearly like them.

**Every edit is one PUT of the whole list** (7.16: the page is read whole
and written whole). The body is built from the last read: every kept block
carries the id and `updated_at` it was read with, which is 4.17's evidence,
edits change their block in place, inserts arrive without an id, and a block
left out is a deletion. Positions are the array renumbered. The 409 a stale
write earns is the caller's to surface; this component only builds honest
bodies.

**Position decides belonging** (DES-209): the blocks after a section fold
with it until the next section, so collapse is computed from order rather
than stored, and moving a section moves its span's meaning with it. The
collapse set itself is view state and stays here.

**What the two pages add is theirs.** A folder page hangs tasks and a
capture under each section (`sectionExtras`); a shelf renders its folder
rows (`folderRow`) and drops stored rows whose membership is gone. Neither
concern is this file's: it renders what it is handed at the position the
block holds.

**No pointer drag yet, deliberately.** RFC 0004 assigns the drag engines to
S11, and the sidebar drag moved there at the S9 close for exactly the
one-engine reason; blocks arrange today by where they are inserted, and the
grip arrives when the engine does. Recorded in SESSION-LOG's S12 row.
*/
import { useState } from 'react'
import type { ReactNode } from 'react'

import type { PageBlock, PageBlockWrite } from '../../../shared/pages.js'
import { AlignLeft, ChevronDown, Heading1, ImagePlus, X } from '../../lib/icons.js'
import { InlineInput, InlineTextarea } from '../ui/inline-field.js'
import { cn } from '../ui/utils.js'

/** A stored block, carried back with the evidence it was read with. */
function carry(block: PageBlock): PageBlockWrite {
  return {
    id: block.id,
    kind: block.kind,
    position: block.position,
    text: block.text,
    file_id: block.file_id,
    ref_folder_id: block.ref_folder_id,
    updated_at: block.updated_at,
  }
}

/** The whole list as a write body, positions renumbered. */
export function carryAll(blocks: readonly PageBlock[]): PageBlockWrite[] {
  return blocks.map((block, index) => ({ ...carry(block), position: index }))
}

/**
 * The quiet line between blocks (9.6: "an insert affordance between
 * blocks"). Invisible until hovered or focused, his design's manner.
 */
export function InsertLine({
  onSection,
  onParagraph,
  onImage,
}: {
  readonly onSection: () => void
  readonly onParagraph: () => void
  readonly onImage?: (() => void) | undefined
}): React.JSX.Element {
  return (
    /* The strip is its own height and its controls are centred inside it
       rather than laid out in flow: a 20px button row inside a 12px strip
       overhung the prose above it, which put controls on top of a
       sentence. */
    <div className="group/insert relative h-5" role="presentation">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border opacity-0 transition-opacity group-hover/insert:opacity-100 group-focus-within/insert:opacity-100" />
      <div className="absolute top-1/2 left-0 z-10 flex -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity group-hover/insert:opacity-100 group-focus-within/insert:opacity-100">
        <button
          type="button"
          onClick={onSection}
          className="flex h-5 items-center gap-1 rounded bg-card px-1.5 text-[11px] leading-4 text-muted-foreground ring-1 ring-border transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Heading1 className="size-3" strokeWidth={1.75} aria-hidden="true" />
          Section
        </button>
        <button
          type="button"
          onClick={onParagraph}
          className="flex h-5 items-center gap-1 rounded bg-card px-1.5 text-[11px] leading-4 text-muted-foreground ring-1 ring-border transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AlignLeft className="size-3" strokeWidth={1.75} aria-hidden="true" />
          Paragraph
        </button>
        {onImage === undefined ? null : (
          <button
            type="button"
            onClick={onImage}
            className="flex h-5 items-center gap-1 rounded bg-card px-1.5 text-[11px] leading-4 text-muted-foreground ring-1 ring-border transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ImagePlus className="size-3" strokeWidth={1.75} aria-hidden="true" />
            Image
          </button>
        )}
      </div>
    </div>
  )
}

export function BlocksEditor({
  blocks,
  onPut,
  sectionExtras,
  folderRow,
  onInsertImage,
  writeOf,
}: {
  /** The last read, whole; the evidence every write carries back. */
  readonly blocks: readonly PageBlock[]
  readonly onPut: (body: PageBlockWrite[]) => void
  /** A folder page's tasks-and-capture under each section, by block id. */
  readonly sectionExtras?: (sectionBlockId: string) => ReactNode
  /** A shelf page's folder row; null drops the block from the render (a
      stored row whose membership is gone, DES-219). */
  readonly folderRow?: (block: PageBlock) => ReactNode
  /** Asked for a file id when an image is inserted at an index; absent
      hides the image button (a shelf page has no folder to upload into). */
  readonly onInsertImage?: ((index: number) => void) | undefined
  /** How a rendered block becomes a write. The default carries id and
      evidence; a shelf overrides it for its render-only folder rows, which
      must arrive as inserts rather than as edits of ids that never were. */
  readonly writeOf?: (block: PageBlock) => PageBlockWrite
}): React.JSX.Element {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())

  const all = (): PageBlockWrite[] =>
    blocks.map((block, index) => ({ ...(writeOf ?? carry)(block), position: index }))

  function insertAt(index: number, block: PageBlockWrite): void {
    const body = all()
    body.splice(Math.min(index, body.length), 0, block)
    onPut(body.map((entry, position) => ({ ...entry, position })))
  }

  function editText(id: string, text: string): void {
    const body = blocks.map((block, index) => ({
      ...(writeOf ?? carry)(block),
      position: index,
      ...(block.id === id ? { text } : {}),
    }))
    onPut(body)
  }

  function remove(id: string): void {
    onPut(
      blocks
        .filter((block) => block.id !== id)
        .map((block, position) => ({ ...(writeOf ?? carry)(block), position })),
    )
  }

  function toggle(id: string): void {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const inserters = (index: number): React.JSX.Element => (
    <InsertLine
      onSection={() => {
        insertAt(index, { kind: 'section', position: index, text: 'New section' })
      }}
      onParagraph={() => {
        insertAt(index, { kind: 'paragraph', position: index, text: '' })
      }}
      onImage={
        onInsertImage === undefined
          ? undefined
          : () => {
              onInsertImage(index)
            }
      }
    />
  )

  return (
    <div>
      {inserters(0)}
      {blocks.map((block, index) => {
        /* Position decides belonging: a block folds with the nearest section
           above it (DES-209). */
        const owner = blocks
          .slice(0, index)
          .reverse()
          .find((earlier) => earlier.kind === 'section')
        if (
          owner !== undefined &&
          collapsed.has(owner.id) &&
          block.kind !== 'section'
        ) {
          return null
        }

        if (block.kind === 'folder_ref') {
          const row = folderRow?.(block)
          if (row === undefined || row === null) return null
          return (
            <div key={block.id} className="group/item relative">
              {row}
              {inserters(index + 1)}
            </div>
          )
        }

        return (
          <div key={block.id} className="group/item relative">
            {block.kind === 'section' ? (
              <div className="flex items-center gap-1.5 pt-3">
                <button
                  type="button"
                  aria-label={`${collapsed.has(block.id) ? 'Expand' : 'Collapse'} section ${block.text ?? ''}`}
                  aria-expanded={!collapsed.has(block.id)}
                  onClick={() => {
                    toggle(block.id)
                  }}
                  className="text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronDown
                    className={cn(
                      'size-4 transition-transform',
                      collapsed.has(block.id) && '-rotate-90',
                    )}
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                </button>
                <InlineInput
                  key={`${block.id}-${block.text ?? ''}`}
                  defaultValue={block.text ?? ''}
                  aria-label="Section name"
                  maxLength={120}
                  onBlur={(event) => {
                    const next = event.target.value.trim()
                    if (next !== '' && next !== block.text) editText(block.id, next)
                    else event.target.value = block.text ?? ''
                  }}
                  className="text-[16px] leading-6 font-semibold text-foreground"
                />
                <button
                  type="button"
                  aria-label={`Delete section ${block.text ?? ''}`}
                  onClick={() => {
                    remove(block.id)
                  }}
                  className="opacity-0 transition-opacity outline-none group-hover/item:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
            ) : block.kind === 'image' ? (
              <figure className="pt-2">
                {block.file_id === null ? null : (
                  <img
                    src={`/api/v1/files/${block.file_id}`}
                    alt={block.text ?? ''}
                    className="max-h-96 w-full rounded-lg object-cover"
                  />
                )}
                <figcaption className="mt-1 flex items-center gap-2">
                  <InlineInput
                    key={`${block.id}-${block.text ?? ''}`}
                    defaultValue={block.text ?? ''}
                    placeholder="Add a caption"
                    aria-label="Image caption"
                    onBlur={(event) => {
                      const next = event.target.value.trim()
                      if (next !== (block.text ?? '')) {
                        editText(block.id, next)
                      }
                    }}
                    className="text-[12px] leading-4 text-muted-foreground"
                  />
                  <button
                    type="button"
                    aria-label="Remove image"
                    onClick={() => {
                      remove(block.id)
                    }}
                    className="opacity-0 transition-opacity outline-none group-hover/item:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </figcaption>
              </figure>
            ) : (
              /* A paragraph; committing an empty one removes it, his rule. */
              <InlineTextarea
                key={`${block.id}-${block.text ?? ''}`}
                defaultValue={block.text ?? ''}
                placeholder="Write something…"
                aria-label="Paragraph"
                rows={1}
                onBlur={(event) => {
                  const next = event.target.value.trim()
                  if (next === (block.text ?? '')) return
                  if (next === '') remove(block.id)
                  else editText(block.id, next)
                }}
                className="text-[13px] leading-5 text-muted-foreground"
              />
            )}
            {block.kind === 'section' && !collapsed.has(block.id)
              ? sectionExtras?.(block.id)
              : null}
            {inserters(index + 1)}
          </div>
        )
      })}
    </div>
  )
}
