import { useCallback, useEffect, useRef } from 'react'
import type { PageTree } from '../page-tree.js'

/* One Tab stop for the whole tree (roving tabindex), arrows between rows; a
   row's other buttons leave the Tab order and Shift+F10 opens its "…". Another
   file draws the page rows, so their tabindex is set here on the DOM. */
const TREE_ROW = '[data-page-row] > a, [data-tree-row]'

export function pageRowLink(root: ParentNode, id: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-page-row="${CSS.escape(id)}"] > a`)
}

export function useLibraryKeys(tree: PageTree, mayRename: (id: string) => boolean, startRename: (id: string) => void): {
  readonly ref: React.RefObject<HTMLDivElement | null>
  readonly onKeyDown: (event: React.KeyboardEvent) => void
  readonly onFocus: (event: React.FocusEvent) => void
  readonly onBlur: (event: React.FocusEvent) => void
} {
  const ref = useRef<HTMLDivElement>(null)
  /* The row that last held focus, while focus is inside the tree. */
  const focused = useRef<HTMLElement | null>(null)

  const rows = useCallback((): HTMLElement[] => {
    const root = ref.current
    if (root === null) return []
    return [...root.querySelectorAll<HTMLElement>(TREE_ROW)].filter(
      (row) => row.getClientRects().length > 0,
    )
  }, [])

  const sync = useCallback((): void => {
    const root = ref.current
    if (root === null) return
    const all = rows()
    const held = focused.current
    const stop =
      (held !== null && all.includes(held) ? held : null) ??
      all.find((row) => row.getAttribute('aria-current') === 'page') ??
      all[0]
    for (const row of root.querySelectorAll<HTMLElement>(TREE_ROW)) {
      const want = row === stop ? 0 : -1
      if (row.tabIndex !== want) row.tabIndex = want
    }
    for (const inner of root.querySelectorAll<HTMLElement>('[data-page-row] button')) {
      if (inner.tabIndex !== -1) inner.tabIndex = -1
    }
  }, [rows])

  /* Every render, since rows also mount on their own (a fold, the "+"). */
  useEffect(() => {
    sync()
  })
  useEffect(() => {
    const root = ref.current
    if (root === null) return
    const observer = new MutationObserver(sync)
    observer.observe(root, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
    }
  }, [sync])

  const onFocus = (event: React.FocusEvent): void => {
    const target = event.target as HTMLElement
    if (!target.matches(TREE_ROW)) return
    focused.current = target
    sync()
  }
  const onBlur = (event: React.FocusEvent): void => {
    if (ref.current?.contains(event.relatedTarget) === true) return
    focused.current = null
    sync()
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    const row = event.target as HTMLElement
    if (!row.matches(TREE_ROW) || event.altKey || event.ctrlKey || event.metaKey) return
    const all = rows()
    const index = all.indexOf(row)
    if (index === -1) return
    const pageId = row.parentElement?.getAttribute('data-page-row') ?? null
    const head = pageId === null ? row.closest<HTMLElement>('[data-shelf-head]') : null
    /* The fold: a page's chevron, or a collection heading's trigger. */
    const fold =
      pageId !== null
        ? row.parentElement?.querySelector<HTMLElement>(':scope > [data-fold]')
        : head?.querySelector<HTMLElement>('[aria-expanded]')
    const open = fold?.getAttribute('aria-expanded')
    const go = (next: HTMLElement | null | undefined): void => {
      next?.focus()
    }
    switch (event.key) {
      case 'ArrowDown':
        go(all[index + 1])
        break
      case 'ArrowUp':
        go(all[index - 1])
        break
      case 'Home':
        go(all[0])
        break
      case 'End':
        go(all.at(-1))
        break
      case 'ArrowRight':
        if (open === 'false') fold?.click()
        else if (open === 'true') go(all[index + 1])
        break
      case 'ArrowLeft': {
        if (open === 'true') {
          fold?.click()
          break
        }
        const parent = pageId === null ? null : (tree.parent.get(pageId) ?? null)
        go(
          parent !== null && ref.current !== null
            ? pageRowLink(ref.current, parent)
            : row.closest('[data-shelf]')?.querySelector<HTMLElement>('[data-tree-row]'),
        )
        break
      }
      case 'F2':
        if (pageId !== null && mayRename(pageId)) startRename(pageId)
        break
      default:
        return
    }
    event.preventDefault()
  }

  return { ref, onKeyDown, onFocus, onBlur }
}
