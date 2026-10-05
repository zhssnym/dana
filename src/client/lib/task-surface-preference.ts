// Retired setting. Sign-out still removes the old browser mirror.

/** Retired key: never rename or reuse it. */
const KEY = 'dana.taskSurface'

export function clearTaskOpenMirror(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* Nothing stored is nothing to clear. */
  }
}
