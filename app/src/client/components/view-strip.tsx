/*
One option of a "where does this open" choice: a key, its label and its icon.
The strip that once drew these as a row of icon buttons is gone; the shape
stays because the task's open-mode options (`TASK_OPEN_OPTIONS`) are declared
with it.
*/

import type { LucideIcon } from "../lib/icons.js"

export interface ViewStripOption<T extends string> {
  key: T
  label: string
  icon: LucideIcon
  disabled?: boolean
  /* What the tooltip says instead, when the option cannot be chosen yet. */
  disabledLabel?: string
}
