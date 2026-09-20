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
export const documentOutlineItem = z.object({kind:z.enum(['block','task']),id:z.uuid(),section_block_id:z.uuid().nullable()})
export type DocumentOutlineItem = z.infer<typeof documentOutlineItem>
export const documentOperation = z.discriminatedUnion('op',[
 z.object({op:z.literal('put_block'),id:z.uuid(),block_kind:z.enum(['section','paragraph','image','folder_ref']),text:z.string().max(4000).nullable(),rich_content:richContent.nullable(),file_id:z.uuid().nullable(),ref_folder_id:z.uuid().nullable(),width_pct:z.number().int().min(25).max(100).nullable()}).superRefine((b,ctx)=>{
  if(b.block_kind==='section' && (b.text?.length??0)>120)ctx.addIssue({code:'custom',path:['text'],message:'A heading has at most 120 characters.'})
  if(b.rich_content!==null && (!['paragraph','section'].includes(b.block_kind)||b.rich_content.runs.map(r=>r.text).join('')!==b.text))ctx.addIssue({code:'custom',path:['rich_content'],message:'Rich content must match its text projection.'})
  if(b.width_pct!==null && b.block_kind!=='image')ctx.addIssue({code:'custom',path:['width_pct'],message:'Width belongs to an image.'})
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
