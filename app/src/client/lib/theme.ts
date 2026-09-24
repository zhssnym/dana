/*
Light, dark, or whatever the machine says, over 4.19's `theme` column and a
pre-paint mirror.

The choice is applied to the document, not passed down: one attribute on
`<html>` the token file answers. It survives a reload without a flash because
the attribute is set before React mounts. The column is the record and the
browser copy is a cache that exists to paint one frame.

**Three constraints, each a line below.**

- **The column stays the truth and the mirror is a cache.** `useTheme` answers
  the bundle when it has landed and the mirror only until then, so a stale or
  absent mirror costs one frame and never a wrong preference; the inline script
  in `index.html` reads the mirror and never writes the column.
- **Write-through and single-direction.** `mirrorTheme` is called from
  `shell/appearance.ts` whenever the bundle's value is applied and from
  `setTheme` when a person chooses, and `clearThemeMirror` runs at sign-out so a
  shared device does not paint the previous person's theme.
- **`system` mirrors as `system`**, never as what it resolved to, or a person
  whose choice is to follow their device is silently converted to a fixed theme
  by the first machine they sign in on. The inline script resolves it the same
  way `resolvedTheme` does, by asking the media query.

**The exported names are `useTheme`, `setTheme` and `resolvedTheme`**, which
`settings-page-content.tsx` imports. Applying a stored theme is the inline
script's job, because a module that runs after the bundle has been parsed is
already too late for the frame the flash is on; `shell/appearance.ts` keeps
following the device while the choice is `system`.

**`setTheme` applies before it writes**, so the document changes on the press
and the column catches up: the same order the pin list takes, and for the same
reason, a control whose effect waits on a round trip reads as a control that did
nothing.
*/
import { useBundle } from '../api/queries.js'
import { mutateApi } from '../api/http.js'
import { queryClient, writeFailureMessage } from '../api/queryClient.js'
import { queryKeys } from '../api/keys.js'
import { getSettingsResponse } from '../../shared/bundle.js'
import { showToast } from '../state/toasts.js'

/** The mirror's key, which the inline script in `index.html` reads by the
 *  same spelling. Change both or neither. */
export const THEME_STORAGE_KEY = 'dana:theme'

export type ThemeChoice = 'system' | 'light' | 'dark'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** The mirrored choice, which the shell applies while the bundle is in flight
 *  so the frame the inline script painted is not repainted with the default
 *  before the column answers. */
export function mirroredTheme(): ThemeChoice {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

/** Item 43's write-through: the bundle's value, as chosen, into the browser. */
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

/* What the choice resolves to right now: "system" asks the machine. */
export function resolvedTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice
  return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light'
}

/*
The attribute is always one of `light` or `dark`, which is
`shell/appearance.ts`'s convention: the stylesheet never has to know that
`system` exists, and a test can read one value off the document.
*/
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
