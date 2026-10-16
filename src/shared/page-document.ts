import { z } from 'zod'
import { taskTitle } from './tasks.js'
import { folderName } from './folders.js'
import type { FileKind } from './files.js'

/* Re-exported from rich-content.ts, which exists to break an import cycle. */
export { richContent, pageRichContent } from './rich-content.js'
export type { RichContent, PageRichContent } from './rich-content.js'
import { pageRichContent, tablePlainText } from './rich-content.js'
/**
 * Sections nest three deep (H1 to H3). The level is the depth in the
 * section_block_id relation; this is the only place the ceiling is written.
 */
export const MAX_SECTION_DEPTH = 3
/**
 * Dana-native structured kinds; BlockNote is the editor, not the storage
 * format. `code` is not rich text (`page_blocks_rich_content_check`).
 */
export const LIST_BLOCK_KINDS = ['bullet','numbered','checklist','toggle'] as const
export type ListBlockKind = (typeof LIST_BLOCK_KINDS)[number]
export const STRUCTURED_BLOCK_KINDS = [...LIST_BLOCK_KINDS,'quote','callout','code'] as const
/** #211: document headings are authored structure, never Main Work Sections. */
export const PRESENTATION_HEADING_KINDS = ['heading1','heading2','heading3'] as const
export type PresentationHeadingKind = (typeof PRESENTATION_HEADING_KINDS)[number]
export const isPresentationHeadingKind = (kind:string):kind is PresentationHeadingKind => (PRESENTATION_HEADING_KINDS as readonly string[]).includes(kind)
/**
 * Media kinds: one stored file each, by `file_id` only. Name, MIME and size are
 * read from the `files` row. The kind is fixed at upload; see BLOCK_FILE_KINDS.
 */
export const MEDIA_BLOCK_KINDS = ['image','file','audio','video'] as const
export type MediaBlockKind = (typeof MEDIA_BLOCK_KINDS)[number]
export const isMediaKind = (kind:string):kind is MediaBlockKind => (MEDIA_BLOCK_KINDS as readonly string[]).includes(kind)
export const DOCUMENT_BLOCK_KINDS = ['section','paragraph',...PRESENTATION_HEADING_KINDS,'image','folder_ref',...STRUCTURED_BLOCK_KINDS,'file','audio','video','diagram','table','divider','page','result','person','synced'] as const
export type DocumentBlockKind = (typeof DOCUMENT_BLOCK_KINDS)[number]
/**
 * Kinds that persist a width (25 to 100); matches
 * `page_blocks_width_pct_kind_check` (0024).
 */
export const WIDTH_BLOCK_KINDS = ['image','video'] as const
/**
 * Which stored file kinds each media block may name, checked in applyDocument.
 * The kind chosen at upload is kept, never re-derived from an extension. A
 * `file` row (untrusted bytes, served as an attachment) may never pose as
 * previewable media. `cover` is allowed for `image` because duplication
 * produces cover copies of page pictures.
 */
export const BLOCK_FILE_KINDS:Readonly<Record<MediaBlockKind,readonly FileKind[]>> = {
 image:['image','cover'],
 file:['file'],
 audio:['audio'],
 video:['video'],
}
/**
 * Only previewable kinds may Open: File blocks are always served as attachments
 * with nosniff, so Download is their only action, whatever the extension.
 */
/** Kinds a synced block may show. Matches the list in migration 0097. */
export const SYNCABLE_BLOCK_KINDS = ['paragraph',...PRESENTATION_HEADING_KINDS,...LIST_BLOCK_KINDS,'quote','callout','code','diagram','table',...MEDIA_BLOCK_KINDS] as const
export const isSyncableKind = (kind:string):boolean => (SYNCABLE_BLOCK_KINDS as readonly string[]).includes(kind)
export const blockMayOpen = (kind:string):boolean => kind==='image'||kind==='audio'||kind==='video'
/** `result` belongs to a Results facet only (`page_blocks_result_home_check`). */
export const RICH_TEXT_BLOCK_KINDS = ['section','paragraph',...PRESENTATION_HEADING_KINDS,...LIST_BLOCK_KINDS,'quote','callout','result'] as const
export const isListKind = (kind:string):kind is ListBlockKind => (LIST_BLOCK_KINDS as readonly string[]).includes(kind)
/**
 * Parents a block may nest under (0038). Any kind but a Section may be a child.
 * The database checks only the child half; the rest is domain/document-outline.ts.
 */
export const NEST_PARENT_KINDS = ['paragraph',...PRESENTATION_HEADING_KINDS,...LIST_BLOCK_KINDS,'quote','callout','result'] as const
/** Root blocks are depth 0. */
export const MAX_NEST_DEPTH = 12
export const mayNest = (childKind:string):boolean => childKind!=='section'
export const mayNestUnder = (childKind:string,parentKind:string):boolean =>
 mayNest(childKind) && (NEST_PARENT_KINDS as readonly string[]).includes(parentKind)
/**
 * Two independent parents: `section_block_id` (Work grouping) and
 * `list_parent_block_id` (writing structure). Neither is inferred from the
 * other. The latter defaults to null so pre-#219 workflow files still import.
 */
export const documentOutlineItem = z.object({kind:z.enum(['block','task']),id:z.uuid(),section_block_id:z.uuid().nullable(),list_parent_block_id:z.uuid().nullable().default(null)}).superRefine((item,ctx)=>{
 if(item.list_parent_block_id===null)return
 if(item.kind!=='block')ctx.addIssue({code:'custom',path:['list_parent_block_id'],message:'A Task is never a nested block.'})
 if(item.list_parent_block_id===item.id)ctx.addIssue({code:'custom',path:['list_parent_block_id'],message:'A block cannot be nested under itself.'})
})
export type DocumentOutlineItem = z.infer<typeof documentOutlineItem>
export const documentOperation = z.discriminatedUnion('op',[
 z.object({op:z.literal('put_block'),id:z.uuid(),block_kind:z.enum(DOCUMENT_BLOCK_KINDS),text:z.string().max(4000).nullable(),rich_content:pageRichContent.nullable(),file_id:z.uuid().nullable(),ref_folder_id:z.uuid().nullable(),width_pct:z.number().int().min(25).max(100).nullable(),checked:z.boolean().nullable().default(null),toggleable:z.boolean().nullable().optional()}).superRefine((b,ctx)=>{
  if((b.toggleable??null)!==null && !isPresentationHeadingKind(b.block_kind))ctx.addIssue({code:'custom',path:['toggleable'],message:'Only a heading folds.'})
  if((b.block_kind==='section'||isPresentationHeadingKind(b.block_kind)) && (b.text?.length??0)>120)ctx.addIssue({code:'custom',path:['text'],message:'A heading has at most 120 characters.'})
  if(b.block_kind==='table'){
   if(b.rich_content===null||!('table' in b.rich_content)||b.text!==tablePlainText(b.rich_content.table)||b.file_id!==null||b.ref_folder_id!==null)
    ctx.addIssue({code:'custom',path:['rich_content'],message:'A table needs its cells and text projection, with no file or folder reference.'})
  }else if(b.rich_content!==null && ('table' in b.rich_content||!(RICH_TEXT_BLOCK_KINDS as readonly string[]).includes(b.block_kind)||b.rich_content.runs.map(r=>r.text).join('')!==b.text))ctx.addIssue({code:'custom',path:['rich_content'],message:'Rich content must match its text projection.'})
  if(b.width_pct!==null && !(WIDTH_BLOCK_KINDS as readonly string[]).includes(b.block_kind))ctx.addIssue({code:'custom',path:['width_pct'],message:'Width belongs to an image or a video.'})
  // A tick is authored content, never a Task status. Unticked is stored as false.
  if(b.checked!==null && b.block_kind!=='checklist')ctx.addIssue({code:'custom',path:['checked'],message:'Only a checklist item is checked or unchecked.'})
  if((b.file_id!==null||b.ref_folder_id!==null)&&((STRUCTURED_BLOCK_KINDS as readonly string[]).includes(b.block_kind)||isPresentationHeadingKind(b.block_kind)))ctx.addIssue({code:'custom',path:['file_id'],message:'A structured text block carries no file and no folder reference.'})
  // A media block names one file; its name comes from the `files` row. A diagram is source text only.
  if(b.block_kind==='diagram'&&(b.file_id!==null||b.ref_folder_id!==null))ctx.addIssue({code:'custom',path:['file_id'],message:'A diagram carries no file and no folder reference.'})
  if(isMediaKind(b.block_kind)&&b.ref_folder_id!==null)ctx.addIssue({code:'custom',path:['ref_folder_id'],message:'A media block carries no folder reference.'})
  if(b.block_kind==='divider'&&((b.text!==null&&b.text!=='')||b.rich_content!==null||b.file_id!==null||b.ref_folder_id!==null||b.width_pct!==null))ctx.addIssue({code:'custom',path:['text'],message:'A divider carries no text, no file, no folder reference and no width.'})
  // A page block names its sub-page; the title is read from that folder, never copied.
  if(b.block_kind==='page'&&(b.ref_folder_id===null||(b.text!==null&&b.text!=='')||b.rich_content!==null||b.file_id!==null||b.width_pct!==null))ctx.addIssue({code:'custom',path:['ref_folder_id'],message:'A page block names one page and carries nothing else.'})
  if(b.block_kind==='person'&&(!z.uuid().safeParse(b.text).success||b.rich_content!==null||b.file_id!==null||b.ref_folder_id!==null||b.width_pct!==null||b.checked!==null))ctx.addIssue({code:'custom',path:['text'],message:'A Person block names one Team member and carries nothing else.'})
  // A synced block names its source block; the source document owns the content.
  if(b.block_kind==='synced'&&(!z.uuid().safeParse(b.text).success||b.text===b.id||b.rich_content!==null||b.file_id!==null||b.ref_folder_id!==null||b.width_pct!==null||b.checked!==null))ctx.addIssue({code:'custom',path:['text'],message:'A synced block names one other block and carries nothing else.'})
  if((b.block_kind==='file'||b.block_kind==='audio'||b.block_kind==='video')&&((b.text!==null&&b.text!=='')||b.rich_content!==null))ctx.addIssue({code:'custom',path:['text'],message:'A file, audio or video block carries no text of its own.'})
  /*
  file/audio/video blocks must name a file. Checked in the schema, not over the
  merged document, because a stored media row can legitimately have a null
  file_id (ON DELETE SET NULL); checking that would make the page unsavable.
  `image` is exempt: the editor saves an empty image block before a file is
  picked. AC-602 pins both.
  */
  if((b.block_kind==='file'||b.block_kind==='audio'||b.block_kind==='video')&&b.file_id===null)ctx.addIssue({code:'custom',path:['file_id'],message:'A file, audio or video block names one stored file.'})
 }),
 z.object({op:z.literal('delete_block'),id:z.uuid()}),
 z.object({op:z.literal('create_task'),id:z.uuid(),title:taskTitle}),
 /* Main document only. `create_page` makes sub-page `id` (members copied from
    this Folder) and its home `page` block; `trash_page` must delete that block
    in the same transaction, and a `page` block is never deleted without it. */
 z.object({op:z.literal('create_page'),id:z.uuid(),block_id:z.uuid(),title:folderName}),
 z.object({op:z.literal('trash_page'),folder_id:z.uuid()}),
 z.object({op:z.literal('set_outline'),items:z.array(documentOutlineItem).max(1500)})
])
export type DocumentOperation = z.infer<typeof documentOperation>
export const documentTransaction = z.object({action:z.literal('document_transaction'),mutation_id:z.uuid(),base_revision:z.string().min(1).max(128),operations:z.array(documentOperation).min(1).max(1000)}).superRefine((body,ctx)=>{
 if(body.operations.filter(op=>op.op==='set_outline').length!==1)ctx.addIssue({code:'custom',path:['operations'],message:'Exactly one final outline is required.'})
 if(new TextEncoder().encode(JSON.stringify(body)).length>2*1024*1024)ctx.addIssue({code:'custom',message:'A document transaction is limited to 2 MiB.'})
})
export type DocumentTransaction = z.infer<typeof documentTransaction>
