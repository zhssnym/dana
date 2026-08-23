/*
How a person has arranged one folder page: its sections and paragraphs, and
which section each task sits in.

Imran, 2026-08-22: "When you create a section and then you leave the page, in
returning to page the section is gone." It did. Sections lived in component
state seeded from a fixture, and the shell navigates by a full page load, so
every section somebody made died at the first click on the sidebar.

That was fine while a section was a drawing. It stopped being fine the moment
a section became something you *arrange* — something you name, dress with a
glyph, reorder, and drag tasks into. A folder's glyph, colour, cover and
description have persisted since DES-130; a section is the same kind of thing,
a person's own arrangement of their own folder rather than a task. Holding one
in a store and the other in memory is a distinction only the implementation
can feel.

Kept beside the identities and in the same shape, one entry per folder, so the
two can be reasoned about together and cleared together.

**Lane 2 travels with it, exactly as it does for the cover** (DES-105): there
is no column for a section, no ordering column, and no membership table. What
this proves is that the *design* wants them, which is the argument the RFC
will have to make. `localStorage` is a prototype's stand-in for that column
and may not be ported as though it were storage.
*/

export const PROTOTYPE_FOLDER_LAYOUT_STORAGE_KEY = "dana:prototype-folder-layout"

export interface FolderLayout<Item> {
  items: Item[]
  /* taskId → sectionId. A task with no entry is in no section. */
  assign: Record<string, string>
}

type LayoutStore = Record<string, FolderLayout<unknown>>

function readStore(): LayoutStore {
  if (typeof window === "undefined") return {}
  try {
    const value = JSON.parse(
      window.localStorage.getItem(PROTOTYPE_FOLDER_LAYOUT_STORAGE_KEY) ?? "{}",
    )
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as LayoutStore)
      : {}
  } catch {
    return {}
  }
}

/*
What is stored for this folder, or nothing.

Generic over the item so this module never has to know what a section is —
that shape belongs to the page and would otherwise have to be declared twice,
which is the fault half this session has been undoing.
*/
/*
What a folder's page starts as, before anybody has arranged it.

This lived in `folder-page-v2` as a module const, which was fine while the page
was the only thing that ever read it. Duplicate is the second reader, and it
found the hole immediately: a folder's sections only reached this store after
somebody had *opened* the folder, so duplicating Travel without visiting it
first copied a page with nothing on it. The fixture belongs beside the store it
seeds, not inside one of the screens that reads it.

Typed loosely on purpose — the shape of an item is the page's business, exactly
as `readFolderLayout` is generic for the same reason.
*/
export const FOLDER_LAYOUT_SEEDS: Record<string, FolderLayout<unknown>> = {
  Travel: {
    items: [
      {
        kind: "paragraph",
        paragraph: {
          id: "travel-note",
          text: "Venue and catering are settled — invitations and transport are the open fronts.",
        },
      },
      /* A second paragraph, so the page shows two of them running on. The gap
         between consecutive prose is a thing this page has to get right and
         had twice got wrong, and a fixture with one paragraph could never
         show it (Imran, 2026-08-23). */
      {
        kind: "paragraph",
        paragraph: {
          id: "travel-note-2",
          text: "Sara is holding the guest list until the transport quote comes back.",
        },
      },
      { kind: "section", section: { id: "venue", name: "Venue & vendors" } },
      { kind: "section", section: { id: "invites", name: "Invitations" } },
    ],
    assign: {
      "task-4": "venue",
      "task-6": "venue",
      "task-14": "invites",
      "task-15": "invites",
    },
  },
}

export function readFolderLayout<Item>(
  folderName: string,
): FolderLayout<Item> | null {
  const stored = readStore()[folderName] ?? FOLDER_LAYOUT_SEEDS[folderName]
  if (!stored || !Array.isArray(stored.items)) return null
  return {
    items: stored.items as Item[],
    assign:
      stored.assign && typeof stored.assign === "object"
        ? (stored.assign as Record<string, string>)
        : {},
  }
}

export function saveFolderLayout<Item>(
  folderName: string,
  layout: FolderLayout<Item>,
) {
  if (typeof window === "undefined") return
  const next = { ...readStore(), [folderName]: layout }
  window.localStorage.setItem(
    PROTOTYPE_FOLDER_LAYOUT_STORAGE_KEY,
    JSON.stringify(next),
  )
}
