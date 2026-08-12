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
import { CollapsibleSection } from '../states/PageSection.js'

interface LabelGroup {
  readonly label: string
  readonly folders: readonly Folder[]
}

/** Case-insensitive, so "aardvark" and "Aardvark" order together. */
function byName(a: Folder, b: Folder): number {
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
}

/**
 * Every row in this column, in the two states the design gives it.
 *
 * `NavLink` hands its own active state in, which is the only thing that knows
 * which page is open without this file reading the route itself. The active
 * treatment is weight and fill together rather than colour alone, which is the
 * accessibility floor the design states for every state it draws.
 */
function rowClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'shell-sidebar-row shell-sidebar-row-active' : 'shell-sidebar-row'
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

/*
9.1's folder row: "each folder showing color dot, name, pending count". The
dot joins the two that were already here rather than replacing either.

**The colour is data, and that is the whole of why it is written inline.**
`my_color` rides the 7.4 Folder object and is per member, so two people see
different dots on the same folder and one person changes theirs at runtime;
`tokens.css` carries ten folder swatches, and those are the palette a picker
would offer rather than the source of any given folder's dot. 11.4's rule that
tokens.css is the only place a raw colour may appear is about the values the
design fixes, and this is not one of them: no colour is written in this file
at all, and the only way to obey that rule literally here would be to invent a
mapping from a free-form hex onto ten presets, which would paint a folder a
colour its owner did not choose.

**The element renders whether or not there is a colour.** 7.4 makes `my_color`
nullable and 9.1 gives the folder list one shape, so an uncoloured folder
keeps the row every other folder has and simply has nothing painted in it. A
row whose dot appeared only sometimes would be a list that changes shape as
people colour things, which is the opposite of what a dot down the left of a
sidebar is for.

**Hidden from the accessibility tree**, because it is identification and never
the only identification: 9.1 puts the name beside it and the design's own rule
for these swatches is that they always accompany a label or a name. A screen
reader announcing "magenta" before every folder would be reading the paint.
*/
function FolderLink({ folder }: { readonly folder: Folder }): React.JSX.Element {
  return (
    <li>
      <NavLink className={rowClass} to={paths.folder(folder.id)}>
        <span
          className="folder-dot"
          aria-hidden="true"
          style={
            folder.my_color === null ? undefined : { backgroundColor: folder.my_color }
          }
        />
        {/* Truncated rather than wrapped, which is what keeps every row in this
            column exactly one line tall at the design's 32 pixels. The text
            node is untouched by that, so AC-155 still reads the whole name out
            of the link and AC-173 still finds the row by it. */}
        <span className="truncate">{folder.name}</span>
        {/*
        The space is deliberate and is not decoration. This link's accessible
        name is its own text, and wrapping the name and the count in adjacent
        inline elements concatenates them: measured in the browser, the row
        announced "Inbox0" where P8 announced "Inbox 0". A whitespace-only text
        node is not rendered as a flex item, so it restores the announcement
        and costs nothing in the layout.
        */}
        {' '}
        {/* The badge is the pending count and nothing else (8.11, AC-155). The
            completed count is on the same object and is not what this is. */}
        <span className="meta ml-auto">{folder.counts.pending}</span>
      </NavLink>
    </li>
  )
}

/**
 * One personal label group: a named region carrying a control with the same
 * name, which is what 9.1's sections ruling makes a collapsible section.
 *
 * The ruling's table names the sidebar's regions outright, "one per personal
 * label group, named by that label", and its first consequence names these
 * groups among the three things a collapsible section covers. So this is
 * `CollapsibleSection` rather than markup of its own, and what it buys is that
 * a folder link is addressable inside the label group it is under: a folder
 * can sit in one member's group and among another's unlabeled folders, which
 * is what AC-155's fourth case is about.
 *
 * The control's name is the label alone. A count here would make the
 * accessible name something no table fixes and no test can ask for.
 */
function LabelGroupBlock({ group }: { readonly group: LabelGroup }): React.JSX.Element {
  return (
    <li>
      <CollapsibleSection name={group.label} defaultOpen>
        <ul>
          {group.folders.map((folder) => (
            <FolderLink key={folder.id} folder={folder} />
          ))}
        </ul>
      </CollapsibleSection>
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
      {/* The same 13px semibold action tier the navigation rows use, which is
          the design's own rule for this control. */}
      <button
        type="button"
        className="shell-sidebar-row"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        New folder
      </button>
      {open ? (
        <input
          type="text"
          className="input-base"
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
    <nav className="shell-sidebar" aria-label="Pages and folders">
      <ul>
        {sidebarPages
          .filter((page) => page.setting === null || settings?.[page.setting] === true)
          .map((page) => (
            <li key={page.path}>
              {/* `end` on My Day alone: /app is a prefix of every other route
                  here, so without it the app link is active everywhere. */}
              <NavLink className={rowClass} to={page.path} end={page.path === paths.myDay}>
                {page.name}
              </NavLink>
            </li>
          ))}
      </ul>
      {/* 9.1's divider, kept because that section names it, drawn with the
          hairline the design uses between grouped items. */}
      <hr className="menu-separator" />
      {/* The design's section label over the folder list. A `span` and never a
          heading: a heading here would be the first one on every page, and
          AC-172 asserts that an invite row precedes the first heading on My
          Day. Its name is announced by the region it labels either way. */}
      <span className="shell-sidebar-section">Folders</span>
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
      {/* Pushed to the foot of the column, which is where 9.1 puts People and
          Settings and where the design keeps the account block. */}
      <ul className="mt-auto">
        <li>
          <NavLink className={rowClass} to={paths.people}>
            People
          </NavLink>
        </li>
        <li>
          <NavLink className={rowClass} to={paths.settings}>
            Settings
          </NavLink>
        </li>
      </ul>
    </nav>
  )
}
