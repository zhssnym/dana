/*
The safe inline-formatting primitive. Import nothing but zod here: this module
breaks an import cycle, whose symptom is a misleading "Cannot read properties
of undefined (reading 'optional')" elsewhere. The transform fixes key order so
documentHash (sha256 of JSON) is stable across clients.
*/
import { z } from 'zod'

/* A mention names a person; the server checks the id and notifies only page
   members (domain/mentions.ts). Appended last so runs without one hash as before. */
const mention = z.object({user_id:z.uuid()}).catchall(z.never()).transform(({user_id})=>({user_id}))
const richRun = z.object({text:z.string().max(4000),bold:z.boolean().optional(),italic:z.boolean().optional(),href:z.string().max(2048).refine(value => /^(https?:\/\/|mailto:|\/[^/])/i.test(value) && !Array.from(value).some(char=>char.charCodeAt(0)<=32), 'Use a safe web, mail or internal link.').optional(),mention:mention.optional()}).catchall(z.never()).refine(run=>run.href===undefined||run.mention===undefined,'A mention is not also a link.').transform(({text,bold,italic,href,mention}) => ({text,...(bold===undefined?{}:{bold}),...(italic===undefined?{}:{italic}),...(href===undefined?{}:{href}),...(mention===undefined?{}:{mention})}))
export const richContent = z.object({version:z.literal(1),runs:z.array(richRun).max(4000)}).catchall(z.never()).superRefine((value,ctx)=>{
 if(value.runs.reduce((n,run)=>n+run.text.length,0)>4000 || new TextEncoder().encode(JSON.stringify(value)).length>65536) ctx.addIssue({code:'custom',message:'Rich content exceeds the paragraph limit.'})
}).transform(({version,runs})=>({version,runs}))
export type RichContent = z.infer<typeof richContent>

const tableCell = z.object({
 props:z.object({
  backgroundColor:z.string().max(40),textColor:z.string().max(40),
  textAlignment:z.enum(['left','center','right','justify']),
  colspan:z.number().int().min(1).max(30).optional(),
  rowspan:z.number().int().min(1).max(100).optional(),
 }).catchall(z.never()),
 runs:z.array(richRun).max(400),
}).catchall(z.never())

export const tableRichContent = z.object({
 version:z.literal(1),runs:z.array(richRun).length(0),
 table:z.object({
  columnWidths:z.array(z.number().int().min(35).max(2000).nullable()).min(1).max(30),
  headerRows:z.number().int().min(0).max(100).optional(),
  headerCols:z.number().int().min(0).max(30).optional(),
  rows:z.array(z.object({cells:z.array(tableCell).min(1).max(30)}).catchall(z.never())).min(1).max(100),
 }).catchall(z.never()),
}).catchall(z.never()).superRefine((value,ctx)=>{
 if((value.table.headerRows??0)>value.table.rows.length || (value.table.headerCols??0)>value.table.columnWidths.length)
  ctx.addIssue({code:'custom',message:'Table headers exceed its size.'})
 if(new TextEncoder().encode(JSON.stringify(value)).length>65536)
  ctx.addIssue({code:'custom',message:'Table content exceeds the block limit.'})
})
export type TableRichContent = z.infer<typeof tableRichContent>
export const pageRichContent = z.union([richContent,tableRichContent])
export type PageRichContent = z.infer<typeof pageRichContent>

export function tablePlainText(table:TableRichContent['table']):string {
 return table.rows.map(row=>row.cells.map(cell=>cell.runs.map(run=>run.text).join('')).join('\t')).join('\n').slice(0,4000)
}
