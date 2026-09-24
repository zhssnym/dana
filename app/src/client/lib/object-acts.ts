/*
What you can do to a Dana object, declared once.

Open as a tab, copy link, duplicate, delete into a Trash, save as a workflow,
read the history, consistently everywhere. They are not six features. They are
six **acts**, and when every overflow menu is written by hand, surface by
surface, an act exists exactly where somebody remembered to add it: a folder's
sidebar row and its own page would offer different things, and where you stood
would decide what you could do to the same folder. A behaviour settled for an
object belongs to that object's contract rather than to each menu's diligence.

**What is declared here and what is not.** This file owns the *vocabulary*: for
each kind of object, which acts exist, what they are called, what they are drawn
with, and in what order and grouping they appear. It owns no behaviour at all,
because only a surface knows how to run one. Copy link on a sidebar row and Copy
link on a window bar are the same act with different plumbing, and only the
second half differs.

**An act with no handler does not appear.** That is the whole safety property: a
surface that cannot perform something simply does not pass it, so a menu can
never show an item that does nothing, a rule made structural rather than
remembered. It is also why the list may name acts nothing supplies yet, and why
the role split of 9.6 needs no branch in this file: a member's surface passes
`leave` and no `delete`, an owner's the reverse, and the contract enforces
neither because the server does (10.2).

**Order is data.** The groups run: reach it, change it, copy it, stop it,
destroy it. Destructive last and behind a separator, everywhere, because a menu
whose dangerous item moves is a menu you cannot use without reading. AC-246
names the order and not only the set.

**An ellipsis promises a further step**, so a label carrying one is a claim
about what the press does, and each act that opens a confirmation or a picker
rather than acting carries one. 9.1 carries the rule beneath its names table.
AC-217, AC-246, AC-180 and AC-183 read them.

**The folder's shelf move is "Move to collection".** Shelves are called
Collections on screen (wave 2, Hassan's decision 2); the identifiers keep the
old word. The act and the thing it moves a folder onto carry one name. "Move
to…" is the other move: into another page, in the page tree.

There is no "Label and colour": the name collides with a shelf, and the mark on
the page already opens the picker. An overflow menu is for what is *not* on the
surface.
*/

import type { ReactNode } from 'react'

import {
  Ban,
  Copy,
  Download,
  FolderInput,
  Fullscreen,
  History,
  Link2,
  LogOut,
  OpenInNewTab,
  Pencil,
  Plus,
  RotateCcw,
  SunMedium,
  Trash2,
  UserRoundCheck,
} from './icons.js'
import type { LucideIcon } from './icons.js'

/*
The three things a person makes and owns.

A **task** is the work, a **folder** holds tasks, and a **shelf** holds folders
and is a personal label, which is why it is here at all: it is a thing you name,
arrange and throw away, so it takes the same acts.

System views are deliberately absent. A person did not make Today and cannot
duplicate or delete it; what it offers is pinning, which 9.7's Settings owns.
*/
export type ObjectKind = 'task' | 'folder' | 'shelf'

export type ActKey =
  /* "Reaching the object" rather than "open in a tab": a folder offers one way
     in and a task offers four (9.3's dialog, panel, tab and page), so the act
     is the reaching and the label says how per kind. */
  | 'open'
  | 'history'
  | 'rename'
  /* A new page inside this one. The sidebar row draws it as a "+" under a
     pointer; on a touch screen, which has no hover, it lives in the "…". */
  | 'add-page'
  | 'move'
  /* A folder's cover picture: the folder page owns its dialog,
     so the Library row reaches them through `?folder-action=`. */
  | 'cover'
  /* The owner's hand-on (9.6), in the leave group: it ends their custody. */
  | 'transfer'
  | 'pull'
  | 'unpull'
  /* 'move' and 'make-folder' have no spec in any list now: nothing on screen
     reached them. The keys remain for task-row.tsx's unused `Actions`. */
  | 'make-folder'
  | 'copy-link'
  | 'duplicate'
  | 'workflow'
  /* Import a Dana file under this page (round 3). */
  | 'import'
  | 'abandon'
  | 'restore'
  /* The member's exit from a shared folder (9.6's role matrix). Its group is
     Abandon's, and for the same reason: it stops your participation and
     destroys nothing, the folder living on for everyone else. */
  | 'leave'
  | 'delete'

export interface ActSpec {
  readonly key: ActKey
  readonly label: string
  readonly icon: LucideIcon
  /**
   * Acts of a kind sit together and a separator falls between groups:
   * 1 reach it, 2 change it, 3 copy it, 4 stop it, 5 destroy it.
   *
   * **Stopping and destroying are two groups and not one.** Abandon says "I am
   * not doing this" and keeps the task; Delete says the task should not exist.
   * `task-row.tsx`'s hand-written menu already separated them, with the note
   * that they "are not neighbours in meaning and should not look like
   * neighbours in the menu", which is a rule about the acts rather than about
   * that menu and therefore belongs here.
   */
  readonly group: 1 | 2 | 3 | 4 | 5
  readonly destructive?: boolean
}

/* The word for the act, per object, because "Delete" alone is the one label a
   person should never have to guess the object of. */
const OBJECT_ACTS: Record<ObjectKind, readonly ActSpec[]> = {
  task: [
    /*
    `Fullscreen` and not `OpenInNewTab`. A task offers four ways in and this act
    is the choosing of one, so the glyph is the one that means "somewhere
    larger"; `OpenInNewTab` is the glyph for the folder's act one list down,
    which offers exactly one destination and is a different thing.
    */
    { key: 'open', label: 'Open in…', icon: Fullscreen, group: 1 },
    { key: 'history', label: 'History', icon: History, group: 1 },
    /* Today membership from the row's own menu, the pair of 7.8's pull and its
       DELETE, offered one at a time the way abandon and restore are. */
    { key: 'pull', label: 'Add to Today', icon: SunMedium, group: 2 },
    { key: 'unpull', label: 'Remove from Today', icon: SunMedium, group: 2 },
    { key: 'copy-link', label: 'Copy link', icon: Link2, group: 3 },
    { key: 'duplicate', label: 'Duplicate', icon: Copy, group: 3 },
    { key: 'abandon', label: 'Abandon', icon: Ban, group: 4 },
    { key: 'restore', label: 'Restore', icon: RotateCcw, group: 4 },
    { key: 'delete', label: 'Delete task', icon: Trash2, group: 5, destructive: true },
  ],
  /*
  **One folder menu, drawn identically in its three homes**: the folder page's
  header "…", the Library row's "…", and a right-click on that row (which opens
  the row's "…"). Every surface passes the same handlers, so the order below is
  the menu; nothing arrives through `extra`. "Open in a new tab" left with the
  tab strip.
  */
  folder: [
    { key: 'history', label: 'History', icon: History, group: 1 },
    /* Rename and Add a page inside are the sidebar row's: on the page itself
       the title is edited in place and `/page` adds a sub-page, so the page
       passes neither. Tabs are managed on the tab strip itself. */
    { key: 'rename', label: 'Rename', icon: Pencil, group: 2 },
    { key: 'add-page', label: 'Add a page inside', icon: Plus, group: 2 },
    { key: 'copy-link', label: 'Copy link', icon: Link2, group: 3 },
    { key: 'duplicate', label: 'Duplicate', icon: Copy, group: 3 },
    /* Notion's pair (round 3): Import brings a file in under this page,
       Export writes this page to a file. The key keeps its old name so the
       sidebar's `?folder-action=workflow` deep link still reaches it. */
    { key: 'import', label: 'Import as sub-page…', icon: FolderInput, group: 3 },
    { key: 'workflow', label: 'Export as template', icon: Download, group: 3 },
    /* Leave and Delete are never offered together: a surface supplies the one
       its viewer's role permits (9.6's matrix), which is the contract's own
       safety property doing the permission work. */
    { key: 'transfer', label: 'Transfer ownership…', icon: UserRoundCheck, group: 4 },
    /* Leave asks first (access goes, no undo), so it keeps its ellipsis;
       Delete goes to Trash with undo and asks nothing. */
    { key: 'leave', label: 'Leave page…', icon: LogOut, group: 4 },
    { key: 'delete', label: 'Delete page', icon: Trash2, group: 5, destructive: true },
  ],
  shelf: [
    { key: 'open', label: 'Open collection', icon: OpenInNewTab, group: 1 },
    { key: 'history', label: 'History', icon: History, group: 1 },
    { key: 'rename', label: 'Rename collection', icon: Pencil, group: 2 },
    /* 9.10: "the page's address is still copyable, an address not being an
       invitation". A shelf is private by construction, so a link opens nothing
       for whoever receives it; the act is copying an address, which is what
       people copy links for most. */
    { key: 'copy-link', label: 'Copy link', icon: Link2, group: 3 },
    { key: 'duplicate', label: 'Duplicate', icon: Copy, group: 3 },
    { key: 'workflow', label: 'Export', icon: Download, group: 3 },
    { key: 'delete', label: 'Delete collection…', icon: Trash2, group: 5, destructive: true },
  ],
}

/** 9.6's leave confirm, one sentence (AC-183). FolderPage keeps its own copy
 * of this string; it could import this one. */
export function leaveFolderConfirm(name: string): string {
  return (
    `Leave ${name}? You lose access to it, and anything in it assigned to ` +
    'you becomes unassigned.'
  )
}

/*
How a surface supplies an act: a function, or a submenu to choose from.

Most acts are a press. "Move to group" is a choice, and the groups are few
enough that naming them inline is a press shorter than a dialog, which is why
the sidebar already drew it that way. The *act* is still declared above, with
its name, glyph and place in the order; only the picker is the surface's, in
the same way a handler is.
*/
export type ActHandler = (() => void) | { readonly choose: ReactNode }

export type ActHandlers = Partial<Record<ActKey, ActHandler>>

export interface DrawnAct {
  readonly spec: ActSpec
  readonly handler: ActHandler
  readonly startsGroup: boolean
}

/*
The acts this surface can actually perform, in order, with the separators
worked out, which is everything a menu needs to draw itself.

Filtering by handler rather than by a list of exceptions is the point: a
surface says what it can do by supplying it, and cannot accidentally offer
what it cannot.
*/
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
