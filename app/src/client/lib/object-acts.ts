/*
What you can do to a Dana object, declared once.

The designer's `lib/object-acts.ts`, ported at S17a. Imran's brief of
2026-08-23 asked for six things, open as a tab, copy link, duplicate, delete
into a Trash, save as a workflow, read the history, and asked for them
"consistently everywhere". They are not six features. They are six **acts**,
and the reason each was missing in a different place is that Dana had no
statement of what an object is or of what can be done to one: every overflow
menu was written by hand, surface by surface, so an act existed exactly where
somebody remembered to add it.

**The proof was two menus for one folder, and it was still true of this client
on the day this file was written.** A folder's sidebar row offered "New folder
group" and "Move to group". Its own page offered History, Copy link,
Duplicate, Save as workflow, Rename folder, Transfer ownership and Delete
folder. Where you stood decided what you could do to the same folder. Nothing
was wrong in either file, which is exactly the point: this is DES-154 at the
largest scale the product has, a behaviour settled for an object belonging to
that object's contract rather than to each menu's diligence.

**What is declared here and what is not.** This file owns the *vocabulary*:
for each kind of object, which acts exist, what they are called, what they are
drawn with, and in what order and grouping they appear. It owns no behaviour
at all, because only a surface knows how to run one. Copy link on a sidebar
row and Copy link on a window bar are the same act with different plumbing,
and only the second half differs.

**An act with no handler does not appear.** That is the whole safety property:
a surface that cannot perform something simply does not pass it, so a menu can
never show an item that does nothing, which is DES-144's rule made structural
rather than remembered. It is also why the list may name acts nothing supplies
yet, and why the role split of 9.6 needs no branch in this file: a member's
surface passes `leave` and no `delete`, an owner's the reverse, and the
contract enforces neither because the server does (10.2).

**Order is data.** The groups run: reach it, change it, copy it, stop it,
destroy it. Destructive last and behind a separator, everywhere, because a
menu whose dangerous item moves is a menu you cannot use without reading.
AC-246 asserts the order and not only the set.

**The ellipses are the designer's after all, and 9.1 now says so.** This
paragraph used to read that three of his labels were Dana's instead, and the
first two of the three are overturned by RFC 0005 change control item 44's A1,
on Imran's ruling of 2026-08-26. The old reasoning was that 9.1's names table
fixed the member exit as "Leave folder" exactly and that "two destructive acts
differing only in punctuation" was a difference with no meaning. Both halves
were wrong in the same way: the section said "Leave folder" because nobody had
ever asked it the question, and the punctuation is not decoration. **An
ellipsis promises a further step**, so a label carrying one is a claim about
what the press does, and each of these five opens a confirmation or a picker
rather than acting. 9.1 carries the rule now, beneath its names table, and the
one label the table itself fixes moved with it. AC-217, AC-246, AC-180 and
AC-183 read them, reworked red first at S24 under persona 11.

The third of the three stands and is unrelated: the
folder's move was "Move to group" rather than his "Move to shelf" until S17b,
because that was what AC-180 asserted on the surface that had it and because
shelves reaching the Library was that row rather than S17a's. **That row has
landed and this is the one place the word changed**, which is what the sentence
this replaces promised. 9.6 fixes the string, "a member's personal shelf
placement is 'Move to shelf' on the row"; the Library's groups are the viewer's
shelves now rather than the bare `folder_members.label` strings they were, so
the act and the thing it moves a folder onto carry one name. AC-180 and AC-246
moved with it, in S17b's criteria commit and red, which is item 15's
sequencing.

His "Label and colour" is absent, and its removal is his own, recorded so it
is not reintroduced: the name collided with a shelf, and what remained of it
was already on the page as the mark that opens the picker (DES-130). An
overflow menu is for what is *not* on the surface.
*/

import type { ReactNode } from 'react'

import {
  Ban,
  Copy,
  FolderInput,
  Folders,
  Fullscreen,
  History,
  Link2,
  LogOut,
  OpenInNewTab,
  Pencil,
  RotateCcw,
  Trash2,
  Workflow,
} from './icons.js'
import type { LucideIcon } from './icons.js'

/*
The three things a person makes and owns.

A **task** is the work, a **folder** holds tasks, and a **shelf** holds folders
and is a personal label (DES-195), which is why it is here at all: it is a
thing you name, arrange and throw away, so it takes the same acts.

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
  | 'move'
  /*
  The seventh ellipsis of change control item 44's A1, and the one act it
  measured as absent from this client: "'Make this a folder…', an act the
  client does not yet carry ... the seventh arrives with its act."

  **It arrives declared and unsupplied at S23**, which is this file's own
  safety property working as designed: "an act with no handler does not
  appear", so no menu offers it until the package that performs it lands.
  That package is RFC 0004's S23a, the hand order and the bulk acts, because
  the gesture behind it is item 44's B4, "two or more tasks held together
  become a folder", which is a composition of `POST /folders` and
  `PATCH /tasks/:id` and belongs with the selection it needs.

  It is declared now rather than then because `components/task-row.tsx` names
  the key in its act map, and a lifted file edited to drop a line is a lifted
  file that has left the strategy. The precedent is `duplicate` beside it,
  declared at S17a and unsupplied ever since for section 13 item 46's reason.

  **Its five neighbours carry the ellipsis too, since S24.** They were left
  without one at S23 deliberately: A1's other five are a change to acts the
  client already draws, AC-246 and AC-217 enumerate those by label, and landing
  half of A1 there would have turned a green case red in a package that did not
  own its rework. S24 owns it and landed them with their criteria.
  */
  | 'make-folder'
  | 'copy-link'
  | 'duplicate'
  | 'workflow'
  | 'abandon'
  | 'restore'
  /* The member's exit from a shared folder (DES-225, 9.6's role matrix). Its
     group is Abandon's, and for the same reason: it stops your participation
     and destroys nothing, the folder living on for everyone else. */
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
    `Fullscreen` and not `OpenInNewTab`, which is the third of the four
    disagreements RFC 0005 change control item 39 measured in this file and
    the last of them to close. A task offers four ways in and this act is the
    choosing of one, so the glyph is the one that means "somewhere larger";
    `OpenInNewTab` is the glyph for the folder's act one list down, which
    offers exactly one destination and is a different thing.
    */
    { key: 'open', label: 'Open in…', icon: Fullscreen, group: 1 },
    { key: 'history', label: 'History', icon: History, group: 1 },
    { key: 'move', label: 'Move to folder…', icon: FolderInput, group: 2 },
    { key: 'make-folder', label: 'Make this a folder…', icon: Folders, group: 2 },
    { key: 'copy-link', label: 'Copy link', icon: Link2, group: 3 },
    { key: 'duplicate', label: 'Duplicate', icon: Copy, group: 3 },
    { key: 'abandon', label: 'Abandon', icon: Ban, group: 4 },
    { key: 'restore', label: 'Restore', icon: RotateCcw, group: 4 },
    { key: 'delete', label: 'Delete task…', icon: Trash2, group: 5, destructive: true },
  ],
  folder: [
    { key: 'open', label: 'Open in a new tab', icon: OpenInNewTab, group: 1 },
    { key: 'history', label: 'History', icon: History, group: 1 },
    { key: 'rename', label: 'Rename', icon: Pencil, group: 2 },
    { key: 'move', label: 'Move to shelf', icon: FolderInput, group: 2 },
    { key: 'copy-link', label: 'Copy link', icon: Link2, group: 3 },
    { key: 'duplicate', label: 'Duplicate', icon: Copy, group: 3 },
    { key: 'workflow', label: 'Save as workflow', icon: Workflow, group: 3 },
    /* Leave and Delete are never offered together: a surface supplies the one
       its viewer's role permits (9.6's matrix), which is the contract's own
       safety property doing the permission work. */
    { key: 'leave', label: 'Leave folder…', icon: LogOut, group: 4 },
    { key: 'delete', label: 'Delete folder…', icon: Trash2, group: 5, destructive: true },
  ],
  shelf: [
    { key: 'open', label: 'Open shelf', icon: OpenInNewTab, group: 1 },
    { key: 'history', label: 'History', icon: History, group: 1 },
    { key: 'rename', label: 'Rename shelf', icon: Pencil, group: 2 },
    /* 9.10: "the page's address is still copyable, an address not being an
       invitation". A shelf is private by construction, so a link opens nothing
       for whoever receives it; the act is copying an address, which is what
       people copy links for most. */
    { key: 'copy-link', label: 'Copy link', icon: Link2, group: 3 },
    { key: 'duplicate', label: 'Duplicate', icon: Copy, group: 3 },
    { key: 'workflow', label: 'Save as workflow', icon: Workflow, group: 3 },
    { key: 'delete', label: 'Delete shelf…', icon: Trash2, group: 5, destructive: true },
  ],
}

/** The glyph a surface's own extra item draws, so those match the contract's. */
export const ACT_EXTRA_ICONS = { group: Folders } as const

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
