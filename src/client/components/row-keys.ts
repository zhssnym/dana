// The keyboard path through a task list: one Tab stop, arrows move between rows, and
// rows handle Enter and Space themselves. After a completion, focus goes to the row that
// took its place. A nested `data-row-scope` owns its own rows.
import { useEffect, useRef } from 'react'

const ROW = '[data-row-key]'
const CONTROLS = 'button, a[href], input, select, textarea, [tabindex]'

export function useRowKeys<T extends HTMLElement>(): React.RefObject<T | null> {
  const scope = useRef<T | null>(null)
  useEffect(() => {
    const root = scope.current
    if (root === null) return
    root.setAttribute('data-row-scope', '')
    let active: string | null = null
    let lastIndex = 0
    let inside = false
    // The id completed with Space, until the list has redrawn without it.
    let completing: string | null = null
    let completingTimer = 0

    const rows = (): HTMLElement[] =>
      Array.from(root.querySelectorAll<HTMLElement>(ROW)).filter(
        (row) => row.closest('[data-row-scope]') === root && row.getClientRects().length > 0,
      )
    const idOf = (row: HTMLElement | undefined): string | null => row?.dataset.taskId ?? null

    const sync = (): void => {
      const all = rows()
      const current =
        all.find((row) => idOf(row) === active) ?? all[Math.min(lastIndex, all.length - 1)]
      for (const row of all) {
        const want = row === current ? '0' : '-1'
        if (row.getAttribute('tabindex') !== want) row.setAttribute('tabindex', want)
        for (const control of row.querySelectorAll<HTMLElement>(CONTROLS)) {
          if (control.getAttribute('tabindex') !== '-1') control.setAttribute('tabindex', '-1')
        }
      }
    }

    const focusRow = (row: HTMLElement | undefined): void => {
      if (row === undefined) return
      active = idOf(row)
      lastIndex = rows().indexOf(row)
      sync()
      row.focus()
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target as HTMLElement
      const row = target.closest<HTMLElement>(ROW)
      if (row === null || row.closest('[data-row-scope]') !== root) return
      if (target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return
      const all = rows()
      const at = all.indexOf(row)
      if (event.key === ' ' && target === row) {
        // The row completes itself; this only remembers where it was.
        completing = idOf(row)
        lastIndex = at
        window.clearTimeout(completingTimer)
        completingTimer = window.setTimeout(() => {
          completing = null
        }, 2000)
        return
      }
      let next: HTMLElement | undefined
      if (event.key === 'ArrowDown') next = all[at + 1]
      else if (event.key === 'ArrowUp') next = all[at - 1]
      else if (event.key === 'Home') next = all[0]
      else if (event.key === 'End') next = all[all.length - 1]
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        // A board: the same place in the column beside this one.
        const column = row.closest('[data-board-column]')
        if (column === null) return
        const columns: Element[] = []
        for (const each of all) {
          const own = each.closest('[data-board-column]')
          if (own !== null && !columns.includes(own)) columns.push(own)
        }
        const beside = columns[columns.indexOf(column) + (event.key === 'ArrowRight' ? 1 : -1)]
        if (beside === undefined) return
        const mine = all.filter((each) => each.closest('[data-board-column]') === column)
        const theirs = all.filter((each) => each.closest('[data-board-column]') === beside)
        next = theirs[Math.min(mine.indexOf(row), theirs.length - 1)]
      } else return
      event.preventDefault()
      focusRow(next)
    }

    const onFocusIn = (event: FocusEvent): void => {
      const row = (event.target as HTMLElement).closest<HTMLElement>(ROW)
      if (row === null || row.closest('[data-row-scope]') !== root) return
      inside = true
      active = idOf(row)
      lastIndex = Math.max(0, rows().indexOf(row))
      sync()
    }
    const onFocusOut = (event: FocusEvent): void => {
      const to = event.relatedTarget as Node | null
      if (to !== null) {
        if (!root.contains(to)) inside = false
        return
      }
      // Focus went nowhere: a click on the page (it leaves the list), or the focused row was
      // removed (the observer moves focus on).
      const left = event.target as HTMLElement
      requestAnimationFrame(() => {
        if (left.isConnected && !root.contains(document.activeElement)) inside = false
      })
    }

    const observer = new MutationObserver(() => {
      sync()
      if (!inside) return
      const focused = document.activeElement
      const lost = focused === null || focused === document.body || !root.contains(focused)
      if (completing !== null) {
        const all = rows()
        const there = all[Math.min(lastIndex, all.length - 1)]
        // The completed row moved or left: focus what is now in its place.
        if (there !== undefined && idOf(there) !== completing) {
          completing = null
          focusRow(there)
          return
        }
      }
      if (lost) {
        const all = rows()
        focusRow(all.find((row) => idOf(row) === active) ?? all[Math.min(lastIndex, all.length - 1)])
      }
    })
    observer.observe(root, { childList: true, subtree: true })
    root.addEventListener('keydown', onKeyDown)
    root.addEventListener('focusin', onFocusIn)
    root.addEventListener('focusout', onFocusOut)
    sync()
    return () => {
      observer.disconnect()
      window.clearTimeout(completingTimer)
      root.removeEventListener('keydown', onKeyDown)
      root.removeEventListener('focusin', onFocusIn)
      root.removeEventListener('focusout', onFocusOut)
    }
  }, [])
  return scope
}
