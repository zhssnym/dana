/*
What you can do to a Dana object, declared once.

Imran's brief of 2026-08-23 asked for six things — open as a tab, copy link,
duplicate, delete into a Trash, save as a workflow, read the history — and
asked for them "consistently everywhere". They are not six features. They are
six **acts**, and the reason each is missing in a different place is that Dana
had no statement of what an object is or what can be done to it: every overflow
menu was written by hand, surface by surface, so an act existed exactly where
somebody remembered to add it.

The proof was two menus for one folder. Its **sidebar** row offered Rename,
Label and colour, Move to group and Delete. Its **own page's** overflow offered
Rename, Move to group and Delete — no Label and colour — so where you stood
decided what you could do to the same folder. Nothing was wrong in either file.

This is [[DES-154]] at the largest scale the product has: a behaviour settled
for an object belongs to that object's contract, not to each menu's diligence.

**What is declared here and what is not.** This file owns the *vocabulary*: for
each kind of object, which acts exist, what they are called, what they are
drawn with, and in what order and grouping they appear. It owns no behaviour at
all — a surface supplies the handlers, because only the surface knows how to
run one. Copy link on a sidebar row and Copy link on a page bar are the same
act with different plumbing, and only the second half differs.

**An act with no handler does not appear.** That is the whole safety property:
a surface that cannot perform something simply does not pass it, so a menu can
never show an item that does nothing — [[DES-144]]'s rule, made structural
rather than remembered. It is also why the list can name acts that are not
built yet: nothing supplies them, so nothing draws them.

**Order is data.** The groups run: reach it, change it, copy it, destroy it.
Destructive last and behind a separator, everywhere, because a menu whose
dangerous item moves is a menu you cannot use without reading.
*/

import type { ReactNode } from "react"

import {
  Copy,
  FolderInput,
  History,
  Link2,
  Pencil,
  OpenInNewTab,
  Trash2,
  Workflow,
  type LucideIcon,
} from "@/lib/icons"

/*
The three things a person makes and owns.

A **task** is the work. A **folder** holds tasks. A **shelf** holds folders and
is a personal label ([[DES-195]]) — which is why it is here at all: it is a
thing you name, arrange and throw away, so it takes the same acts even though
it has no id of its own.

System views are deliberately absent. A person did not make Today and cannot
duplicate or delete it; what it offers is pinning, which Settings owns
([[DES-170]]).
*/
export type ObjectKind = "task" | "folder" | "shelf"

export type ActKey =
  | "open-tab"
  | "history"
  | "rename"
  | "move"
  | "copy-link"
  | "duplicate"
  | "workflow"
  | "delete"

export interface ActSpec {
  key: ActKey
  label: string
  icon: LucideIcon
  /* Acts of a kind sit together, and a separator falls between groups:
     1 reach it · 2 change it · 3 copy it · 4 destroy it. */
  group: 1 | 2 | 3 | 4
  destructive?: boolean
}

/* The word for the act, per object, because "Delete" alone is the one label a
   person should never have to guess the object of. */
const OBJECT_ACTS: Record<ObjectKind, ActSpec[]> = {
  task: [
    { key: "open-tab", label: "Open in a new tab", icon: OpenInNewTab, group: 1 },
    { key: "history", label: "History", icon: History, group: 1 },
    { key: "move", label: "Move to folder…", icon: FolderInput, group: 2 },
    { key: "copy-link", label: "Copy link", icon: Link2, group: 3 },
    { key: "duplicate", label: "Duplicate", icon: Copy, group: 3 },
    { key: "delete", label: "Delete task…", icon: Trash2, group: 4, destructive: true },
  ],
  folder: [
    { key: "open-tab", label: "Open in a new tab", icon: OpenInNewTab, group: 1 },
    { key: "history", label: "History", icon: History, group: 1 },
    { key: "rename", label: "Rename", icon: Pencil, group: 2 },
    /*
    "Label and colour" left the contract on 2026-08-23, at Imran's word, and
    the reason is worth keeping because it is two faults rather than one.

    **Its name collided.** "Label" was v1's word for what is now a shelf, so
    the menu offered *Move to shelf* and *Label and colour* one line apart —
    two items claiming one job, and a person reading them would reasonably
    expect two different things.

    **And what remained of it was already on the page.** DES-130 made a
    folder's mark the control for its glyph and colour: it is at the top of
    its own page, it is a button, and it opens the picker. An overflow menu is
    for what is *not* on the surface; an item duplicating a large visible
    control beside it is furniture.

    From the sidebar it never edited anything anyway — it navigated to the
    page and opened the picker, which is what pressing the folder and then its
    mark already does. The URL that did it survives as `?folder-action=
    appearance`, like every other instrument this plan reaches by link.

    If it ever comes back it is called **Icon and colour**, because a menu item
    names an act on the object rather than the dialog it opens.
    */
    { key: "move", label: "Move to shelf", icon: FolderInput, group: 2 },
    { key: "copy-link", label: "Copy link", icon: Link2, group: 3 },
    { key: "duplicate", label: "Duplicate", icon: Copy, group: 3 },
    { key: "workflow", label: "Save as workflow", icon: Workflow, group: 3 },
    { key: "delete", label: "Delete folder…", icon: Trash2, group: 4, destructive: true },
  ],
  shelf: [
    { key: "open-tab", label: "Open in a new tab", icon: OpenInNewTab, group: 1 },
    { key: "rename", label: "Rename shelf", icon: Pencil, group: 2 },
    { key: "copy-link", label: "Copy link", icon: Link2, group: 3 },
    { key: "duplicate", label: "Duplicate", icon: Copy, group: 3 },
    { key: "workflow", label: "Save as workflow", icon: Workflow, group: 3 },
    { key: "delete", label: "Delete shelf…", icon: Trash2, group: 4, destructive: true },
  ],
}

/*
How a surface supplies an act: a function, or a submenu to choose from.

Most acts are a press. "Move to shelf" is a choice — the shelves are few and
naming them inline is a press shorter than a dialog, which is why both folder
surfaces already drew it that way. The *act* is still declared here, with its
name, glyph and place in the order; only the picker is the surface's, in the
same way a handler is.
*/
export type ActHandler = (() => void) | { choose: ReactNode }

export type ActHandlers = Partial<Record<ActKey, ActHandler>>

/*
The acts this surface can actually perform, in order, with separators worked
out — which is everything a menu needs to draw itself.

Filtering by handler rather than by a list of exceptions is the point: a
surface says what it can do by supplying it, and cannot accidentally offer what
it cannot.
*/
export function actsFor(
  kind: ObjectKind,
  handlers: ActHandlers,
): { spec: ActSpec; handler: ActHandler; startsGroup: boolean }[] {
  const available = OBJECT_ACTS[kind].filter((spec) => handlers[spec.key])
  return available.map((spec, index) => ({
    spec,
    handler: handlers[spec.key]!,
    startsGroup: index > 0 && spec.group !== available[index - 1]!.group,
  }))
}
