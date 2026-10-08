import type { DocumentBlockKind } from './page-document.js'

/*
Which block kinds each page home stores. `results` stays only for clients that
still send it (a Results tab is a Doc page now). Never narrow a kind's homes,
or existing blocks stop saving. What each `/` menu offers is the client's
(`SLASH_MENUS` in slash-items.tsx).
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
  table: EVERYWHERE,
  divider: EVERYWHERE,
  // A sub-page's home block lives in its parent page's document.
  page: ['work', 'doc'],
  result: ['doc', 'results'],
  person: ['work', 'doc', 'results'],
}

export function allowedIn(kind: DocumentBlockKind, home: BlockHome): boolean {
  return BLOCK_KINDS[kind].includes(home)
}
