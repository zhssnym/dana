/*
9.7's Appearance preferences reaching the pixels they describe.

RFC 0005 change control item 30 recorded the defect this closes and named it
exactly: 4.19 has carried `theme`, `row_density`, `clock` and `task_open` since
S7, and no surface offered a control for any of them, so "the client persists
four preferences a person has no way to set". S17b built the controls, and this
is the other half of that work, because a control that writes a column and
changes nothing is the same defect one level down.

**Two of the four are applied here and two are read where they are used**, and
which is which follows from what each preference is about.

- **Theme and row density describe how the whole document draws**, so they land
  on the document element as `data-theme` and `data-density` and every surface
  follows through CSS. `styles/tokens.css` has carried a complete dark colourway
  under `[data-theme="dark"]` since DES-205, authored as "a first pass for his
  ruling rather than a settled palette" and reached by nothing: its own comment
  says "no code adds that class". This is the code that adds it.
- **The clock and where a task opens are read at their call sites**, because
  each is a question asked at one moment by one surface rather than a fact about
  the page. `lib/time-format.ts` is the one place a time becomes words, and the
  task-open preference is asked when something opens a task.

**`system` is resolved here rather than left to the stylesheet**, and that is a
choice with a reason. A CSS `prefers-color-scheme` query would follow the device
without any of this, and it cannot express the other two states: a person who
has chosen Light wants Light at night, and a media query has no way to be
overridden by a value that lives in a database. So the resolution is one
function, the attribute is always one of `light` or `dark`, and the stylesheet
never has to know that `system` exists.

**The device is watched while `system` is in force**, because a preference that
follows the device and then stops following it at sunset is worse than one that
never followed it: the person chose *following*, not the value it had when they
chose.
*/

import { useEffect } from 'react'

import type { SettingsBundle } from '../../shared/bundle.js'
import { mirrorTheme } from '../lib/theme.js'

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

/* Through `globalThis` rather than the ambient `document`, which is this
   client's own idiom where a DOM global is reached from a module the server
   tsconfig also compiles. The nesting matters and cost a red run: the root
   element hangs off `document`, not off the window, and a shape that put
   `documentElement` at the top level typechecked perfectly and threw
   "Cannot read properties of undefined" on the first paint. */
function view(): View {
  return globalThis as unknown as View
}

/** What `system` means right now, or the chosen value where one was chosen. */
function resolve(theme: Theme, prefersDark: boolean): 'light' | 'dark' {
  if (theme === 'system') return prefersDark ? 'dark' : 'light'
  return theme
}

/**
 * Puts the viewer's theme and density on the document, and keeps them there.
 *
 * Mounted once, by the shell. The bundle is absent while its read is in
 * flight, and the caller passes 4.19's own defaults rather than nothing, so
 * the first paint is the light comfortable one every account starts on rather
 * than an unstyled one that corrects itself.
 */
export function useAppearance(theme: Theme, density: Density, settled = true): void {
  useEffect(() => {
    const win = view()
    const media = win.matchMedia?.(DARK_QUERY)

    const apply = (): void => {
      win.document.documentElement.setAttribute('data-theme', resolve(theme, media?.matches ?? false))
    }
    apply()
    /* RFC 0005 change control item 43: the bundle's value is mirrored into
       the browser every time it is applied, so the inline script in
       `index.html` can paint the first frame from it. Only once the bundle
       has landed, or the default standing in for it would overwrite the
       mirror with `system` for the length of one read. `system` mirrors as
       `system`, never as what it resolved to. */
    if (settled) mirrorTheme(theme)

    /* Watched only while the choice is to follow: a person on Light has said
       what they want and the device's opinion is not an input any more. */
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
