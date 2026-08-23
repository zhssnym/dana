/*
Every folder a person actually has, in one list.

Imran, 2026-08-22, on the folder chip's menu: "that list should be the real
existing folder library plus the 'New folder' option. It should be also in
other views of the tasks."

He is right and the cause is a fixture that outlived its purpose. `FOLDERS` in
`task-model.ts` is four hardcoded names written for the row lab, where four
plausible folders were all a lab needed. The shell then shipped that lab
constant into the real row and the real card, so the menu you moved a task
with disagreed with the sidebar two centimetres away: it omitted Business,
Ideas and Reading list, omitted every folder the person had made, kept showing
any they had deleted, and used the pre-rename name for any they had renamed.

The real library is assembled from the same four sources the sidebar reads,
in the sidebar's own order:

1. **Desk first**, because the default folder is pinned first everywhere
   (9.1) and is the destination every entry default names.
2. The labelled groups, in their order.
3. The unlabelled folders.
4. Anything the person created this session, which persists in the same
   storage the sidebar reads.

…then renames applied, deletions removed, and each folder's chosen colour
honoured — so the list answers what is true now rather than what was true when
a fixture was written.

This is presentation only. In the shipping product the client would hold
`GET /folders`, which 7.4 already sorts default-first then by name, and this
function is the fixtures-shaped stand-in for exactly that call.
*/

import {
  shellFolderGroups,
  shellInbox,
  shellUnlabelledFolders,
  type ShellFolderFixture,
} from "@/fixtures"
import { readPrototypeFolderPresentation } from "@/lib/folder-presentation"

const CREATED_FOLDERS_STORAGE_KEY = "dana:prototype-created-folders"

function readCreatedFolders(): ShellFolderFixture[] {
  if (typeof window === "undefined") return []
  try {
    const value = JSON.parse(
      window.localStorage.getItem(CREATED_FOLDERS_STORAGE_KEY) ?? "[]",
    )
    if (!Array.isArray(value)) return []
    return value.filter(
      (folder): folder is ShellFolderFixture =>
        typeof folder?.name === "string" && typeof folder?.color === "string",
    )
  } catch {
    return []
  }
}

export interface FolderChoice {
  name: string
  color: string
}

export function folderLibrary(): FolderChoice[] {
  const presentation = readPrototypeFolderPresentation()
  const raw: ShellFolderFixture[] = [
    shellInbox,
    ...shellFolderGroups.flatMap((group) => group.folders),
    ...shellUnlabelledFolders,
    ...readCreatedFolders(),
  ]

  const seen = new Set<string>()
  return raw
    .filter((folder) => !presentation.deleted.includes(folder.name))
    .map((folder) => ({
      /* The name the person sees, which is the renamed one where they
         renamed it. */
      name: presentation.names[folder.name] ?? folder.name,
      color: presentation.identity[folder.name]?.color ?? folder.color,
    }))
    .filter((folder) => {
      if (seen.has(folder.name)) return false
      seen.add(folder.name)
      return true
    })
}
