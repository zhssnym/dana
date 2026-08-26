/*
The acts a folder supports, performed.

`lib/object-acts` says *what* a folder can have done to it; this does two of
them. They live in a module rather than inside a component for the reason the
brief of 2026-08-23 kept running into: an act belongs to the object, and the
moment it lives in one screen the next screen either goes without it or writes
a second copy that drifts. Copy link is wanted from the sidebar and from the
folder page's bar; duplicate is wanted from both, and from a Shelf page next.

Everything here writes the same storage the sidebar reads and announces itself
on the same events, so a folder made by this appears without anybody being
told — which is what `folderLibrary` already assumes and what the created
folders store was missing.
*/

import { folderLibrary } from "@/lib/folder-library"
import {
  readPrototypeFolderPresentation,
  restorePrototypeFolder,
  savePrototypeFolderIdentity,
} from "@/lib/folder-presentation"
import {
  readPrototypeFolderMemberships,
  savePrototypeFolderMemberships,
} from "@/lib/folder-membership"
import { notice } from "@/lib/undo"

export const CREATED_FOLDERS_STORAGE_KEY = "dana:prototype-created-folders"
/*
Announced, because a folder can now be made from three places.

The shell held its created folders in component state and updated them itself,
which worked while it was the only maker. Duplicate is a second, and a Shelf
page will be a third, so the store says when it changes and whoever is showing
folders listens — the arrangement every other store here already uses.
*/
export const PROTOTYPE_FOLDERS_EVENT = "dana:prototype-folders-change"
/*
"Make a copy of this." Said rather than done.

One event for both kinds, because it is one idea: the surface raising it can
always *name* the thing and can never *hold* the result. A folder's Duplicate
is raised from a sidebar row inside `app-shell`, which has no task list; a
task's is raised from a row nested five components deep, and threading a prop
down to it through ten screens would be the same coupling with more typing.

The folder half computes its new name here, because naming a copy needs only
the folder library. The task half cannot: it needs the task.
*/
export const PROTOTYPE_DUPLICATE_EVENT = "dana:prototype-duplicate-folder"
/*
"Save this folder as a workflow." Raised from both folder menus, answered by
the shell — the same arrangement Duplicate uses and for the same reason: the
file needs the task list and neither menu can see it.
*/
export const PROTOTYPE_WORKFLOW_EVENT = "dana:prototype-save-workflow"

export function saveFolderAsWorkflow(name: string) {
  window.dispatchEvent(
    new CustomEvent(PROTOTYPE_WORKFLOW_EVENT, { detail: { name } }),
  )
}

export type DuplicateRequest =
  | { kind: "folder"; from: string; to: string }
  | { kind: "task"; subject: string }

export interface CreatedFolder {
  name: string
  color: string
  pending: number
}

export function readCreatedFolders(): CreatedFolder[] {
  if (typeof window === "undefined") return []
  try {
    const value = JSON.parse(
      window.localStorage.getItem(CREATED_FOLDERS_STORAGE_KEY) ?? "[]",
    )
    if (!Array.isArray(value)) return []
    return value.filter(
      (folder): folder is CreatedFolder =>
        typeof folder?.name === "string" &&
        typeof folder?.color === "string" &&
        typeof folder?.pending === "number",
    )
  } catch {
    return []
  }
}

export function saveCreatedFolders(folders: CreatedFolder[]) {
  window.localStorage.setItem(CREATED_FOLDERS_STORAGE_KEY, JSON.stringify(folders))
  window.dispatchEvent(new CustomEvent(PROTOTYPE_FOLDERS_EVENT, { detail: folders }))
}

/*
A folder's own address, which is the thing Copy link copies.

Every part of Dana already navigates by this URL — the sidebar, the search
overlay, a row's folder chip — so the link a person sends is the string the
product uses internally rather than a second scheme invented for sharing.
*/
export function folderLink(name: string) {
  const url = new URL(window.location.href)
  url.search = ""
  url.hash = ""
  url.searchParams.set("state", "folder")
  url.searchParams.set("folder", name)
  return url.toString()
}

export function copyFolderLink(name: string) {
  void navigator.clipboard?.writeText(folderLink(name)).catch(() => {})
  /* Said in the bar with no Undo beside it: copying changes nothing, and an
     Undo there would be a control that cannot mean anything (DES-144). */
  notice("Link copied")
}

/*
A copy of a folder, and what a copy is.

It takes the original's **look** — the glyph, the colour, the cover — because
that is what makes a folder recognisable, and a duplicate that arrives plain is
one you have to dress again before it is useful. It takes its **shelf**, because
a copy of something on a shelf belongs beside it.

It takes its **contents** — the tasks, the sections, the paragraphs, and which
task sits under which heading. `lib/folder-duplicate` owns those rules and the
reasoning for them, including the two things a copy deliberately does not take
(a grant, and progress) and what it does to due dates.

The split is deliberate: this function makes the *folder*, which it can do
alone; the contents need the task list, which only the shell has. So it says
what it did and the shell answers — the same seam `prototype-delete-folder`
already uses, and the reason the sidebar's Duplicate works at all, since
`app-shell` has no tasks to hand anybody.

"X copy", then "X copy 2" — the plainest form, and the one every file manager
uses, so nobody has to learn it.
*/
export function duplicateFolder(name: string) {
  const taken = new Set(folderLibrary().map((folder) => folder.name))
  let candidate = `${name} copy`
  let n = 2
  while (taken.has(candidate)) candidate = `${name} copy ${n++}`

  const source = folderLibrary().find((folder) => folder.name === name)
  saveCreatedFolders([
    ...readCreatedFolders(),
    { name: candidate, pending: 0, color: source?.color ?? "var(--color-graphite-900)" },
  ])
  restorePrototypeFolder(candidate)

  const identity = readPrototypeFolderPresentation().identity[name]
  if (identity) savePrototypeFolderIdentity(candidate, identity)

  const membership = readPrototypeFolderMemberships()[name]
  if (membership?.label) {
    savePrototypeFolderMemberships({ [candidate]: membership })
  }

  /* Now the contents. Whoever holds the tasks finishes the job and records it,
     because the undo has to take back the folder *and* its copied tasks in one
     press — two entries would mean two presses to undo one act. */
  window.dispatchEvent(
    new CustomEvent(PROTOTYPE_DUPLICATE_EVENT, {
      detail: { kind: "folder", from: name, to: candidate } satisfies DuplicateRequest,
    }),
  )
  return candidate
}
