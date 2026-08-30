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
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import type { PageBlock, PageBlockWrite } from '../../../shared/pages.js'
import { AlignLeft, ChevronDown, Heading1, ImagePlus, X } from '../../lib/icons.js'
import { InlineInput, InlineTextarea } from '../ui/inline-field.js'
import { PageImage } from '../page-image.js'
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
    /* 4.17's width, S22a's column and item 44's B7. It was dropped here until
       S26, which is a write that quietly unsets whatever somebody dragged. */
    width_pct: block.width_pct,
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
  folderId,
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
  /*
  Which folder an image on this page is uploaded into (7.15), absent on a
  shelf page, which has no folder to upload into and therefore draws no image
  control.

  **It replaced `onInsertImage` at S26 and the change is the block's, not this
  prop's.** That callback asked the page for a file *before* the block existed,
  because the block this file drew could only render one that already had a
  picture: the page opened a hidden file input, uploaded, and inserted a filled
  block. The lifted `components/page-image.tsx` is the other way round, and it
  is the way ledger L-197 asks for, "three ways in, because people reach for
  different ones: choose, drop, or paste". An empty block is inserted and the
  block itself is the dropzone, so all three gestures land in one place instead
  of one of them landing on the page and the other two nowhere.
  */
  readonly folderId?: string | undefined
  /** How a rendered block becomes a write. The default carries id and
      evidence; a shelf overrides it for its render-only folder rows, which
      must arrive as inserts rather than as edits of ids that never were. */
  readonly writeOf?: (block: PageBlock) => PageBlockWrite
}): React.JSX.Element {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  /** The one block being written, if any; everything else reads as prose. */
  const [editing, setEditing] = useState<string | null>(null)

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

  /* A block just inserted has nothing in it yet, so it opens as a field
     rather than as empty prose somebody has to find and click. The id is
     known only after the write lands, so the intent is recorded and the
     effect below claims it once the block appears. */
  const [claimNewest, setClaimNewest] = useState<'section' | 'paragraph' | null>(
    null,
  )
  useEffect(() => {
    if (claimNewest === null) return
    const fresh = blocks.find(
      (block) =>
        block.kind === claimNewest &&
        (claimNewest === 'paragraph'
          ? block.text === null || block.text === ''
          : block.text === 'New section'),
    )
    if (fresh !== undefined) {
      setEditing(fresh.id)
      setClaimNewest(null)
    }
  }, [blocks, claimNewest])

  const inserters = (index: number): React.JSX.Element => (
    <InsertLine
      onSection={() => {
        setClaimNewest('section')
        insertAt(index, { kind: 'section', position: index, text: 'New section' })
      }}
      onParagraph={() => {
        setClaimNewest('paragraph')
        insertAt(index, { kind: 'paragraph', position: index, text: '' })
      }}
      onImage={
        folderId === undefined
          ? undefined
          : () => {
              /* An empty block, which is then its own way in: choose, drop or
                 paste (L-197). See the `folderId` prop's own note. */
              insertAt(index, { kind: 'image', position: index })
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
                {editing === block.id ? (
                  <InlineInput
                    key={`${block.id}-${block.text ?? ''}`}
                    defaultValue={block.text ?? ''}
                    aria-label="Section name"
                    maxLength={120}
                    autoFocus
                    onBlur={(event) => {
                      const next = event.target.value.trim()
                      setEditing(null)
                      if (next !== '' && next !== block.text) editText(block.id, next)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === 'Escape') {
                        event.currentTarget.blur()
                      }
                    }}
                    className="text-[16px] leading-6 font-semibold text-foreground"
                  />
                ) : (
                  /* A section is a heading: 9.1's regions table names a
                     folder page's regions by their sections, and a name that
                     lives only in a form field names nothing. */
                  <h2
                    onClick={() => {
                      setEditing(block.id)
                    }}
                    className="cursor-text text-[16px] leading-6 font-semibold text-foreground"
                  >
                    {block.text}
                  </h2>
                )}
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
              /*
              **S26: the prototype's own block** (ledger L-193 to L-197, and
              item 44's B7 and B11). What this replaces drew a picture, a
              caption field and a remove control, and had no width handle, no
              drop, no paste, no ratio reservation and no way to replace the
              picture; the handle's column landed at S22a with nothing to
              write it.

              The ratio is the one part that cannot be whole: `files` carries
              no dimensions and `page_blocks` no ratio, so a reader who did not
              choose the picture gets the block's own 16 by 9 default. That is
              **section 13 item 47**, recorded at S22a against this exact
              surface, and it is a frozen section 4 change rather than a
              styling one.
              */
              <div className="pt-2">
                <PageImage
                  folderId={folderId ?? ''}
                  image={{
                    id: block.file_id ?? '',
                    ratio: 16 / 9,
                    caption: block.text ?? '',
                    ...(block.width_pct === null ? {} : { width: block.width_pct }),
                  }}
                  onChange={(next) => {
                    onPut(
                      blocks.map((entry, position) => ({
                        ...(writeOf ?? carry)(entry),
                        position,
                        ...(entry.id === block.id
                          ? {
                              file_id: next.id === '' ? null : next.id,
                              text: next.caption === '' ? null : next.caption,
                              width_pct: next.width ?? null,
                            }
                          : {}),
                      })),
                    )
                  }}
                  onRemove={() => {
                    remove(block.id)
                  }}
                />
              </div>
            ) : (
              /* Prose until it is being written; committing an empty one
                 removes it, his rule. Rendering every paragraph as a live
                 textarea made a page of writing a page of form fields, which
                 is what a reader and a role-addressed locator both meet
                 first. */
              editing === block.id ? (
                <InlineTextarea
                  key={`${block.id}-${block.text ?? ''}`}
                  defaultValue={block.text ?? ''}
                  placeholder="Write something…"
                  aria-label="Paragraph"
                  rows={1}
                  autoFocus
                  onBlur={(event) => {
                    const next = event.target.value.trim()
                    setEditing(null)
                    if (next === (block.text ?? '')) return
                    if (next === '') remove(block.id)
                    else editText(block.id, next)
                  }}
                  className="text-[13px] leading-5 text-muted-foreground"
                />
              ) : (
                <p
                  onClick={() => {
                    setEditing(block.id)
                  }}
                  className="cursor-text text-[13px] leading-5 whitespace-pre-wrap text-muted-foreground"
                >
                  {block.text === null || block.text === '' ? (
                    <span className="opacity-60">Write something…</span>
                  ) : (
                    block.text
                  )}
                </p>
              )
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
