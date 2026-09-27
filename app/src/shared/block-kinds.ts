import type { DocumentBlockKind } from './page-document.js'

/*
Which block kinds each page home stores (the approved project model, step 4).

A home is where a body lives: a Folder's Main page (`work`), a facet's page
(`doc`, and `results` for the Results facet), a Task's page (`task`) and a
Shelf's page (`shelf`). Posts are comments, not blocks, and are not here.

Each kind maps to the homes that store it. That is what the server accepts,
and it is exactly the four refusal lists the appliers carried before this
file: a kind is refused where it was refused and nowhere else. It must never
narrow, or blocks people already have stop saving.

The short `/` menus per page kind are deferred, and so is any second field
here. The model's menus drop Callout, Toggle, Diagram, File, Subtask and the
Result block from what people are offered, and steps 1-5 change nothing on
screen; the Doc and Task menus also name page kinds and a Checklist that only
steps 6 and 7 bring. Today's menus stay in src/client/components/page/canvas/slash-items.tsx.
*/
export const BLOCK_HOMES = ['work', 'doc', 'results', 'task', 'shelf'] as const
export type BlockHome = (typeof BLOCK_HOMES)[number]

const EVERYWHERE = BLOCK_HOMES

export const BLOCK_KINDS: Readonly<Record<DocumentBlockKind, readonly BlockHome[]>> = {
  // A Section is Work grouping; a Shelf has always stored one, flat.
  section: ['work', 'shelf'],
  paragraph: EVERYWHERE,
  heading1: EVERYWHERE,
  heading2: EVERYWHERE,
  heading3: EVERYWHERE,
  image: EVERYWHERE,
  // A folder reference is Main's to carry, and a Shelf's Folder rows are one.
  folder_ref: ['work', 'shelf'],
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
  // Wave 2: a sub-page lives in a Folder's Main document alone.
  page: ['work'],
  // #213: a native Result belongs to the Results facet alone.
  result: ['results'],
}

/** May a block of `kind` be stored on a page of `home`. */
export function allowedIn(kind: DocumentBlockKind, home: BlockHome): boolean {
  return BLOCK_KINDS[kind].includes(home)
}

