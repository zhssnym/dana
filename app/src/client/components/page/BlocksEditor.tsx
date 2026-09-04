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

**Page blocks use Dana's one sortable-list engine.** The handle moves the
stored page blocks and the next whole-page PUT persists their positions. Task
rows remain the existing `TaskRows` composition and keep their own spacing,
gestures, and section assignment.
*/
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

import type { PageBlock, PageBlockWrite } from '../../../shared/pages.js'
import {
  ChevronDown,
  GripVertical,
  Heading1,
  ImagePlus,
  ListTodo,
  MoreHorizontal,
  Plus,
  Trash2,
} from '../../lib/icons.js'
import { InlineInput, InlineTextarea } from '../ui/inline-field.js'
import { reservedRatio } from '../../lib/page-images.js'
import { PageImage } from '../page-image.js'
import { Button } from '../ui/button.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.js'
import { cn } from '../ui/utils.js'
import { linkedParts, linksIn, videoTarget } from '../../pages/composer-research-content.js'
import { useSortableList } from '../../lib/use-sortable-list.js'

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
  onTask,
  sectionName = 'No section',
  autoFocus = false,
  onAutoFocus,
  resting = false,
  dense = false,
}: {
  /* Optional because the same writing line is shared with page kinds that
     cannot create a section or upload an image. */
  readonly onSection?: ((title?: string) => void) | undefined
  readonly onParagraph: (text: string) => void
  readonly onImage?: (() => void) | undefined
  readonly onTask?: ((title: string) => Promise<boolean>) | undefined
  readonly sectionName?: string
  readonly autoFocus?: boolean
  readonly onAutoFocus?: (() => void) | undefined
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
  const [draft, setDraft] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [working, setWorking] = useState(false)
  const editor = useRef<HTMLTextAreaElement>(null)
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!autoFocus) return
    editor.current?.focus()
    onAutoFocus?.()
  }, [autoFocus, onAutoFocus])

  function writeParagraph(): void {
    const text = draft.trim()
    if (text === '') return
    onParagraph(text)
    setDraft('')
  }

  async function writeTask(): Promise<void> {
    if (onTask === undefined || working) return
    setWorking(true)
    try {
      const made = await onTask(draft.trim())
      if (made) setDraft('')
    } finally {
      setWorking(false)
    }
  }

  function onEditorKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.nativeEvent.isComposing) return
    if (event.key === '/' && draft === '') {
      event.preventDefault()
      setMenuOpen(true)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setDraft('')
      event.currentTarget.blur()
      return
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      void writeTask()
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      writeParagraph()
    }
  }

  return (
    <div
      ref={container}
      className={cn(
        'group/insert relative -ml-8 flex items-start',
        resting ? 'min-h-8' : dense ? '-mb-1 min-h-5' : 'min-h-6',
      )}
      role="presentation"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center">
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Insert into page"
                className={cn(
                  'rounded-full text-muted-foreground transition-opacity',
                  resting || draft !== ''
                    ? 'opacity-70 hover:opacity-100'
                    : 'opacity-0 group-hover/insert:opacity-70 group-focus-within/insert:opacity-70 data-[popup-open]:opacity-100 [@media(hover:none)]:opacity-60',
                )}
              />
            }
          >
            <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={2} className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Add here</DropdownMenuLabel>
              {onTask === undefined ? null : (
                <DropdownMenuItem className="items-start py-2" onClick={() => void writeTask()}>
                  <ListTodo className="mt-0.5 size-4" strokeWidth={1.75} aria-hidden="true" />
                  <span>
                    <span className="block font-medium">Task</span>
                    <span className="block text-muted-foreground">Add to {sectionName}</span>
                  </span>
                </DropdownMenuItem>
              )}
              {onSection === undefined ? null : (
                <DropdownMenuItem
                  className="items-start py-2"
                  onClick={() => {
                    onSection(draft.trim() || undefined)
                    setDraft('')
                  }}
                >
                  <Heading1 className="mt-0.5 size-4" strokeWidth={1.75} aria-hidden="true" />
                  <span>
                    <span className="block font-medium">Section</span>
                    <span className="block text-muted-foreground">Begin a new part of the page</span>
                  </span>
                </DropdownMenuItem>
              )}
              {onImage === undefined ? null : (
                <DropdownMenuItem className="items-start py-2" onClick={onImage}>
                  <ImagePlus className="mt-0.5 size-4" strokeWidth={1.75} aria-hidden="true" />
                  <span>
                    <span className="block font-medium">Image</span>
                    <span className="block text-muted-foreground">Choose, paste, or drop</span>
                  </span>
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <InlineTextarea
        ref={editor}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onEditorKeyDown}
        onBlur={(event) => {
          if (container.current?.contains(event.relatedTarget as Node | null) === true) return
          writeParagraph()
        }}
        rows={1}
        aria-label="Write something"
        aria-description="Enter adds a paragraph. Shift plus Enter adds a line break. Control or Command plus Enter creates a task."
        placeholder={resting ? 'Write something…' : undefined}
        disabled={working}
        className={cn(
          'min-h-8 flex-1 py-1 text-sm leading-6 text-foreground transition-opacity placeholder:text-muted-foreground',
          resting || draft !== ''
            ? 'opacity-100'
            : 'opacity-0 group-hover/insert:opacity-100 group-focus-within/insert:opacity-100',
        )}
      />
    </div>
  )
}

export function BlocksEditor({
  blocks,
  onPut,
  onCreateTask,
  sectionExtras,
  folderRow,
  folderId,
  writeOf,
  onDeleteSection,
}: {
  /** The last read, whole; the evidence every write carries back. */
  readonly blocks: readonly PageBlock[]
  readonly onPut: (body: PageBlockWrite[]) => void
  /** A task created from an uncommitted writing line. Because the line has
      not entered the page contract yet, success cannot leave duplicated
      prose behind if the page write loses a stale-write race. */
  readonly onCreateTask?: ((title: string, sectionBlockId: string | null) => Promise<boolean>) | undefined
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
  const [focusLineAt, setFocusLineAt] = useState<number | null>(null)
  const [pendingLine, setPendingLine] = useState<{ index: number; count: number } | null>(null)
  const [pendingParagraph, setPendingParagraph] = useState<{ index: number; count: number } | null>(null)

  const all = (): PageBlockWrite[] =>
    blocks.map((block, index) => ({ ...(writeOf ?? carry)(block), position: index }))

  const blockDrag = useSortableList({
    count: blocks.length,
    onReorder: (from, to) => {
      const body = all()
      const [moved] = body.splice(from, 1)
      if (moved === undefined) return
      body.splice(to, 0, moved)
      onPut(body.map((entry, position) => ({ ...entry, position })))
    },
    describe: (index) => {
      const block = blocks[index]
      if (block === undefined) return 'Page item'
      if (block.kind === 'section') return block.text ?? 'Section'
      if (block.kind === 'paragraph') return block.text ?? 'Paragraph'
      if (block.kind === 'image') return block.text ?? 'Image'
      return 'Folder'
    },
  })

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
  const [claimNewest, setClaimNewest] = useState<'section' | null>(null)
  useEffect(() => {
    if (claimNewest === null) return
    const fresh = blocks.find(
      (block) =>
        block.kind === claimNewest && block.text === 'New section',
    )
    if (fresh !== undefined) {
      setEditing(fresh.id)
      setFreshId(fresh.id)
      setClaimNewest(null)
    }
  }, [blocks, claimNewest])

  useEffect(() => {
    if (pendingLine === null || blocks.length < pendingLine.count) return
    setFocusLineAt(pendingLine.index)
    setPendingLine(null)
  }, [blocks, pendingLine])

  useEffect(() => {
    if (pendingParagraph === null || blocks.length < pendingParagraph.count) return
    const block = blocks[pendingParagraph.index]
    if (block?.kind !== 'paragraph') return
    setEditing(block.id)
    setPendingParagraph(null)
  }, [blocks, pendingParagraph])

  const inserters = (
    index: number,
    options: { readonly dense?: boolean } = {},
  ): React.JSX.Element => {
    const paragraph = (text: string): void => {
      setPendingLine({ index: index + 1, count: blocks.length + 1 })
      insertAt(index, { kind: 'paragraph', position: index, text })
    }
    const owner = blocks
      .slice(0, index)
      .reverse()
      .find((block) => block.kind === 'section')
    const task = onCreateTask === undefined
      ? undefined
      : (title: string): Promise<boolean> => onCreateTask(title, owner?.id ?? null)
    return (
      <InsertLine
        resting={index === blocks.length}
        dense={options.dense ?? false}
        onSection={(title) => {
          if (title === undefined) setClaimNewest('section')
          insertAt(index, { kind: 'section', position: index, text: title ?? 'New section' })
        }}
        onParagraph={paragraph}
        onTask={task}
        sectionName={owner?.text ?? 'No section'}
        autoFocus={focusLineAt === index}
        onAutoFocus={() => setFocusLineAt(null)}
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
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey) return
          event.preventDefault()
          const value = event.currentTarget.value
          const at = event.currentTarget.selectionStart
          const before = value.slice(0, at).trim()
          const after = value.slice(at).trim()
          const body = all()
          const index = blocks.findIndex((candidate) => candidate.id === block.id)
          if (index < 0) return
          const current = body[index]
          if (current === undefined) return
          body[index] = { ...current, text: before }
          setEditing(null)
          if (after === '') {
            setFocusLineAt(index + 1)
          } else {
            body.splice(index + 1, 0, { kind: 'paragraph', position: index + 1, text: after })
            setPendingParagraph({ index: index + 1, count: blocks.length + 1 })
          }
          onPut(body.map((entry, position) => ({ ...entry, position })))
        }}
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
      <div className="group/paragraph flex items-start gap-1">
        <p
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a') === null) setEditing(block.id)
          }}
          className="min-w-0 flex-1 cursor-text text-sm leading-6 whitespace-pre-wrap text-foreground"
        >
          {block.text === null || block.text === '' ? (
            <span className="text-muted-foreground">Write something…</span>
          ) : (
            linkedParts(block.text).map((part, index) => part.kind === 'text'
              ? part.value
              : (
                  <a
                    key={`${String(index)}-${part.href}`}
                    href={part.href}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
                  >
                    {part.value}
                  </a>
                ))
          )}
          {linksIn(block.text ?? '').map(videoTarget).some((target) => target !== null) ? (
            <span className="mt-1 block text-xs text-muted-foreground">Video link opens in a new tab</span>
          ) : null}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Paragraph actions"
                className="opacity-0 text-muted-foreground group-hover/paragraph:opacity-70 focus-visible:opacity-100 data-[popup-open]:opacity-100 [@media(hover:none)]:opacity-60"
              />
            }
          >
            <MoreHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                const body = all()
                const index = blocks.findIndex((candidate) => candidate.id === block.id)
                if (index < 0) return
                const current = body[index]
                if (current === undefined) return
                body[index] = { ...current, kind: 'section', text: block.text ?? '' }
                onPut(body)
              }}
            >
              <Heading1 className="size-4" strokeWidth={1.75} aria-hidden="true" />
              Turn into section
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
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

        const dragState = blockDrag.itemState(index)
        const dragStyle = dragState.offset === 0 && !dragState.isActive
          ? undefined
          : {
              transform: `translateY(${String(dragState.offset)}px)`,
              transition:
                dragState.isActive && !dragState.isSettling
                  ? 'none'
                  : 'transform var(--duration-base) var(--ease-enter)',
              zIndex: dragState.isActive ? 30 : undefined,
              position: dragState.isActive ? 'relative' as const : undefined,
              pointerEvents: dragState.isActive ? 'none' as const : undefined,
            }
        const dragHandle = (
          <button
            type="button"
            aria-label={`Reorder ${block.kind === 'section' ? (block.text ?? 'section') : block.kind}`}
            {...blockDrag.handleProps(index)}
            className="absolute top-1 -left-7 z-10 flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 outline-none transition-opacity group-hover/item:opacity-60 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring [@media(hover:none)]:opacity-60"
          >
            <GripVertical className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        )

        if (block.kind === 'folder_ref') {
          const row = folderRow?.(block)
          if (row === undefined || row === null) return null
          return (
            <div
              key={block.id}
              ref={blockDrag.setItemRef(index)}
              style={dragStyle}
              className="group/item relative"
            >
              {dragHandle}
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
          <div
            key={block.id}
            ref={blockDrag.setItemRef(index)}
            style={dragStyle}
            className="group/item relative"
          >
            {dragHandle}
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
                  folderId={folderId ?? ''}
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
                  ? inserters(index + 1, { dense: true })
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
