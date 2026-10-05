/* Never rename these keys. */
const SHELF_FOLD_KEY = 'dana.sidebar.shelf-collapsed:'
export function readShelfOpen(label: string): boolean {
  try {
    return globalThis.localStorage.getItem(SHELF_FOLD_KEY + label) !== '1'
  } catch {
    return true
  }
}
export function writeShelfOpen(label: string, open: boolean): void {
  try {
    globalThis.localStorage.setItem(SHELF_FOLD_KEY + label, open ? '0' : '1')
  } catch {
    /* A browser that keeps nothing still folds for this session. */
  }
}

/* Stores folded ids, so a new sub-page starts open. */
const PAGE_FOLD_KEY = 'dana.sidebar.page-folded'
export function readPageFolds(): ReadonlySet<string> {
  try {
    const raw = globalThis.localStorage.getItem(PAGE_FOLD_KEY)
    const parsed: unknown = raw === null ? [] : JSON.parse(raw)
    return new Set(
      Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [],
    )
  } catch {
    return new Set()
  }
}
export function writePageFolds(folded: ReadonlySet<string>): void {
  try {
    globalThis.localStorage.setItem(PAGE_FOLD_KEY, JSON.stringify([...folded]))
  } catch {
    /* A browser that keeps nothing still folds for this session. */
  }
}
