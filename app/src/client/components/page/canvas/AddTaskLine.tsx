// Work's last line, "Add a task…". Saving a task remounts the page's editor, so
// the typed text, caret and queued Enters are held per page in memory across mounts.
import { useEffect, useRef, useState } from 'react'
import { SuggestionMenu } from '@blocknote/core/extensions'
import { createTaskFrom, hasTaskCommand, lastLinePlace, lineTitles, openLineAt } from './commands.js'
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
  release: (() => void) | null
  /**
   * A title was handed back (refused, or nowhere to write it): the queue waits for the
   * next Enter. 'line' when the line shows it, 'queue' when it went back to the front.
   */
  paused: 'line' | 'queue' | null
}
const held = new Map<string, Held>()

const HEADING = /^(#{1,3}) $/
/** How long an editor must have stood before an Enter is written into it (ms). */
const SETTLE = 300

/** The last section whose heading is in the upper half of the screen. */
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
 * Hold the scroll while a save remounts the editor, until it settles (2 s) or the
 * person scrolls. The scrolled block keeps its height so the page does not jump.
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

/** Pinned by CSS `sticky` above where it stands, so the page's end is not in view. */
function pinned(line: HTMLElement): boolean {
  const before = line.previousElementSibling
  return before !== null && line.getBoundingClientRect().top < before.getBoundingClientRect().bottom - 1
}

/**
 * A slash-menu line left empty is removed once the caret leaves it, so no blank
 * line stays above "Add a task…".
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
  readonly page: string
  /** False while the page saves a task; an Enter then waits for the next mount. */
  readonly editable: boolean
}): React.JSX.Element {
  const state = held.get(page) ?? { text: '', focused: false, queue: [], mountedAt: 0, resume: 0, release: null, paused: null }
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

  function submit(): void {
    const title = state.text.trim()
    // An Enter on an empty line releases what waits.
    if (title === '') { if (state.paused !== null) { state.paused = null; poke((n) => n + 1) } return }
    // A handed-back title on the line goes before what still waits.
    if (state.paused === 'line') state.queue.unshift(title)
    else state.queue.push(title)
    state.paused = null
    keep('')
  }

  function send(): void {
    const title = state.queue.shift()
    if (title === undefined) return
    if (line.current !== null) holdScroll(state, line.current)
    if (state.focused) state.resume = performance.now() + 2000
    const where = place()
    const id = where === null ? null : openLineAt(editor, where, title)
    const block = id === null ? undefined : editor.getBlock(id)
    // Nowhere to write it: the title goes back on the line, never lost.
    if (block === undefined) { giveBack(title); return }
    // A refused task hands its title back here instead of leaving it on the page.
    lineTitles.set(block.id, { reused: where !== null && 'reuse' in where, giveBack })
    window.setTimeout(() => { lineTitles.delete(block.id) }, 15_000)
    createTaskFrom(editor, block)
  }

  // One title back on the line alone; the rest stay queued, so two titles never merge.
  function giveBack(back: string): void {
    if (state.text.trim() === '') { keep(back); state.paused = 'line' }
    else { state.queue.unshift(back); state.paused = 'queue' }
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

  // Only a remount caused by this line's own save takes the caret back, so a phone's
  // keyboard never opens by itself. Queued Enters wait until the editor settles.
  useEffect(() => {
    state.mountedAt = performance.now()
    if (state.focused && performance.now() < state.resume) input.current?.focus({ preventScroll: true })
    else state.focused = false
    return () => { if (performance.now() >= state.resume) state.focused = false }
  }, [state])
  useEffect(() => {
    if (!editable || state.queue.length === 0 || state.paused !== null) return
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
      {/* Stands where a task's checkbox does (add-task-line.css places it). */}
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
