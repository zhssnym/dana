import { z } from 'zod'
import { taskTitle } from './tasks.js'

const richRun = z.object({text:z.string().max(4000),bold:z.boolean().optional(),italic:z.boolean().optional(),href:z.string().max(2048).refine(value => /^(https?:\/\/|mailto:|\/[^/])/i.test(value) && !Array.from(value).some(char=>char.charCodeAt(0)<=32), 'Use a safe web, mail or internal link.').optional()}).catchall(z.never()).transform(({text,bold,italic,href}) => ({text,...(bold===undefined?{}:{bold}),...(italic===undefined?{}:{italic}),...(href===undefined?{}:{href})}))
export const richContent = z.object({version:z.literal(1),runs:z.array(richRun).max(4000)}).catchall(z.never()).superRefine((value,ctx)=>{
 if(value.runs.reduce((n,run)=>n+run.text.length,0)>4000 || new TextEncoder().encode(JSON.stringify(value)).length>65536) ctx.addIssue({code:'custom',message:'Rich content exceeds the paragraph limit.'})
}).transform(({version,runs})=>({version,runs}))
export type RichContent = z.infer<typeof richContent>
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
export const LIST_BLOCK_KINDS = ['bullet','numbered','checklist'] as const
export type ListBlockKind = (typeof LIST_BLOCK_KINDS)[number]
export const STRUCTURED_BLOCK_KINDS = [...LIST_BLOCK_KINDS,'quote','callout','code'] as const
export const DOCUMENT_BLOCK_KINDS = ['section','paragraph','image','folder_ref',...STRUCTURED_BLOCK_KINDS] as const
export type DocumentBlockKind = (typeof DOCUMENT_BLOCK_KINDS)[number]
export const RICH_TEXT_BLOCK_KINDS = ['section','paragraph',...LIST_BLOCK_KINDS,'quote','callout'] as const
/** The one test for "may this take part in list nesting", written once. */
export const isListKind = (kind:string):kind is ListBlockKind => (LIST_BLOCK_KINDS as readonly string[]).includes(kind)
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
  if(b.block_kind==='section' && (b.text?.length??0)>120)ctx.addIssue({code:'custom',path:['text'],message:'A heading has at most 120 characters.'})
  if(b.rich_content!==null && (!(RICH_TEXT_BLOCK_KINDS as readonly string[]).includes(b.block_kind)||b.rich_content.runs.map(r=>r.text).join('')!==b.text))ctx.addIssue({code:'custom',path:['rich_content'],message:'Rich content must match its text projection.'})
  if(b.width_pct!==null && b.block_kind!=='image')ctx.addIssue({code:'custom',path:['width_pct'],message:'Width belongs to an image.'})
  // A tick is authored content and it belongs to a checklist item alone: it is
  // not a Task's status and completes nothing (R1 decision 3). Omitting it on a
  // checklist item means unchecked; the server stores false rather than null.
  if(b.checked!==null && b.block_kind!=='checklist')ctx.addIssue({code:'custom',path:['checked'],message:'Only a checklist item is checked or unchecked.'})
  // The six structured kinds are writing, so they carry neither a picture nor a
  // folder reference. Widening that is another issue's to make.
  if((b.file_id!==null||b.ref_folder_id!==null)&&(STRUCTURED_BLOCK_KINDS as readonly string[]).includes(b.block_kind))ctx.addIssue({code:'custom',path:['file_id'],message:'A structured text block carries no file and no folder reference.'})
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
