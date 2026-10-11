/* The remaining native title hints use Dana's tooltip treatment until each surface
 * can adopt TooltipTrigger directly. Delegated handling covers dynamic rows, editors
 * and menus without maintaining another list of title-using components.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TOOLTIP_SURFACE_CLASS } from './tooltip.js'

const DATA_TITLE = 'data-dana-title'
const WAIT_MS = 500
const EDGE_GAP = 8
const TRIGGER_GAP = 4

interface Hint {
  readonly target: Element
  readonly text: string
}

function labelOf(element: Element): string | null {
  const native = element.getAttribute('title')
  if (native !== null) {
    element.removeAttribute('title')
    if (native.trim() !== '') element.setAttribute(DATA_TITLE, native)
    else element.removeAttribute(DATA_TITLE)

    // HTML title is sometimes the only accessible name on an icon-only button.
    if (
      native.trim() !== '' &&
      element.matches('button, a, [role="button"]') &&
      !element.hasAttribute('aria-label') &&
      !element.hasAttribute('aria-labelledby') &&
      element.textContent?.trim() === ''
    ) {
      element.setAttribute('aria-label', native)
    }
  }
  return element.getAttribute(DATA_TITLE)
}

function titleTarget(eventTarget: EventTarget | null, root: Element): Element | null {
  if (!(eventTarget instanceof Element)) return null
  const target = eventTarget.closest('[' + DATA_TITLE + '], [title]')
  if (target === null || !root.contains(target)) return null
  return labelOf(target) === null ? null : target
}

export function NativeTitleTooltips(): React.JSX.Element | null {
  const [hint, setHint] = useState<Hint | null>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const popup = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Menus and dialogs render portals directly in body, outside #root.
    const root = document.body

    let hovered: Element | null = null
    let focused: Element | null = null
    let pending: number | undefined
    let visible = false

    const cancel = (): void => {
      window.clearTimeout(pending)
      pending = undefined
    }

    const show = (target: Element | null): void => {
      cancel()
      if (target === null || !target.isConnected) {
        visible = false
        setHint(null)
        return
      }
      const text = labelOf(target)
      if (text === null || text.trim() === '') {
        visible = false
        setHint(null)
        return
      }
      const reveal = (): void => {
        visible = true
        setPosition(null)
        setHint({ target, text })
      }
      // Like TooltipProvider, adjacent hints need not wait a second time.
      if (visible) reveal()
      else pending = window.setTimeout(reveal, WAIT_MS)
    }

    const hoverIn = (event: PointerEvent): void => {
      if (event.pointerType === 'touch') return
      const target = titleTarget(event.target, root)
      if (target === hovered) return
      hovered = target
      show(hovered ?? focused)
    }
    const hoverOut = (event: PointerEvent): void => {
      if (hovered === null) return
      if (event.relatedTarget instanceof Node && hovered.contains(event.relatedTarget)) return
      hovered = null
      show(focused)
    }
    const focusIn = (event: FocusEvent): void => {
      if (!(event.target instanceof Element) || !event.target.matches(':focus-visible')) return
      focused = titleTarget(event.target, root)
      show(focused ?? hovered)
    }
    const focusOut = (): void => {
      focused = null
      show(hovered)
    }
    const dismiss = (): void => {
      hovered = null
      focused = null
      cancel()
      visible = false
      setHint(null)
    }
    const keyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') dismiss()
    }
    const normalize = (element: Element): void => {
      if (!element.hasAttribute('title')) return
      labelOf(element)
      if (element === hovered || element === focused) show(element)
    }
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') {
          if (record.target instanceof Element) normalize(record.target)
          continue
        }
        // React inserts complete subtrees. A title on the inserted node or one
        // of its descendants must not wait until the first user hover.
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue
          normalize(node)
          for (const element of node.querySelectorAll('[title]')) normalize(element)
        }
      }
    })

    // Normalize existing labels immediately. Subsequent title changes and new nodes
    // are covered by mutation observation and the delegated pointer/focus listeners.
    for (const element of root.querySelectorAll('[title]')) labelOf(element)
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] })
    document.addEventListener('pointerover', hoverIn)
    document.addEventListener('pointerout', hoverOut)
    document.addEventListener('focusin', focusIn)
    document.addEventListener('focusout', focusOut)
    document.addEventListener('keydown', keyDown)
    document.addEventListener('pointerdown', dismiss)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)

    return () => {
      cancel()
      observer.disconnect()
      document.removeEventListener('pointerover', hoverIn)
      document.removeEventListener('pointerout', hoverOut)
      document.removeEventListener('focusin', focusIn)
      document.removeEventListener('focusout', focusOut)
      document.removeEventListener('keydown', keyDown)
      document.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [])

  useLayoutEffect(() => {
    if (hint === null || popup.current === null) return
    const rect = hint.target.getBoundingClientRect()
    const box = popup.current.getBoundingClientRect()
    const above = rect.top >= box.height + TRIGGER_GAP + EDGE_GAP
    const top = above
      ? rect.top - box.height - TRIGGER_GAP
      : Math.min(window.innerHeight - box.height - EDGE_GAP, rect.bottom + TRIGGER_GAP)
    const left = Math.max(
      EDGE_GAP,
      Math.min(window.innerWidth - box.width - EDGE_GAP, rect.left + rect.width / 2 - box.width / 2),
    )
    setPosition({ top: Math.max(EDGE_GAP, top), left })
  }, [hint])

  if (hint === null || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={popup}
      role="tooltip"
      className={TOOLTIP_SURFACE_CLASS + ' pointer-events-none fixed isolate z-[200]'}
      style={position === null ? { top: 0, left: 0, visibility: 'hidden' } : position}
    >
      {hint.text}
    </div>,
    document.body,
  )
}
