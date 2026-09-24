import { z } from 'zod'
import { taskTitle } from './tasks.js'
import type { FileKind } from './files.js'

/* `richContent` moved to `rich-content.ts` with issue #230 and is re-exported
   here unchanged, because the Responsibility document is its third consumer
   and importing this file from `shared/responsibility.ts` closed a cycle
   through `tasks.ts` and `folders.ts`. That file carries the reasoning and
   the definition; nothing about the rule moved with it. */
export { richContent } from './rich-content.js'
export type { RichContent } from './rich-content.js'
import { richContent } from './rich-content.js'
/**
 * Sections nest three levels deep: H1 at the page root, H2 under an H1, H3 under
 * an H2. There is no heading-level column; a Section's level is its depth in the
 * existing section_block_id relation, and this is the only place the ceiling is
 * written down. Raising it is a contract change (#218).
 */
export const MAX_SECTION_DEPTH = 3
/**
 * #219's structured writing vocabulary, as Dana-native kinds rather than as
 * opaque BlockNote document JSON: BlockNote is the editor, not the storage
 * format. Three of the six nest — a list item's child is another list item and
 * nothing else — and the other three are leaves.
 *
 * `code` is deliberately outside RICH_TEXT_BLOCK_KINDS. A code block is plain
 * code text; nothing in Dana bolds, italicises or links inside one (R1
 * decision 6), and `page_blocks_rich_content_check` says the same thing in the
 * database.
 */
export const LIST_BLOCK_KINDS = ['bullet','numbered','checklist','toggle'] as const
export type ListBlockKind = (typeof LIST_BLOCK_KINDS)[number]
export const STRUCTURED_BLOCK_KINDS = [...LIST_BLOCK_KINDS,'quote','callout','code'] as const
/** #211: document headings are authored structure, never Main Work Sections. */
export const PRESENTATION_HEADING_KINDS = ['heading1','heading2','heading3'] as const
export type PresentationHeadingKind = (typeof PRESENTATION_HEADING_KINDS)[number]
export const isPresentationHeadingKind = (kind:string):kind is PresentationHeadingKind => (PRESENTATION_HEADING_KINDS as readonly string[]).includes(kind)
/**
 * #220's media vocabulary. Four kinds, one stored file each, named by `file_id`
 * and by nothing else: a media block copies no filename, no MIME and no byte
 * size, because the `files` row is the one authority on all three and two
 * copies of a fact are two facts free to disagree.
 *
 * **`file` is not a fallback for the other three and the four are not ordered.**
 * Which one a block is was decided when the file was uploaded, by how the
 * person inserted it — dropped as media, or chosen through the File command —
 * and `BLOCK_FILE_KINDS` below is what makes the server keep that decision
 * rather than re-derive it from an extension it must never trust.
 */
export const MEDIA_BLOCK_KINDS = ['image','file','audio','video'] as const
export type MediaBlockKind = (typeof MEDIA_BLOCK_KINDS)[number]
export const isMediaKind = (kind:string):kind is MediaBlockKind => (MEDIA_BLOCK_KINDS as readonly string[]).includes(kind)
export const DOCUMENT_BLOCK_KINDS = ['section','paragraph',...PRESENTATION_HEADING_KINDS,'image','folder_ref',...STRUCTURED_BLOCK_KINDS,'file','audio','video','diagram','divider'] as const
export type DocumentBlockKind = (typeof DOCUMENT_BLOCK_KINDS)[number]
/**
 * The kinds that persist a dragged width (4.17's `width_pct`, 25 to 100).
 *
 * #220 R1 extends the restrained centred width from image to previewable
 * **video** and stops there: audio uses its natural compact player width, and
 * a generic file block does not resize in M1. Migration 0024's
 * `page_blocks_width_pct_kind_check` says the same thing in the database.
 * Player state — position, volume, speed — is never persisted at all.
 */
export const WIDTH_BLOCK_KINDS = ['image','video'] as const
/**
 * Which stored file kinds each media block kind may name — the whole of
 * "insertion mode is preserved, not re-derived".
 *
 * The same JPG is an Image block when it was dropped as media and a File block
 * when it was inserted through the File command. Both are legitimate, they are
 * different, and the difference is a decision the person made that the server
 * validated at upload time. Reading it back off the filename would throw that
 * decision away and would trust an extension, which is presentation and never
 * security truth. So the rule is a table, and it is checked before the first
 * write in `applyDocument`.
 *
 * **It fails closed in the direction that matters.** A `file` row holds
 * untrusted bytes of any type and is served as an attachment; an `image`,
 * `audio` or `video` row passed a validation at upload and is served inline. A
 * `file` row may therefore never be dressed as previewable media, which is the
 * mismatch that would matter, and an `image`, `audio` or `video` row may never
 * be quietly demoted into a File block either — a File block is a File block
 * because its bytes were uploaded as one.
 *
 * `cover` is admitted for `image` alone and only because it was already
 * reachable: a cover is a raster that went through the same decode and
 * re-encode as an `image`, folder duplication has produced `cover` copies of
 * page pictures since issue #128, and refusing them here would make documents
 * that save today stop saving. It is a widening of nothing: no other kind gains
 * a second home.
 */
export const BLOCK_FILE_KINDS:Readonly<Record<MediaBlockKind,readonly FileKind[]>> = {
 image:['image','cover'],
 file:['file'],
 audio:['audio'],
 video:['video'],
}
/**
 * R2's frontend-safe rule for **Open** against Download-only, and it reads the
 * block kind rather than the filename, the extension or the MIME.
 *
 * A generic File block is served `Content-Disposition: attachment` with
 * `X-Content-Type-Options: nosniff`, unconditionally and for every type, so an
 * "Open" on one could not open anything even if it were safe to: the browser
 * downloads it. Download is therefore the only honest action on a File block,
 * whatever its extension says it is, and an executable, an unknown binary and a
 * file with no extension at all are covered by the same sentence rather than by
 * a list somebody has to keep. The three previewable kinds are served inline
 * after a server-side validation, and those are the ones Dana may open.
 *
 * Download is always available wherever the viewer may read the file.
 */
export const blockMayOpen = (kind:string):boolean => kind==='image'||kind==='audio'||kind==='video'
export const RICH_TEXT_BLOCK_KINDS = ['section','paragraph',...PRESENTATION_HEADING_KINDS,...LIST_BLOCK_KINDS,'quote','callout'] as const
/** The one test for "may this take part in list nesting", written once. */
export const isListKind = (kind:string):kind is ListBlockKind => (LIST_BLOCK_KINDS as readonly string[]).includes(kind)
/**
 * A toggle is a list item that also holds writing. A list item nests under a
 * list item (a toggle included), as #219 has it; and under a `toggle`, and
 * under nothing else, a paragraph, a quote, a callout, a code block or a
 * divider may nest too, through the same `list_parent_block_id`. The database
 * says the same thing in `page_blocks_list_parent_kind_check` (0035).
 */
export const TOGGLE_CHILD_KINDS = ['paragraph',...LIST_BLOCK_KINDS,'quote','callout','code','divider'] as const
export type ToggleChildKind = (typeof TOGGLE_CHILD_KINDS)[number]
/** The one test for "may a block of `childKind` nest under one of `parentKind`". */
export const mayNestUnder = (childKind:string,parentKind:string):boolean =>
 (isListKind(childKind)&&isListKind(parentKind)) || (parentKind==='toggle'&&(TOGGLE_CHILD_KINDS as readonly string[]).includes(childKind))
/**
 * An outline item carries both parent relations, and they are independent.
 * `section_block_id` is Work grouping: which Section this block or Task belongs
 * to. `list_parent_block_id` is writing structure: which list item this list
 * item is nested under. A nested list item inside a Section carries both, and
 * neither is ever inferred from the other or from visual proximity.
 *
 * The outline is the whole truth about structure. An item that omits
 * `list_parent_block_id` is not nested, exactly as an item that omits
 * `section_block_id` is at the page root; it defaults rather than being
 * required so that a version 2 workflow file written before #219 still imports.
 */
export const documentOutlineItem = z.object({kind:z.enum(['block','task']),id:z.uuid(),section_block_id:z.uuid().nullable(),list_parent_block_id:z.uuid().nullable().default(null)}).superRefine((item,ctx)=>{
 if(item.list_parent_block_id===null)return
 if(item.kind!=='block')ctx.addIssue({code:'custom',path:['list_parent_block_id'],message:'A Task is never a nested list item.'})
 if(item.list_parent_block_id===item.id)ctx.addIssue({code:'custom',path:['list_parent_block_id'],message:'A list item cannot be nested under itself.'})
})
export type DocumentOutlineItem = z.infer<typeof documentOutlineItem>
export const documentOperation = z.discriminatedUnion('op',[
 z.object({op:z.literal('put_block'),id:z.uuid(),block_kind:z.enum(DOCUMENT_BLOCK_KINDS),text:z.string().max(4000).nullable(),rich_content:richContent.nullable(),file_id:z.uuid().nullable(),ref_folder_id:z.uuid().nullable(),width_pct:z.number().int().min(25).max(100).nullable(),checked:z.boolean().nullable().default(null)}).superRefine((b,ctx)=>{
  if((b.block_kind==='section'||isPresentationHeadingKind(b.block_kind)) && (b.text?.length??0)>120)ctx.addIssue({code:'custom',path:['text'],message:'A heading has at most 120 characters.'})
  if(b.rich_content!==null && (!(RICH_TEXT_BLOCK_KINDS as readonly string[]).includes(b.block_kind)||b.rich_content.runs.map(r=>r.text).join('')!==b.text))ctx.addIssue({code:'custom',path:['rich_content'],message:'Rich content must match its text projection.'})
  // 4.17's width, as #220 leaves it: an image and a previewable video persist
  // one, and nothing else does (WIDTH_BLOCK_KINDS above).
  if(b.width_pct!==null && !(WIDTH_BLOCK_KINDS as readonly string[]).includes(b.block_kind))ctx.addIssue({code:'custom',path:['width_pct'],message:'Width belongs to an image or a video.'})
  // A tick is authored content and it belongs to a checklist item alone: it is
  // not a Task's status and completes nothing (R1 decision 3). Omitting it on a
  // checklist item means unchecked; the server stores false rather than null.
  if(b.checked!==null && b.block_kind!=='checklist')ctx.addIssue({code:'custom',path:['checked'],message:'Only a checklist item is checked or unchecked.'})
  // The six structured kinds are writing, so they carry neither a picture nor a
  // folder reference. Widening that is another issue's to make.
  if((b.file_id!==null||b.ref_folder_id!==null)&&((STRUCTURED_BLOCK_KINDS as readonly string[]).includes(b.block_kind)||isPresentationHeadingKind(b.block_kind)))ctx.addIssue({code:'custom',path:['file_id'],message:'A structured text block carries no file and no folder reference.'})
  // #220: a media block names one stored file and nothing else. It carries no
  // folder reference (that is `folder_ref`'s whole job), and it carries no text
  // and no rich content — a caption is a paragraph, and the filename the block
  // shows is read from the `files` row rather than copied onto the block.
  // #222: a diagram is its source text alone; the picture is derived on read.
  if(b.block_kind==='diagram'&&(b.file_id!==null||b.ref_folder_id!==null))ctx.addIssue({code:'custom',path:['file_id'],message:'A diagram carries no file and no folder reference.'})
  if(isMediaKind(b.block_kind)&&b.ref_folder_id!==null)ctx.addIssue({code:'custom',path:['ref_folder_id'],message:'A media block carries no folder reference.'})
  // A divider is a rule and nothing else: no text, no rich content, no file,
  // no folder reference and no width.
  if(b.block_kind==='divider'&&((b.text!==null&&b.text!=='')||b.rich_content!==null||b.file_id!==null||b.ref_folder_id!==null||b.width_pct!==null))ctx.addIssue({code:'custom',path:['text'],message:'A divider carries no text, no file, no folder reference and no width.'})
  if((b.block_kind==='file'||b.block_kind==='audio'||b.block_kind==='video')&&((b.text!==null&&b.text!=='')||b.rich_content!==null))ctx.addIssue({code:'custom',path:['text'],message:'A file, audio or video block carries no text of its own.'})
  /*
  4.17: a media block **references one stored file by `file_id`**. Until this
  landed, a `file`, an `audio` or a `video` block naming nothing was accepted
  here, accepted by `applyDocument` and accepted by the database, all three
  answering 200 — a player with no track under it. The rule is stated here
  rather than as a CHECK for the reason migration 0024 gives about the
  constraint it deliberately does not write, and it is stated in the *schema*
  rather than in `applyDocument` so that it is scoped to the operations this
  transaction carries and to nothing else. That is not a detail. A null
  `file_id` on a media row is routine: `page_blocks_file_id_fkey` is ON DELETE
  SET NULL, so 7.19's ordinary reclaim produces one, and `update_block`
  reaches the column directly and takes a null besides. Read over the merged
  document the rule would turn deleting a picture into a page that can never be
  saved again, which is the trap AC-600 closes for the pairing gate.

  **`image` is exempt, and it is a decision rather than an omission.** Every
  picture in the composer begins as an empty image block — BlockNote's own
  image block is inserted with no URL and a file-picker panel, and the canvas
  adapter projects a fileless one straight back to `file_id: null` — so the
  editor saves one on the keystroke after a person inserts a picture, and has
  since long before #220. The three kinds #220 added have no such placeholder
  state: each is inserted from a file that already exists. AC-602 pins both
  halves.
  */
  if((b.block_kind==='file'||b.block_kind==='audio'||b.block_kind==='video')&&b.file_id===null)ctx.addIssue({code:'custom',path:['file_id'],message:'A file, audio or video block names one stored file.'})
 }),
 z.object({op:z.literal('delete_block'),id:z.uuid()}),
 z.object({op:z.literal('create_task'),id:z.uuid(),title:taskTitle}),
 z.object({op:z.literal('set_outline'),items:z.array(documentOutlineItem).max(1500)})
])
export type DocumentOperation = z.infer<typeof documentOperation>
export const documentTransaction = z.object({action:z.literal('document_transaction'),mutation_id:z.uuid(),base_revision:z.string().min(1).max(128),operations:z.array(documentOperation).min(1).max(1000)}).superRefine((body,ctx)=>{
 if(body.operations.filter(op=>op.op==='set_outline').length!==1)ctx.addIssue({code:'custom',path:['operations'],message:'Exactly one final outline is required.'})
 if(new TextEncoder().encode(JSON.stringify(body)).length>2*1024*1024)ctx.addIssue({code:'custom',message:'A document transaction is limited to 2 MiB.'})
})
export type DocumentTransaction = z.infer<typeof documentTransaction>
