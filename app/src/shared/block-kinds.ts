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

What each home's `/` menu offers is `SLASH_MENUS` below, and a command that
makes a block names its kind, so a menu never offers what its home refuses.
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


/*
The `/` menu each page kind shows (the approved model's slash-command table):
what that kind of page is for, and nothing else. Markdown shortcuts and Turn
into still make every kind the home stores; these are only what is offered.

- Work: the words around tasks, and Task. Pages are added from the sidebar.
- Doc (Purpose, Results): writing, a checklist and media. Task and Page come
  when a Doc page can hold them. A Result is made by turning a line into one.
- Task: a leaf page. Its checklist is the Task's subtasks; Blocked by opens
  the picker; Media is one command (no File).
- Shelf: unchanged until Shelves are decided.
- A discussion post has no `/` menu and is not a home here.
*/
export const SLASH_COMMANDS = {
  text: 'paragraph',
  heading: 'heading1',
  checklist: 'checklist',
  task: null,
  blocked_by: null,
  media: 'image',
  bullet: 'bullet',
  numbered: 'numbered',
  quote: 'quote',
  callout: 'callout',
  divider: 'divider',
  code: 'code',
  file: 'file',
  diagram: 'diagram',
  link: null,
} as const satisfies Record<string, DocumentBlockKind | null>
export type SlashCommand = keyof typeof SLASH_COMMANDS

const DOC_MENU = ['text', 'heading', 'checklist', 'media'] as const satisfies readonly SlashCommand[]

export const SLASH_MENUS: Readonly<Record<BlockHome, readonly SlashCommand[]>> = {
  work: ['text', 'heading', 'task'],
  doc: DOC_MENU,
  results: DOC_MENU,
  task: ['text', 'heading', 'checklist', 'blocked_by', 'media'],
  shelf: ['text', 'heading', 'bullet', 'numbered', 'quote', 'callout', 'divider', 'code', 'media', 'file', 'diagram', 'link'],
}
