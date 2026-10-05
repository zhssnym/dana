// The acts each Dana object offers: label, glyph, order and group. An act appears only
// where a surface supplies a handler, so a menu never shows a dead item. Destructive acts
// come last (AC-246); an ellipsis marks an act that opens a further step.

import type { ReactNode } from 'react'

import {
  Ban,
  Box,
  Copy,
  Download,
  Fullscreen,
  History,
  Link2,
  LogOut,
  OpenInNewTab,
  Pencil,
  RotateCcw,
  SunMedium,
  Trash2,
} from './icons.js'
import type { LucideIcon } from './icons.js'
import { showToast } from '../state/toasts.js'

// A project is a Library root; a folder here is a page inside one. They share acts but
// not the list: only a project exports.
export type ObjectKind = 'task' | 'project' | 'folder' | 'shelf'

export type ActKey =
  // The act is reaching the object; the label says how, per kind.
  | 'open'
  // Opens another workspace tab, separate from ordinary `open` navigation.
  | 'open-tab'
  | 'history'
  | 'rename'
  // A page inside this one; the sidebar shows it as a hover "+", touch puts it in the "…".
  | 'add-page'
  | 'move'
  // The folder page owns the cover dialog; the Library row reaches it via `?folder-action=`.
  | 'cover'
  // The owner's hand-on, in the leave group: it ends their custody.
  | 'transfer'
  | 'pull'
  | 'unpull'
  // No list offers 'move' or 'make-folder' now.
  | 'make-folder'
  | 'copy-link'
  | 'duplicate'
  // Download the project as a Dana file, the one the Library's import reads.
  | 'export'
  | 'archive'
  // No list offers it now: the Library's import is the one way a file comes in.
  | 'import'
  | 'abandon'
  | 'restore'
  // A member's exit: it stops participation and destroys nothing, so it groups with Abandon.
  | 'leave'
  | 'delete'

export interface ActSpec {
  readonly key: ActKey
  readonly label: string
  readonly icon: LucideIcon
  /**
   * Groups: 1 reach, 2 change, 3 copy, 4 stop, 5 destroy. Stopping keeps the object;
   * destroying does not, so they are separate groups.
   */
  readonly group: 1 | 2 | 3 | 4 | 5
  readonly destructive?: boolean
}

// The label names the object, so "Delete" is never ambiguous.
const OBJECT_ACTS: Record<ObjectKind, readonly ActSpec[]> = {
  task: [
    // `Fullscreen`: choosing one of the ways in; the workspace-tab act is the exact destination.
    { key: 'open', label: 'Open in…', icon: Fullscreen, group: 1 },
    { key: 'open-tab', label: 'Open in new tab', icon: OpenInNewTab, group: 1 },
    { key: 'history', label: 'History', icon: History, group: 1 },
    // Today membership, offered one at a time like abandon and restore.
    { key: 'pull', label: 'Add to Today', icon: SunMedium, group: 2 },
    { key: 'unpull', label: 'Remove from Today', icon: SunMedium, group: 2 },
    { key: 'copy-link', label: 'Copy link', icon: Link2, group: 3 },
    { key: 'duplicate', label: 'Duplicate', icon: Copy, group: 3 },
    // The key keeps its stored word; the screen says Drop.
    { key: 'abandon', label: 'Drop', icon: Ban, group: 4 },
    { key: 'restore', label: 'Restore', icon: RotateCcw, group: 4 },
    { key: 'delete', label: 'Delete task', icon: Trash2, group: 5, destructive: true },
  ],
  // One list for the header "…", the Library row "…" and its right-click. Each surface
  // passes only what it does not already show.
  project: [
    { key: 'open-tab', label: 'Open in new tab', icon: OpenInNewTab, group: 1 },
    { key: 'history', label: 'History', icon: History, group: 1 },
    { key: 'rename', label: 'Rename', icon: Pencil, group: 2 },
    { key: 'copy-link', label: 'Copy link', icon: Link2, group: 3 },
    { key: 'duplicate', label: 'Duplicate', icon: Copy, group: 3 },
    { key: 'export', label: 'Export work', icon: Download, group: 3 },
    { key: 'archive', label: 'Archive work', icon: Box, group: 4 },
    // Leave and Delete are never offered together: a surface supplies the one its viewer's
    // role permits. Leave asks first; Delete goes to Trash with undo.
    { key: 'leave', label: 'Leave work…', icon: LogOut, group: 4 },
    { key: 'delete', label: 'Delete work', icon: Trash2, group: 5, destructive: true },
  ],
  folder: [
    { key: 'open-tab', label: 'Open in new tab', icon: OpenInNewTab, group: 1 },
    { key: 'history', label: 'History', icon: History, group: 1 },
    { key: 'rename', label: 'Rename', icon: Pencil, group: 2 },
    { key: 'copy-link', label: 'Copy link', icon: Link2, group: 3 },
    { key: 'duplicate', label: 'Duplicate', icon: Copy, group: 3 },
    { key: 'archive', label: 'Archive work', icon: Box, group: 4 },
    // People belong to the project, so leaving any page of it leaves the project.
    { key: 'leave', label: 'Leave work…', icon: LogOut, group: 4 },
    { key: 'delete', label: 'Delete page', icon: Trash2, group: 5, destructive: true },
  ],
  shelf: [
    { key: 'open', label: 'Open collection', icon: OpenInNewTab, group: 1 },
    { key: 'open-tab', label: 'Open in new tab', icon: OpenInNewTab, group: 1 },
    { key: 'history', label: 'History', icon: History, group: 1 },
    { key: 'rename', label: 'Rename collection', icon: Pencil, group: 2 },
    // A shelf is private, so a copied link opens nothing for anyone else.
    { key: 'copy-link', label: 'Copy link', icon: Link2, group: 3 },
    { key: 'duplicate', label: 'Duplicate', icon: Copy, group: 3 },
    { key: 'delete', label: 'Delete collection…', icon: Trash2, group: 5, destructive: true },
  ],
}

/** The leave confirm, one sentence (AC-183). */
export function leaveFolderConfirm(name: string): string {
  return (
    `Leave ${name}? You lose access to it, and anything in it assigned to ` +
    'you becomes unassigned.'
  )
}

// A press, or a submenu of choices the surface supplies.
export type ActHandler = (() => void) | { readonly choose: ReactNode }

export type ActHandlers = Partial<Record<ActKey, ActHandler>>

export interface DrawnAct {
  readonly spec: ActSpec
  readonly handler: ActHandler
  readonly startsGroup: boolean
}

// The acts this surface can perform, in order, with separators worked out.
export function actsFor(kind: ObjectKind, handlers: ActHandlers): DrawnAct[] {
  const available = OBJECT_ACTS[kind].filter((spec) => handlers[spec.key] !== undefined)
  return available.map((spec, index) => {
    const previous = available[index - 1]
    return {
      spec,
      handler: handlers[spec.key] as ActHandler,
      startsGroup: previous !== undefined && spec.group !== previous.group,
    }
  })
}

/** Copy, then say so once. */
export function copyLink(url: string): void {
  void navigator.clipboard?.writeText(url).then(
    () => {
      showToast('Link copied')
    },
    () => {},
  )
}
