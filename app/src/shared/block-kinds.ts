import type { DocumentBlockKind } from './page-document.js'

/*
Which block kinds each page home stores (the approved project model, step 4).

A home is where a body lives: a Work page (`work`), a Doc page (`doc`), a
Task's page (`task`) and a Shelf's page (`shelf`). `results` was the Results
facet's home; since step 7 a Results tab is a Doc page, and the name stays
only for clients that still send it. Posts are comments, not blocks, and are
not here.

Each kind maps to the homes that store it. That is what the server accepts.
It must never narrow, or blocks people already have stop saving. Since step 7
a Doc page stores everything a Work page does and more: its pages came from
the facet homes and from Work's page links, and must keep all of them.

What each home's `/` menu offers is the client's (`SLASH_MENUS` in
`slash-items.tsx`); markdown shortcuts and Turn into still make any kind here.
*/
export const BLOCK_HOMES = ['work', 'doc', 'results', 'task', 'shelf'] as const
export type BlockHome = (typeof BLOCK_HOMES)[number]

const EVERYWHERE = BLOCK_HOMES

export const BLOCK_KINDS: Readonly<Record<DocumentBlockKind, readonly BlockHome[]>> = {
  // A Section is Work grouping; a Shelf has always stored one, flat.
  section: ['work', 'doc', 'shelf'],
  paragraph: EVERYWHERE,
  heading1: EVERYWHERE,
  heading2: EVERYWHERE,
  heading3: EVERYWHERE,
  image: EVERYWHERE,
  // A folder reference is Main's to carry, and a Shelf's Folder rows are one.
  folder_ref: ['work', 'doc', 'shelf'],
  bullet: EVERYWHERE,
  numbered: EVERYWHERE,
  checklist: EVERYWHERE,
  toggle: EVERYWHERE,
  quote: EVERYWHERE,
  callout: EVERYWHERE,
  code: EVERYWHERE,
  file: EVERYWHERE,
  audio: EVERYWHERE,
  video: EVERYWHERE,
  diagram: EVERYWHERE,
  divider: EVERYWHERE,
  // Wave 2: a sub-page's home block lives in its parent page's document.
  page: ['work', 'doc'],
  // #213: a Result lives on a Doc page (the Results tab).
  result: ['doc', 'results'],
}

/** May a block of `kind` be stored on a page of `home`. */
export function allowedIn(kind: DocumentBlockKind, home: BlockHome): boolean {
  return BLOCK_KINDS[kind].includes(home)
}
