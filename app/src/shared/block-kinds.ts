import type { DocumentBlockKind } from './page-document.js'

/*
Which block kinds each page home stores (the approved project model, step 4).

A home is where a body lives: a Folder's Main page (`work`), a facet's page
(`doc`, and `results` for the Results facet), a Task's page (`task`) and a
Shelf's page (`shelf`). Posts are comments, not blocks, and are not here.

`store` is what the server accepts, and it is exactly the four refusal lists
the appliers carried before this file: a kind is refused where it was refused
and nowhere else. It must never narrow, or blocks people already have stop
saving. What the `/` menu offers is a separate, shorter question.
*/
export const BLOCK_HOMES = ['work', 'doc', 'results', 'task', 'shelf'] as const
export type BlockHome = (typeof BLOCK_HOMES)[number]

const EVERYWHERE = BLOCK_HOMES

export const BLOCK_KINDS: Readonly<Record<DocumentBlockKind, { readonly store: readonly BlockHome[] }>> = {
  // A Section is Work grouping; a Shelf has always stored one, flat.
  section: { store: ['work', 'shelf'] },
  paragraph: { store: EVERYWHERE },
  heading1: { store: EVERYWHERE },
  heading2: { store: EVERYWHERE },
  heading3: { store: EVERYWHERE },
  image: { store: EVERYWHERE },
  // A folder reference is Main's to carry, and a Shelf's Folder rows are one.
  folder_ref: { store: ['work', 'shelf'] },
  bullet: { store: EVERYWHERE },
  numbered: { store: EVERYWHERE },
  checklist: { store: EVERYWHERE },
  toggle: { store: EVERYWHERE },
  quote: { store: EVERYWHERE },
  callout: { store: EVERYWHERE },
  code: { store: EVERYWHERE },
  file: { store: EVERYWHERE },
  audio: { store: EVERYWHERE },
  video: { store: EVERYWHERE },
  diagram: { store: EVERYWHERE },
  divider: { store: EVERYWHERE },
  // Wave 2: a sub-page lives in a Folder's Main document alone.
  page: { store: ['work'] },
  // #213: a native Result belongs to the Results facet alone.
  result: { store: ['results'] },
}

/** May a block of `kind` be stored on a page of `home`. */
export function allowedIn(kind: DocumentBlockKind, home: BlockHome): boolean {
  return BLOCK_KINDS[kind].store.includes(home)
}

