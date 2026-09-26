/*
Work's last line (M4 §2.5): always an empty task line, "Add a task…".

- Typing a title and Enter makes a Task, through the page's own Task act
  (`createTaskFrom`, the one `[] ` and `/task` use), at the end of the page:
  after the last block of the innermost last Section (`lastLinePlace`). The
  line keeps the caret, so the next Enter makes the next Task.
- `/` opens the page's slash menu on a new line there, for any other kind.
- `#`, `##`, `###` and a space make that heading there (`headingLine`).
- On a phone the line is pinned to the bottom of the screen above the safe
  area. While pinned, a Task goes to the end of the Section in view.

It is one line, not a second editor: nothing typed here is page writing until
Enter. Saving a Task remounts the page's editor (a checkpoint), so what is
typed, the caret and an Enter pressed while the page was busy are held here
per page and picked up by the next mount. Held in memory only, never storage.
*/
import { useEffect, useRef, useState } from 'react'
import { SuggestionMenu } from '@blocknote/core/extensions'
import { createTaskFrom, hasTaskCommand, lastLinePlace, openLineAt } from './commands.js'
import { headingLine } from './markdown.js'
import { isSectionHeading } from './outline.js'
import type { CanvasEditor } from './schema.js'

interface Held { text: string; focused: boolean; queue: string[]; mountedAt: number; scroll: { box: Element; top: number; until: number } | null }
const held = new Map<string, Held>()

const HEADING = /^(#{1,3}) $/
/** How long an editor must have stood before an Enter is written into it (ms). */
const SETTLE = 300

/** The Section whose heading sits in the upper part of the screen, last in page order: the one being read. */
function sectionInView(editor: CanvasEditor, line: HTMLElement): string | undefined {
  const root = editor.domElement
  if (root === undefined) return undefined
  const limit = line.getBoundingClientRect().top * 0.5
  let found: string | undefined
  for (const outer of root.querySelectorAll<HTMLElement>('.bn-block-outer[data-id]')) {
    const content = outer.querySelector<HTMLElement>(':scope > .bn-block > .react-renderer > .bn-block-content[data-content-type="heading"], :scope > .bn-block > .bn-block-content[data-content-type="heading"]')
    if (content === null) continue
    if (content.getBoundingClientRect().top > limit) break
    const block = editor.getBlock(outer.dataset.id!)
    if (block !== undefined && isSectionHeading(block)) found = block.id
  }
  return found
}

function scrollerOf(element: Element | null): Element | null {
  for (let at = element?.parentElement ?? null; at !== null; at = at.parentElement) {
    const overflow = getComputedStyle(at).overflowY
    if ((overflow === 'auto' || overflow === 'scroll') && at.scrollHeight > at.clientHeight) return at
  }
  return document.scrollingElement
}

/** Pinned: drawn above where it stands in the page (CSS `sticky`), so the page's end is not in view. */
function pinned(line: HTMLElement): boolean {
  const before = line.previousElementSibling
  return before !== null && line.getBoundingClientRect().top < before.getBoundingClientRect().bottom - 1
}

export function AddTaskLine({ editor, page, editable }: {
  readonly editor: CanvasEditor
  /** The page's id: what is held across the editor's remounts. */
  readonly page: string
  /** False while the page is saving a Task; an Enter then waits for the next mount. */
  readonly editable: boolean
}): React.JSX.Element {
  const state = held.get(page) ?? { text: '', focused: false, queue: [], mountedAt: 0, scroll: null }
  held.set(page, state)
  const [text, setText] = useState(state.text)
  const [, poke] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const line = useRef<HTMLLabelElement>(null)

  const keep = (next: string): void => { state.text = next; setText(next) }

  function place(): ReturnType<typeof lastLinePlace> {
    const section = line.current !== null && pinned(line.current) ? sectionInView(editor, line.current) : undefined
    return lastLinePlace(editor.document, section)
  }

  /** Enter: the title joins the queue and the line empties for the next one. */
  function submit(): void {
    const title = state.text.trim()
    if (title === '') return
    state.queue.push(title)
    keep('')
  }

  /** The first queued title becomes a Task, once this editor may take it. */
  function send(): void {
    const title = state.queue.shift()
    if (title === undefined) return
    const box = scrollerOf(line.current)
    state.scroll = box === null ? null : { box, top: box.scrollTop, until: performance.now() + 2000 }
    const where = place()
    const id = where === null ? null : openLineAt(editor, where, title)
    const block = id === null ? undefined : editor.getBlock(id)
    // Nowhere to write it: the title goes back on the line, never lost.
    if (block === undefined) { state.queue.length = 0; keep(title); return }
    createTaskFrom(editor, block)
  }

  function writeOther(then: (id: string) => void): void {
    const where = place()
    const id = where === null ? null : openLineAt(editor, where, '')
    keep('')
    state.focused = false
    if (id !== null) then(id)
  }

  /* Saving a Task remounts the page's editor, often twice in a row, and the
     page's rows arrive over a few frames. Each mount takes the caret back and
     holds the page where it was read until those have settled or the person
     scrolls; an Enter that came in meanwhile is sent once this editor has
     stood still for `SETTLE`, so it is never written into an editor that is
     about to be replaced. */
  useEffect(() => {
    state.mountedAt = performance.now()
    if (state.focused) input.current?.focus({ preventScroll: true })
    const scroll = state.scroll
    if (scroll === null) return
    const box = scroll.box.isConnected ? scroll.box : scrollerOf(line.current)
    let frame = 0
    const hold = (): void => {
      if (box === null || state.scroll !== scroll || performance.now() > scroll.until) return
      if (Math.abs(box.scrollTop - scroll.top) > 1) box.scrollTop = scroll.top
      frame = requestAnimationFrame(hold)
    }
    const release = (): void => { if (state.scroll === scroll) state.scroll = null; cancelAnimationFrame(frame) }
    hold()
    window.addEventListener('wheel', release, { passive: true })
    window.addEventListener('touchstart', release, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('wheel', release)
      window.removeEventListener('touchstart', release)
    }
  }, [state])
  useEffect(() => {
    if (!editable || state.queue.length === 0) return
    const timer = window.setTimeout(() => {
      if (hasTaskCommand(editor)) send()
      else poke((n) => n + 1)
    }, Math.max(0, state.mountedAt + SETTLE - performance.now()))
    return () => { window.clearTimeout(timer) }
  })

  return (
    <label
      ref={line}
      className="dana-add-task-line flex min-h-8 cursor-text items-center gap-0.5 max-md:sticky max-md:min-h-11 max-md:bottom-0 max-md:z-10 max-md:bg-background max-md:pb-[env(safe-area-inset-bottom)]"
    >
      {/* Where a Task row's checkbox stands: its control box, hung into the gutter as the row's is. */}
      <span aria-hidden="true" className="-ms-[calc((var(--control-height)-var(--checkbox-size))/2)] flex size-[var(--control-height)] shrink-0 items-center justify-center">
        <span className="size-[var(--checkbox-size)] rounded-sm border border-dashed border-quiet-foreground" />
      </span>
      <input
        ref={input}
        value={text}
        aria-label="Add a task"
        placeholder="Add a task…"
        enterKeyHint="done"
        className="min-w-0 flex-1 bg-transparent py-1 text-[length:var(--text-body-size)] leading-[var(--text-body-line)] text-foreground outline-none placeholder:text-quiet-foreground"
        onFocus={() => { state.focused = true }}
        onBlur={() => { state.focused = false }}
        onChange={(event) => {
          const next = event.target.value
          if (next === '/') {
            writeOther((id) => {
              editor.setTextCursorPosition(id, 'end')
              editor.focus()
              editor.getExtension(SuggestionMenu)?.openSuggestionMenu('/')
            })
            return
          }
          const hashes = HEADING.exec(next)?.[1]
          if (hashes !== undefined) {
            writeOther((id) => { headingLine(editor, id, hashes.length as 1 | 2 | 3) })
            return
          }
          keep(next)
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if (event.key === 'Enter') { event.preventDefault(); submit() }
          else if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.blur() }
        }}
      />
    </label>
  )
}
