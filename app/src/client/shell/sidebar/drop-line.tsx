/* Absolutely positioned, so nothing moves while it is shown. */
export function InsertLine({ top }: { readonly top: number }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute right-2 left-2 z-20 h-0.5 rounded-full bg-primary"
      style={{ top }}
    />
  )
}

/** Measured live, because the rows have been moving. */
export function proposalIn(
  zone: HTMLElement | null,
  y: number,
): { readonly at: number; readonly top: number } {
  if (zone === null) return { at: 0, top: 0 }
  const origin = zone.getBoundingClientRect().top
  const rows = [...zone.querySelectorAll<HTMLElement>('[data-drop-row]')]
  for (const [index, row] of rows.entries()) {
    const box = row.getBoundingClientRect()
    if (y < (box.top + box.bottom) / 2) return { at: index, top: box.top - origin }
  }
  const last = rows.at(-1)
  return {
    at: rows.length,
    top: last === undefined ? 0 : last.getBoundingClientRect().bottom - origin,
  }
}
