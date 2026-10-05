// A folder's mark wherever a folder is named. It looks folders up by name, so two
// folders with one name resolve to the first.

import { useFolders } from '../api/queries.js'
import { publishedFolders } from '../lib/folder-library.js'
import { folderMark } from '../parts/presenters.js'
import type { IconProps, LucideIcon } from '../lib/icons.js'
import type { Folder } from '../../shared/folders.js'

// A task with no folder is in Desk; resolved here so every call site agrees.
export const DEFAULT_FOLDER_NAME = 'Desk'

export function folderNameOf(name: string | undefined): string {
  return name?.trim() ? name : DEFAULT_FOLDER_NAME
}

/** A viewer whose list has not arrived gets the plain glyph rather than a wrong one. */
function folderNamed(name: string, folders: readonly Folder[]): Folder | undefined {
  return folders.find((candidate) => candidate.name === name)
}

export function useFolderMark(
  name: string | undefined,
  // A folder the person never styled keeps the colour the row already had.
  fallbackColor?: string,
): { Icon: LucideIcon; color: string | undefined } {
  const folders = useFolders()
  const resolved = folderNameOf(name)
  const folder = folderNamed(resolved, folders.data ?? [])
  const mark = folderMark(folder)
  return {
    Icon: mark.icon,
    color: folder === undefined ? fallbackColor : mark.color,
  }
}

// Without a hook, for icon props and `.map` callers. It reads the store directly,
// so it does not re-render when the identity changes.
export function folderMarkFor(name: string | undefined): LucideIcon {
  const resolved = folderNameOf(name)
  return folderMark(folderNamed(resolved, publishedFolders())).icon
}

export function FolderMark({
  name,
  color,
  className = 'size-4',
  strokeWidth = 1.75,
}: {
  name: string | undefined
  color?: string
  className?: string
  strokeWidth?: number
}): React.JSX.Element {
  const mark = useFolderMark(name, color)
  const style: IconProps['style'] = mark.color ? { color: mark.color } : undefined
  return (
    <mark.Icon
      className={className}
      style={style}
      strokeWidth={strokeWidth}
      aria-hidden="true"
    />
  )
}
