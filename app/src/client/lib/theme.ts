// Theme choice. The settings column is the truth; localStorage is a pre-paint
// mirror that the inline script in index.html reads. Mirror `system` as `system`,
// never as what it resolved to.
import { useBundle } from '../api/queries.js'
import { mutateApi } from '../api/http.js'
import { queryClient, writeFailureMessage } from '../api/queryClient.js'
import { queryKeys } from '../api/keys.js'
import { getSettingsResponse } from '../../shared/bundle.js'
import { showToast } from '../state/toasts.js'

/** The inline script in `index.html` reads this key. Change both or neither. */
export const THEME_STORAGE_KEY = 'dana:theme'

export type ThemeChoice = 'system' | 'light' | 'dark'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Used while the bundle loads, so the pre-painted frame is not repainted with the default. */
export function mirroredTheme(): ThemeChoice {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

export function mirrorTheme(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice)
  } catch {
    /* A full or blocked store costs the first frame, not the preference. */
  }
}

/** At sign-out, so the next person on this device paints their own. */
export function clearThemeMirror(): void {
  try {
    window.localStorage.removeItem(THEME_STORAGE_KEY)
  } catch {
    /* Nothing stored is nothing to clear. */
  }
}

export function resolvedTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice
  return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light'
}

// Always `light` or `dark`, so the stylesheet never needs to know about `system`.
export function applyTheme(choice: ThemeChoice): void {
  document.documentElement.setAttribute('data-theme', resolvedTheme(choice))
  paintThemeColor(resolvedTheme(choice))
}

/** Keeps the browser chrome (`<meta name="theme-color">`) on the page colour. */
export function paintThemeColor(theme: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#191919' : '#ffffff')
}

export function setTheme(choice: ThemeChoice): void {
  applyTheme(choice)
  mirrorTheme(choice)
  const client = queryClient()
  void mutateApi(getSettingsResponse, {
    method: 'PATCH',
    path: '/settings',
    body: { theme: choice },
  })
    .then((next) => {
      client?.setQueryData(queryKeys.bundle(), next)
      void client?.invalidateQueries()
    })
    .catch((error: unknown) => showToast(writeFailureMessage(error)))
}

export function useTheme(): ThemeChoice {
  const bundle = useBundle()
  return bundle.data?.theme ?? mirroredTheme()
}
