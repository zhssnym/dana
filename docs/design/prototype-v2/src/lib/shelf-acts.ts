/*
The acts a shelf supports, performed.

The third of the family beside `folder-acts` and `task-acts`, and it exists for
the same reason: an act belongs to the object, so the moment it lives in one
screen the next screen either goes without it or writes a second copy.
*/

import { readFolderLayout, saveFolderLayout } from "@/lib/folder-layout"
import {
  readPrototypeFolderPresentation,
  savePrototypeFolderIdentity,
} from "@/lib/folder-presentation"
import { notice } from "@/lib/undo"

/*
Keyed apart from the folders, in the stores the folders already use.

A shelf called Personal and a folder called Personal are different objects and
must not share a cover. The prefix is the cheapest thing that says so. It lives
here rather than in the shelf's screen because the acts need it too — a rename
has to move the page's stores, and a lib that imports from a screen is a
dependency pointing the wrong way.
*/
export function shelfKey(name: string) {
  return `shelf:${name}`
}

/*
A renamed shelf keeps its page.

A shelf's *name* is its membership label, so renaming is the shell's business —
it rewrites the label on every member folder. But the page — cover, icon,
description, blocks — is stored under `shelf:<name>`, and a rename that leaves
those behind is DES-218's bug: the shelf answers to its new name with a page
that has forgotten everything. Both rename paths (the page's own field and the
sidebar dialog) call this, so they cannot drift.
*/
export function moveShelfPage(from: string, to: string) {
  const identity = readPrototypeFolderPresentation().identity[shelfKey(from)]
  if (identity) savePrototypeFolderIdentity(shelfKey(to), identity)
  const layout = readFolderLayout<unknown>(shelfKey(from))
  if (layout) saveFolderLayout(shelfKey(to), layout)
}

/* A shelf's own address (DES-210), the same shape the folder's link uses.
   An address, not an invitation — see the note in `lib/object-acts`. */
export function shelfLink(name: string) {
  const url = new URL(window.location.href)
  url.search = ""
  url.hash = ""
  url.searchParams.set("state", "shelf")
  url.searchParams.set("shelf", name)
  return url.toString()
}

export function copyShelfLink(name: string) {
  void navigator.clipboard?.writeText(shelfLink(name)).catch(() => {})
  notice(`Link to ${name} copied`)
}

/*
A copy of a shelf.

**The arrangement, not the things arranged.** A shelf is a label somebody put
over folders that exist without it (DES-195), so duplicating one makes a second
label with the same page — cover, icon, description, blocks — and *no folders on
it*, because a folder can only be on one shelf and moving them would empty the
original. That is the one place a shelf's copy differs from a folder's, and it
falls out of what a shelf is rather than being a rule to remember.
*/
export const PROTOTYPE_SHELF_DUPLICATE_EVENT = "dana:prototype-duplicate-shelf"

export function duplicateShelf(label: string) {
  window.dispatchEvent(
    new CustomEvent(PROTOTYPE_SHELF_DUPLICATE_EVENT, { detail: { label } }),
  )
}
