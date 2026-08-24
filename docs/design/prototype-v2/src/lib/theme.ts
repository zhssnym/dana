/*
Light, dark, or whatever the machine says.

Imran's brief of 2026-08-23, item 6: a dark-mode toggle, scoped to placement.

**Three states, not two**, and the third is the one people actually want. A
two-way switch forces a person to re-choose every time their machine changes at
sunset, and it means Dana disagrees with every other window on the screen for
half the day. "System" is the honest default and is what the OS has been able to
tell us since 2019.

**The choice is applied to the document, not passed down.** One attribute on
`<html>`, which the token file answers — so nothing in the tree has to know the
theme exists and no component can be the one that forgot. It is also why the
theme survives a reload without a flash: the attribute is set from storage
before React mounts, in `applyStoredTheme`.

Lane 2 is smaller than usual: this is a `user_settings` column, and until it is,
`localStorage` is the right stand-in — a theme is per-device by nature, and
somebody with a dark laptop and a light phone means it, so it may not port to a
single account-wide column without a question.
*/

import { useSyncExternalStore } from "react"

export const THEME_STORAGE_KEY = "dana:prototype-theme"
const THEME_EVENT = "dana:prototype-theme-change"

export type ThemeChoice = "system" | "light" | "dark"

function read(): ThemeChoice {
  if (typeof window === "undefined") return "system"
  const value = window.localStorage.getItem(THEME_STORAGE_KEY)
  return value === "light" || value === "dark" ? value : "system"
}

let cached: ThemeChoice | null = null

function snapshot(): ThemeChoice {
  if (!cached) cached = read()
  return cached
}

/* What the choice resolves to right now — "system" asks the machine. */
export function resolvedTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice !== "system") return choice
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

function apply(choice: ThemeChoice) {
  const root = document.documentElement
  /* The light theme is the bare `:root`, so light means removing the
     attribute rather than setting it to something — one place defines the
     default and it is the token file. */
  if (resolvedTheme(choice) === "dark") root.setAttribute("data-theme", "dark")
  else root.removeAttribute("data-theme")
}

/*
Called before React mounts, from `main`.

Without it the first paint is the light theme and the second is dark, which is
the white flash every product that stores a theme has to solve exactly once.
*/
export function applyStoredTheme() {
  if (typeof window === "undefined") return
  apply(read())
  /* And it keeps following the machine while the choice is "system": somebody
     whose laptop turns dark at sunset should not have to reload. */
  window
    .matchMedia?.("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (snapshot() === "system") apply("system")
    })
}

export function setTheme(choice: ThemeChoice) {
  cached = choice
  if (choice === "system") window.localStorage.removeItem(THEME_STORAGE_KEY)
  else window.localStorage.setItem(THEME_STORAGE_KEY, choice)
  apply(choice)
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: choice }))
}

export function useTheme(): ThemeChoice {
  return useSyncExternalStore(
    (notify) => {
      function onChange(event: Event) {
        cached = (event as CustomEvent<ThemeChoice>).detail ?? read()
        notify()
      }
      function onStorage() {
        cached = null
        notify()
      }
      window.addEventListener(THEME_EVENT, onChange)
      window.addEventListener("storage", onStorage)
      return () => {
        window.removeEventListener(THEME_EVENT, onChange)
        window.removeEventListener("storage", onStorage)
      }
    },
    snapshot,
    () => "system" as const,
  )
}
