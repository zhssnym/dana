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

**And the first of those blocks, if it is prose, is the heading's opening
paragraph** and draws between the heading and the section's first row
(DES-145; the rule and the one corner it cannot make honest are written out
at `openingOf` below). It is the same rule read one step further rather than
a second one, which is what keeps 4.17 as it is: the prototype gives a
section an `intro` field and the frozen schema has no column for it.

**What the two pages add is theirs.** A folder page hangs tasks and a
capture under each section (`sectionExtras`); a shelf renders its folder
rows (`folderRow`) and drops stored rows whose membership is gone. Neither
concern is this file's: it renders what it is handed at the position the
block holds.

**No pointer drag yet, deliberately.** RFC 0004 assigns the drag engines to
S11, and the sidebar drag moved there at the S9 close for exactly the
one-engine reason; blocks arrange today by where they are inserted, and the
grip arrives when the engine does.
*/
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import type { PageBlock, PageBlockWrite } from '../../../shared/pages.js'
import { AlignLeft, ChevronDown, Heading1, ImagePlus, Trash2 } from '../../lib/icons.js'
import { InlineInput, InlineTextarea } from '../ui/inline-field.js'
import { reservedRatio } from '../../lib/page-images.js'
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
  resting = false,
  dense = false,
}: {
  /* Optional, and the prototype's rule for why: the line under a heading
     omits it, a section inside a section not being a thing Dana has, and a
     tool that cannot mean anything is worse than a shorter row. */
  readonly onSection?: (() => void) | undefined
  readonly onParagraph: () => void
  readonly onImage?: (() => void) | undefined
  /*
  polish: folderpage F2. The chips were opacity zero until hovered, which
  is a tool nobody finds and, on a touchscreen, a tool nobody can reach. The
  line at the page's foot rests visible at reduced opacity, and every line
  is fully drawn where there is no hover to reveal it.
  */
  readonly resting?: boolean
  /*
  polish round 2, folderpage: the prototype's `dense`, DES-148. "An affordance
  may not charge rent for space it is not using": the full strip is the
  separation between two blocks, and it is wrong under a heading, where 24px
  of permanent gap made the section and its first row read as two things, and
  wrong between two sentences that continue one another. 16px with 4 borrowed
  back by a negative margin, which is the prototype's 12px of net gap.
  */
  readonly dense?: boolean
}): React.JSX.Element {
  /* The strip is its own height and its controls are centred inside it
     rather than laid out in flow: a 20px button row inside a 12px strip
     overhung the prose above it, which put controls on top of a sentence.
     So the dense strip shortens its chips too rather than keeping tall ones
     inside a short strip. */
  const chip = cn(
    'flex items-center gap-1 rounded bg-card px-1.5 text-[11px] leading-4 text-muted-foreground ring-1 ring-border transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
    dense ? 'h-4' : 'h-5',
  )
  return (
    <div
      className={cn(
        'group/insert relative',
        resting ? 'h-7' : dense ? '-mb-1 h-4' : 'h-6',
      )}
      role="presentation"
    >
      {/* The line arrives in Dana's one interaction colour, which is what the
          prototype draws: `bg-border` drew a divider, and a divider is
          furniture that happens to be there rather than an answer to the
          pointer. The prototype spells the ramp step (`--color-dana-accent-200`)
          and 11.4 does not let this directory do that, so it is the role token
          at the weight that lands on the same value: 30% of `primary` over the
          page reads within a step of the prototype's own line in both modes,
          and follows the role rather than a fixed colour. */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-primary/30 opacity-0 transition-opacity group-hover/insert:opacity-100 group-focus-within/insert:opacity-100" />
      <div
        className={cn(
          'absolute top-1/2 left-0 z-10 flex -translate-y-1/2 items-center gap-1 transition-opacity group-hover/insert:opacity-100 group-focus-within/insert:opacity-100 [@media(hover:none)]:opacity-100',
          resting ? 'opacity-60' : 'opacity-0',
        )}
      >
        {onSection === undefined ? null : (
          <button type="button" onClick={onSection} className={chip}>
            <Heading1 className="size-3" strokeWidth={1.75} aria-hidden="true" />
            Section
          </button>
        )}
        <button type="button" onClick={onParagraph} className={chip}>
          <AlignLeft className="size-3" strokeWidth={1.75} aria-hidden="true" />
          Paragraph
        </button>
        {onImage === undefined ? null : (
          <button type="button" onClick={onImage} className={chip}>
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
  onDeleteSection,
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
  /** polish: folderpage F5. Asked before a section goes; the page answers
      with a question and calls `remove` if the person says so. Absent, the
      section is removed at once. */
  readonly onDeleteSection?: (block: PageBlock, remove: () => void) => void
}): React.JSX.Element {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  /** The one block being written, if any; everything else reads as prose. */
  const [editing, setEditing] = useState<string | null>(null)
  /* polish: folderpage F4. A section just made opens as an empty field with
     "New section" as its placeholder, rather than as a value typing appends
     to. The stored text is still "New section" (4.17 wants a name), so this
     remembers which block is the fresh one until it is named or left. */
  const [freshId, setFreshId] = useState<string | null>(null)

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
      if (claimNewest === 'section') setFreshId(fresh.id)
      setClaimNewest(null)
    }
  }, [blocks, claimNewest])

  const inserters = (
    index: number,
    options: { readonly dense?: boolean; readonly proseOnly?: boolean } = {},
  ): React.JSX.Element => {
    const paragraph = (): void => {
      setClaimNewest('paragraph')
      insertAt(index, { kind: 'paragraph', position: index, text: '' })
    }
    /* The line under a heading is never the page's resting one even when it
       stands at the end of the list: what rests is the row of tools at the
       page's foot (folderpage F2), and there is exactly one of those. */
    if (options.proseOnly === true) {
      return <InsertLine dense={options.dense ?? false} onParagraph={paragraph} />
    }
    return (
      <InsertLine
        resting={index === blocks.length}
        dense={options.dense ?? false}
        onSection={() => {
          setClaimNewest('section')
          insertAt(index, { kind: 'section', position: index, text: 'New section' })
        }}
        onParagraph={paragraph}
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
  }

  /*
  A heading's opening paragraph (DES-145).

  Imran, 2026-08-18: the insertion lines lived between page blocks, so there
  was nowhere to write between a section's heading and the first task under
  it, which is the one place a section most wants a sentence. The prototype
  answers with a field of its own on the section, `intro`; 4.17 is frozen and
  carries no such column, so the same behaviour is read off the order the
  blocks already hold, which is the rule this file runs on everywhere else:
  **the paragraph immediately after a heading is that heading's opening
  paragraph, and it draws between the heading and the first row.** Every
  later block in the span keeps drawing after the section's rows, as before,
  so prose at the end of a section is not lost.

  The one corner this cannot make honest is recorded rather than hidden: a
  section with nothing in its span has a single free position, so a paragraph
  made from the line at its foot lands under the heading rather than under
  the control that made it. It is a 40px move over an empty capture row, and
  the alternative is a menu that changes shape from section to section.
  */
  const openingOf = (index: number): PageBlock | undefined => {
    const next = blocks[index + 1]
    return next?.kind === 'paragraph' ? next : undefined
  }

  /** A paragraph block: prose until it is being written. */
  const paragraphNode = (block: PageBlock): React.JSX.Element =>
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
      /* Rendering every paragraph as a live textarea made a page of writing a
         page of form fields, which is what a reader and a role-addressed
         locator both meet first. */
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
        /* An opening paragraph is drawn by the heading that owns it, above
           that section's first row, so it is not drawn a second time here. */
        if (block.kind === 'paragraph' && blocks[index - 1]?.kind === 'section') {
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

        /* A heading's own opening paragraph, and the position the line at its
           foot writes into: with an opening paragraph drawn inside the
           section, that line stands in for the paragraph's own, so a block
           made there lands after the prose rather than above it. */
        const opening = block.kind === 'section' ? openingOf(index) : undefined
        const after = opening === undefined ? index + 1 : index + 2

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
                    defaultValue={freshId === block.id ? '' : (block.text ?? '')}
                    placeholder={freshId === block.id ? 'New section' : undefined}
                    aria-label="Section name"
                    maxLength={120}
                    autoFocus
                    onBlur={(event) => {
                      const next = event.target.value.trim()
                      const fresh = freshId === block.id
                      setEditing(null)
                      setFreshId(null)
                      /* A fresh section left unnamed is one nobody wanted. */
                      if (fresh && next === '') remove(block.id)
                      else if (next !== '' && next !== block.text) editText(block.id, next)
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
                  title="Delete section"
                  onClick={() => {
                    if (onDeleteSection === undefined) remove(block.id)
                    else onDeleteSection(block, () => remove(block.id))
                  }}
                  className="opacity-0 transition-opacity outline-none group-hover/item:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring text-muted-foreground hover:text-foreground [@media(hover:none)]:opacity-60"
                >
                  <Trash2 className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
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

              **The ratio was the one part that could not be whole, and issue
              #108 made it whole.** This line read `ratio: 16 / 9` and the
              comment above it said the fallback was for "a reader who did not
              choose the picture", which was section 13 item 47 and was also
              not true of this surface: the literal was every reader's,
              including the author's, because the ratio `PageImage` measures
              off the chosen file goes back through `onChange` into no field a
              block carries and is gone by the next render. So the reservation
              this block was written to make has never been made here.

              It is made now, from 4.16's `file_width` and `file_height` off
              the block read (7.16, issue #27). Null stays 16 by 9 for ever:
              no backfill has been run and every picture stored before
              migration 0009 reports null, so the fallback is those pages'
              real behaviour rather than a placeholder for a better one.
              */
              <div className="pt-2">
                <PageImage
                  /* Null and not '': an empty part is a folder_id the server
                     parses as a uuid and refuses, which is #167's own fault.
                     This editor draws for a folder today, so the fallback is
                     unreached; the day it draws for a shelf it is right. */
                  folderId={folderId ?? null}
                  image={{
                    id: block.file_id ?? '',
                    ratio: reservedRatio(block.file_width, block.file_height),
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
              /* Committing an empty paragraph removes it, his rule. */
              paragraphNode(block)
            )}
            {block.kind === 'section' && !collapsed.has(block.id) ? (
              <>
                {/* The one gap the page-level lines cannot reach: between a
                    heading and its first row (DES-145). Paragraph alone, and
                    dense, so the affordance costs the section 12px rather
                    than pushing its first row 24px from its own title
                    (DES-148). Once written, the paragraph itself stands
                    there and is what a second thought clicks into. */}
                {opening === undefined
                  ? inserters(index + 1, { dense: true, proseOnly: true })
                  : paragraphNode(opening)}
                {sectionExtras?.(block.id)}
              </>
            ) : null}
            {inserters(after, {
              /* Two sentences that continue one another are not two blocks:
                 24px between them is a section break drawn by accident
                 (Imran, 2026-08-23). Never after a heading, where this line
                 follows the section's rows rather than its prose. */
              dense:
                block.kind === 'paragraph' &&
                blocks[after]?.kind === 'paragraph',
            })}
          </div>
        )
      })}
    </div>
  )
}
