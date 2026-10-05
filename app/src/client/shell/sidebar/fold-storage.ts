/* The folds a viewer leaves in the Library, remembered per browser. */
/* Each shelf's fold, remembered per browser. The key is never renamed. */
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

/* The pages whose sub-pages are folded away, remembered per browser as one
   JSON array of ids. A page is open until somebody folds it, so a sub-page
   just made is visible. The key is never renamed. */
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
