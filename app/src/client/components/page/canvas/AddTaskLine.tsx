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
import { enterFromBelow } from './block-selection.js'
import { isSectionHeading } from './outline.js'
import type { CanvasEditor } from './schema.js'
import './add-task-line.css'

interface Held {
  text: string
  focused: boolean
  queue: string[]
  mountedAt: number
  /** Until when a mount takes the caret back: only a remount this line's own save caused. */
  resume: number
  /** Lets go of the page's held scroll, while one is held. */
  release: (() => void) | null
}
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

/**
 * Holds the page where it is read while a save remounts the editor: from the
 * Enter, before the old editor leaves, until the new one has settled (2 s) or
 * the person scrolls. The block the page scrolls keeps its height meanwhile,
 * so the gap while the editor remounts never pulls the page to its top.
 */
function holdScroll(state: Held, line: HTMLElement): void {
  state.release?.()
  const box = scrollerOf(line)
  if (box === null) return
  let keep: HTMLElement | null = line
  while (keep !== null && keep.parentElement !== box) keep = keep.parentElement
  const top = box.scrollTop
  const until = performance.now() + 2000
  const minHeight = keep?.style.minHeight ?? ''
  if (keep !== null) keep.style.minHeight = `${keep.offsetHeight}px`
  let frame = 0
  const release = (): void => {
    cancelAnimationFrame(frame)
    if (keep !== null) keep.style.minHeight = minHeight
    window.removeEventListener('wheel', release)
    window.removeEventListener('touchstart', release)
    if (state.release === release) state.release = null
  }
  const hold = (): void => {
    if (!box.isConnected || performance.now() > until) { release(); return }
    if (Math.abs(box.scrollTop - top) > 1) box.scrollTop = top
    frame = requestAnimationFrame(hold)
  }
  state.release = release
  window.addEventListener('wheel', release, { passive: true })
  window.addEventListener('touchstart', release, { passive: true })
  hold()
}

/** Pinned: drawn above where it stands in the page (CSS `sticky`), so the page's end is not in view. */
function pinned(line: HTMLElement): boolean {
  const before = line.previousElementSibling
  return before !== null && line.getBoundingClientRect().top < before.getBoundingClientRect().bottom - 1
}

/**
 * A line the slash menu was opened on and left empty (Esc, or a click away)
 * goes again once the caret leaves it, as an empty line does on Enter, so no
 * blank line is left above "Add a task…". The page's only line stays.
 */
function dropIfLeftEmpty(editor: CanvasEditor, id: string): void {
  const root = editor.domElement
  const empty = (): boolean => {
    const block = editor.getBlock(id)
    return block !== undefined && block.type === 'paragraph' && Array.isArray(block.content) && block.content.length === 0 && block.children.length === 0
  }
  const check = (): void => {
    if (!empty()) { stop(); return }
    const away = editor.getTextCursorPosition().block.id !== id || (root !== undefined && !root.contains(document.activeElement))
    if (!away || editor.getExtension(SuggestionMenu)?.shown() === true) return
    stop()
    if (editor.document.length > 1) editor.transact((tr) => { tr.setMeta('addToHistory', false); editor.removeBlocks([id]) })
  }
  const onFocusOut = (): void => { window.setTimeout(check, 0) }
  const offSelection = editor.onSelectionChange(check)
  root?.addEventListener('focusout', onFocusOut)
  function stop(): void { offSelection(); root?.removeEventListener('focusout', onFocusOut) }
}

export function AddTaskLine({ editor, page, editable }: {
  readonly editor: CanvasEditor
  /** The page's id: what is held across the editor's remounts. */
  readonly page: string
  /** False while the page is saving a Task; an Enter then waits for the next mount. */
  readonly editable: boolean
}): React.JSX.Element {
  const state = held.get(page) ?? { text: '', focused: false, queue: [], mountedAt: 0, resume: 0, release: null }
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
    if (line.current !== null) holdScroll(state, line.current)
    if (state.focused) state.resume = performance.now() + 2000
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
    if (id === null) return
    then(id)
    dropIfLeftEmpty(editor, id)
  }

  /* Saving a Task remounts the page's editor, often twice in a row, and the
     page's rows arrive over a few frames. A mount the line's own save caused
     takes the caret back (`resume`); any other arrival, such as Back to this
     page, does not, so a phone's keyboard never opens by itself. The page's
     scroll is held from the Enter (`holdScroll`). An Enter that came in
     meanwhile is sent once this editor has stood still for `SETTLE`, so it
     is never written into an editor that is about to be replaced. */
  useEffect(() => {
    state.mountedAt = performance.now()
    if (state.focused && performance.now() < state.resume) input.current?.focus({ preventScroll: true })
    else state.focused = false
    return () => { if (performance.now() >= state.resume) state.focused = false }
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
      {/* Where a Task row's checkbox stands (add-task-line.css places it, on the thread's rail too). */}
      <span aria-hidden="true" className="dana-add-task-glyph flex size-[var(--control-height)] shrink-0 items-center justify-center">
        <span className="size-[var(--checkbox-size)] rounded-xs border border-dashed border-quiet-foreground" />
      </span>
      <input
        ref={input}
        value={text}
        aria-label="Add a task"
        placeholder="Add a task…"
        enterKeyHint="enter"
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
          // Up from an empty line goes back into the page, at its last block (`enterFromBelow`).
          else if (event.key === 'ArrowUp' && state.text === '' && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
            event.preventDefault()
            event.currentTarget.blur()
            if (!enterFromBelow(editor)) event.currentTarget.focus()
          }
        }}
      />
    </label>
  )
}
