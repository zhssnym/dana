/*
 * Applies theme and density to the document as `data-theme` and `data-density`; clock and task-open are read
 * where used. `system` is resolved here (and the device watched) so the stylesheet only sees `light` or `dark`.
 */

import { useEffect } from 'react'

import type { SettingsBundle } from '../../shared/bundle.js'
import { mirrorTheme, paintThemeColor } from '../lib/theme.js'

type Theme = SettingsBundle['theme']
type Density = SettingsBundle['row_density']

const DARK_QUERY = '(prefers-color-scheme: dark)'

interface View {
  readonly document: {
    readonly documentElement: {
      setAttribute: (name: string, value: string) => void
    }
  }
  readonly matchMedia?: (query: string) => {
    matches: boolean
    addEventListener?: (kind: 'change', handler: () => void) => void
    removeEventListener?: (kind: 'change', handler: () => void) => void
  }
}

/*
 * The root element hangs off `document`, not the window; a flat shape typechecked and threw on first paint.
 * Reached through `globalThis` because the server tsconfig also compiles this module.
 */
function view(): View {
  return globalThis as unknown as View
}

function resolve(theme: Theme, prefersDark: boolean): 'light' | 'dark' {
  if (theme === 'system') return prefersDark ? 'dark' : 'light'
  return theme
}

/** Mounted once, by the shell. The caller passes defaults while the bundle loads. */
export function useAppearance(theme: Theme, density: Density, settled = true): void {
  useEffect(() => {
    const win = view()
    const media = win.matchMedia?.(DARK_QUERY)

    const apply = (): void => {
      const resolved = resolve(theme, media?.matches ?? false)
      win.document.documentElement.setAttribute('data-theme', resolved)
      paintThemeColor(resolved)
    }
    apply()
    /*
     * Mirror the value for `index.html`'s inline first-paint script, only once the bundle has landed. `system`
     * mirrors as `system`.
     */
    if (settled) mirrorTheme(theme)

    /* Watched only while following the device. */
    if (theme !== 'system' || media?.addEventListener === undefined) return undefined
    media.addEventListener('change', apply)
    return () => {
      media.removeEventListener?.('change', apply)
    }
  }, [theme, settled])

  useEffect(() => {
    view().document.documentElement.setAttribute('data-density', density)
  }, [density])
}
