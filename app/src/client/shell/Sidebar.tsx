/*
9.1's sidebar: the six pages in fixed order, a divider, the folder list, the
"New folder" action, and the Settings link.

Two rules decide everything here, and both are places an implementation goes
wrong quietly.

**Page visibility is a filter over three pages, never over six.** 9.7's Pages
section carries three toggles and one note: "My Day, Tasks, and Planned are
always shown." So the permanent three are listed whatever settings say, and
whatever settings failed to say: a settings read that fails offline leaves the
three visible rather than emptying the sidebar. AC-095's third case is written
against exactly that, and the criterion's parenthesis is the point of the
whole thing, that visibility is a navigation preference and never a
restriction, which is why every page stays at its URL either way.

**The folder list is ordered by this section and not by 7.4.** Frozen 7.4
sorts its response is_default first then lower(name), and 9.1 wants Inbox
pinned, then per-member label groups with labels ascending, then unlabeled
folders by name. A sidebar rendering the response in the order it arrived is
wrong in a way that looks right until two folders disagree about it, which is
what AC-155's first case creates on purpose.

Labels are the viewer's own, from the my_label of 7.4's membership row, so the
same folder is inside a group for one member and among the unlabeled for
another. That is 9.1's "per-member label groups" and AC-023's server half read
from the client side.
*/
import { useState } from 'react'
import { NavLink } from 'react-router'

import type { Folder } from '../../shared/folders.js'
import type { Settings } from '../../shared/me.js'
import { useCreateFolder } from '../api/mutations.js'
import { paths, sidebarPages } from '../routes.js'

interface LabelGroup {
  readonly label: string
  readonly folders: readonly Folder[]
}

/** Case-insensitive, so "aardvark" and "Aardvark" order together. */
function byName(a: Folder, b: Folder): number {
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
}

export function groupFolders(folders: readonly Folder[]): {
  readonly inbox: Folder | null
  readonly groups: readonly LabelGroup[]
  readonly unlabeled: readonly Folder[]
} {
  const inbox = folders.find((folder) => folder.is_default) ?? null
  const rest = folders.filter((folder) => !folder.is_default)
  const byLabel = new Map<string, Folder[]>()
  const unlabeled: Folder[] = []
  for (const folder of rest) {
    const label = folder.my_label
    if (label === null || label === '') {
      unlabeled.push(folder)
      continue
    }
    const bucket = byLabel.get(label)
    if (bucket === undefined) byLabel.set(label, [folder])
    else bucket.push(folder)
  }
  const groups = [...byLabel.entries()]
    .map(([label, members]) => ({ label, folders: [...members].sort(byName) }))
    .sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()))
  return { inbox, groups, unlabeled: [...unlabeled].sort(byName) }
}

function FolderLink({ folder }: { readonly folder: Folder }): React.JSX.Element {
  return (
    <li>
      <NavLink to={paths.folder(folder.id)}>
        {/* The badge is the pending count and nothing else (8.11, AC-155). The
            completed count is on the same object and is not what this is. */}
        {folder.name} {folder.counts.pending}
      </NavLink>
    </li>
  )
}

function LabelGroupBlock({ group }: { readonly group: LabelGroup }): React.JSX.Element {
  const [open, setOpen] = useState(true)
  return (
    <li>
      {/* The control's name is the label alone. A count here would make the
          accessible name something no table fixes and no test can ask for. */}
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {group.label}
      </button>
      {open ? (
        <ul aria-label={group.label}>
          {group.folders.map((folder) => (
            <FolderLink key={folder.id} folder={folder} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/**
 * 9.1's "New folder" action. A disclosure over one name field, because 9.1
 * names the action and specifies no dialog for it, and a control that opens
 * nothing is worse than one that does the smallest real thing.
 */
function NewFolderAction(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const create = useCreateFolder()
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        New folder
      </button>
      {open ? (
        <input
          type="text"
          aria-label="Folder name"
          value={name}
          disabled={create.isPending}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setName('')
              setOpen(false)
              return
            }
            if (event.key !== 'Enter') return
            event.preventDefault()
            const trimmed = name.trim()
            if (trimmed === '') return
            setName('')
            create.mutate({ name: trimmed })
          }}
        />
      ) : null}
    </div>
  )
}

export function Sidebar({
  settings,
  folders,
}: {
  /** Absent while the read is in flight or has failed. */
  readonly settings: Settings | undefined
  readonly folders: readonly Folder[] | undefined
}): React.JSX.Element {
  const { inbox, groups, unlabeled } = groupFolders(folders ?? [])
  return (
    <nav aria-label="Pages and folders">
      <ul>
        {sidebarPages
          .filter((page) => page.setting === null || settings?.[page.setting] === true)
          .map((page) => (
            <li key={page.path}>
              {/* `end` on My Day alone: /app is a prefix of every other route
                  here, so without it the app link is active everywhere. */}
              <NavLink to={page.path} end={page.path === paths.myDay}>
                {page.name}
              </NavLink>
            </li>
          ))}
      </ul>
      <hr />
      <ul>
        {inbox === null ? null : <FolderLink folder={inbox} />}
        {groups.map((group) => (
          <LabelGroupBlock key={group.label} group={group} />
        ))}
        {unlabeled.map((folder) => (
          <FolderLink key={folder.id} folder={folder} />
        ))}
      </ul>
      <NewFolderAction />
      <ul>
        <li>
          <NavLink to={paths.people}>People</NavLink>
        </li>
        <li>
          <NavLink to={paths.settings}>Settings</NavLink>
        </li>
      </ul>
    </nav>
  )
}
