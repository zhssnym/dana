/*
Who owns a folder — the fact the v2 menus forgot to ask (DES-225).

Imran, 2026-08-24: "A folder is shared with a team member, can a team member
delete that folder?" The v1 contract answered this (DES-084: owners delete,
members Leave) and the v2 object contract lost the axis — every fixture
folder was the viewer's own, so every menu offered every act and nothing
looked wrong. The rule, restored:

- **Delete and Rename are the owner's.** They change or end the thing for
  everybody, and the folder's name is its address in other people's
  sidebars and conversations.
- **Leave is the member's.** It ends *your* participation and touches nobody
  else's view of the folder. It is not a delete-for-me: the folder is simply
  no longer yours to see, and the way back is an invitation, not a Trash row
  — which is why leaving confirms first while deleting no longer does
  (DES-200's own logic, pointed the other way).
- **Everything else is any member's**: tasks, page blocks, covers and
  descriptions (D1 ruled the page the folder's, member-editable), History,
  Copy link, Duplicate (the copy is private and grant-free, DES-198), Save
  as workflow (structure only, DES-206). Arrangement — shelf, order, label
  colour — is always personal and never gated.

One fixture folder is somebody else's so the member state is real on screen:
**Office is Hassan's**, shared with the viewer. The `?role=member` preview
param still forces the member view of any folder, as it always has.

Lane 2 travels lightly here: the server already knows owners (`folders.
owner_id`) and has the Leave path (7.4); the port's work is supplying
handlers per role, which is DES-197's existing safety property — an act a
surface cannot perform is an act it does not pass.
*/

export const FOREIGN_FOLDERS: Record<string, string> = {
  Office: "Hassan Ali",
}

export function viewerOwnsFolder(name: string): boolean {
  return !(name in FOREIGN_FOLDERS)
}

/* The request travels as an event, the house pattern: rows and pages raise
   it, the shell confirms and performs it (there is exactly one leave dialog,
   like there is one undo bar). */
export const PROTOTYPE_LEAVE_FOLDER_EVENT = "dana:prototype-leave-folder"

export function requestLeaveFolder(name: string) {
  window.dispatchEvent(
    new CustomEvent(PROTOTYPE_LEAVE_FOLDER_EVENT, { detail: { name } }),
  )
}
