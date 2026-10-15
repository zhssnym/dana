// Shared display definitions for the existing in-app sheet and the public help site.
// Each listed chord must be checked against its handler when this file changes.
export type Shortcut = { readonly keys: readonly string[]; readonly also?: readonly string[]; readonly what: string }
export type ShortcutGroup = { readonly title: string; readonly rows: readonly Shortcut[] }

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'Anywhere',
    rows: [
      { keys: ['MOD', 'K'], also: ['/'], what: 'Search' },
      { keys: ['Esc'], what: 'Close what is open' },
    ],
  },
  {
    title: 'Outside a text field',
    rows: [
      { keys: ['MOD', 'Z'], what: 'Undo the last thing you did' },
      { keys: ['MOD', 'B'], what: 'Show or hide the sidebar' },
      { keys: ['?'], what: 'Keyboard shortcuts' },
    ],
  },
  {
    title: 'In a list of tasks',
    rows: [
      { keys: ['N'], what: 'New task' },
      { keys: ['↑', '↓'], what: 'Move between tasks' },
      { keys: ['Enter'], what: 'Open the task' },
      { keys: ['Space'], what: 'Complete the task' },
    ],
  },
  {
    title: 'In an open task',
    rows: [
      { keys: ['MOD', 'Shift', 'J'], what: 'Next task' },
      { keys: ['MOD', 'Shift', 'K'], what: 'Previous task' },
    ],
  },
  {
    title: 'In the sidebar',
    rows: [
      { keys: ['↑', '↓'], what: 'Move between pages' },
      { keys: ['←', '→'], what: 'Fold or unfold a page' },
      { keys: ['F2'], what: 'Rename the page' },
    ],
  },
]

export function shortcutKey(key: string, mac: boolean): string {
  return key === 'MOD' ? (mac ? '⌘' : 'Ctrl') : key
}
