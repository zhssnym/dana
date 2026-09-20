import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import type { Executor } from '../database.js'
import { rowsOf } from '../database.js'
import type { DocumentTransaction, DocumentOperation, DocumentOutlineItem } from '../../shared/pages.js'
import { MAX_SECTION_DEPTH } from '../../shared/page-document.js'
import { initialKeys } from './fractional-index.js'
import { createTaskIn } from './tasks.js'
import { positionedItems } from './page-order.js'
import { recordEvent } from './events.js'

type BlockOp = Extract<DocumentOperation,{op:'put_block'}>
export const documentHash = (value:unknown):string => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export class DocumentRefusal extends Error { constructor(readonly kind:'stale'|'not_convertible'|'file_not_here'|'not_found',message:string){super(message)} }
export async function documentMetadata(tx:Executor,folderId:string|null) {
 if(folderId===null)return {revision:documentHash(null),task_placements:[]}
 const blocks=await rowsOf(tx,sql`SELECT id,kind,text,rich_content,file_id,ref_folder_id,width_pct,section_block_id,page_position,position FROM page_blocks WHERE folder_id=${folderId}::uuid ORDER BY id`)
 const tasks=await rowsOf(tx,sql`SELECT id,section_block_id,page_position FROM tasks WHERE folder_id=${folderId}::uuid AND deleted_at IS NULL ORDER BY id`)
 return {revision:documentHash({blocks,tasks}),task_placements:tasks.map(t=>({id:String(t.id),section_block_id:t.section_block_id==null?null:String(t.section_block_id)}))}
}
export async function applyDocument(tx:Executor,viewerId:string,folderId:string,body:DocumentTransaction) {
 const hash=documentHash(body)
 const receipts=await rowsOf(tx,sql`SELECT payload_hash,committed_revision,created_task_ids FROM page_document_receipts WHERE actor_id=${viewerId}::uuid AND folder_id=${folderId}::uuid AND mutation_id=${body.mutation_id}::uuid`)
 const receipt=receipts[0]
 if(receipt){
  if(receipt.payload_hash!==hash)throw new DocumentRefusal('stale','This retry identity already belongs to a different edit.')
  return {mutation_id:body.mutation_id,committed_revision:String(receipt.committed_revision),replayed:true,created_task_ids:receipt.created_task_ids as string[]}
 }
 const previousOutline=await positionedItems(tx,folderId)
 const metadata=await documentMetadata(tx,folderId)
 if(metadata.revision!==body.base_revision)throw new DocumentRefusal('stale','The page changed. Your draft is retained; reconcile it with the current page.')
 const stored=await rowsOf(tx,sql`SELECT id,kind,text,rich_content,file_id,ref_folder_id,width_pct,page_position,position,section_block_id FROM page_blocks WHERE folder_id=${folderId}::uuid FOR UPDATE`)
 const blocks=new Map<string,BlockOp>(stored.map(b=>[String(b.id),{op:'put_block',id:String(b.id),block_kind:b.kind as BlockOp['block_kind'],text:b.text as string|null,rich_content:b.rich_content as BlockOp['rich_content'],file_id:b.file_id as string|null,ref_folder_id:b.ref_folder_id as string|null,width_pct:b.width_pct as number|null}]))
 const original=new Set(blocks.keys())
 const tasks=new Set(metadata.task_placements.map(t=>t.id))
 const created:Extract<DocumentOperation,{op:'create_task'}>[]=[]
 let outline:DocumentOutlineItem[]=[]
 for(const op of body.operations){
  if(op.op==='put_block')blocks.set(op.id,op)
  else if(op.op==='delete_block') {if(!blocks.delete(op.id))throw new DocumentRefusal('not_found','Block not found.')}
  else if(op.op==='create_task'){if(tasks.has(op.id)||created.some(t=>t.id===op.id))throw new DocumentRefusal('not_convertible','Task identity already exists.');created.push(op);tasks.add(op.id)}
  else outline=op.items
 }
 if(blocks.size>500)throw new DocumentRefusal('not_convertible','A page holds at most 500 blocks.')
 if(tasks.size>1000)throw new DocumentRefusal('not_convertible','A page holds at most 1000 Tasks.')
 // A Section's heading level is its depth in this outline and nothing else; depths
 // is the running ancestry measurement, recorded as each Section is accepted so that
 // a child reads its parent's rather than re-walking the chain.
 const seen=new Set<string>();const depths=new Map<string,number>();let active:string[]=[]
 for(const item of outline){
  if(seen.has(item.id)||(item.kind==='block'?!blocks.has(item.id):!tasks.has(item.id)))throw new DocumentRefusal('not_convertible','The outline has unknown or repeated identities.')
  seen.add(item.id)
  const parent=item.section_block_id
  if(parent!==null && (blocks.get(parent)?.block_kind!=='section'||!seen.has(parent)))throw new DocumentRefusal('not_convertible','A parent must precede its content.')
  const block=item.kind==='block'?blocks.get(item.id):undefined
  const depth=parent===null?1:(depths.get(parent)??0)+1
  if(block?.block_kind==='section' && depth>MAX_SECTION_DEPTH)throw new DocumentRefusal('not_convertible',`Headings nest ${MAX_SECTION_DEPTH} levels deep at most.`)
  if(parent===null)active=[]
  else {const at=active.indexOf(parent);if(at<0)throw new DocumentRefusal('not_convertible','Heading content must form a contiguous group.');active=active.slice(0,at+1)}
  if(block?.block_kind==='section'){active.push(item.id);depths.set(item.id,depth)}
 }
 if(seen.size!==blocks.size+tasks.size)throw new DocumentRefusal('not_convertible','The outline must retain every Task and undeleted block.')
 for(const block of blocks.values()){
  if(block.file_id!==null){const files=await rowsOf(tx,sql`SELECT id FROM files WHERE id=${block.file_id}::uuid AND folder_id=${folderId}::uuid`);if(files.length===0)throw new DocumentRefusal('file_not_here','Image is not in this folder.')}
  if(block.ref_folder_id!==null){const refs=await rowsOf(tx,sql`SELECT f.id FROM folders f JOIN folder_members m ON m.folder_id=f.id WHERE f.id=${block.ref_folder_id}::uuid AND m.user_id=${viewerId}::uuid AND f.deleted_at IS NULL`);if(refs.length===0)throw new DocumentRefusal('not_found','Referenced folder is not accessible.')}
 }
 const fresh=[...blocks.keys()].filter(id=>!original.has(id)).concat(created.map(t=>t.id))
 if(fresh.length){const collisions=await rowsOf(tx,sql`SELECT id FROM page_blocks WHERE id IN (${sql.join(fresh.map(id=>sql`${id}::uuid`),sql`,`)}) UNION ALL SELECT id FROM tasks WHERE id IN (${sql.join(fresh.map(id=>sql`${id}::uuid`),sql`,`)})`);if(collisions.length)throw new DocumentRefusal('not_convertible','An inserted identity already exists.')}
 // All authorization and final-state validation precede the first write.
 for(const id of original)if(!blocks.has(id))await tx.execute(sql`DELETE FROM page_blocks WHERE id=${id}::uuid`)
 const changed = new Set(body.operations.flatMap(op=>op.op==='put_block'?[op.id]:[]))
 for(const block of blocks.values())if(changed.has(block.id))await tx.execute(sql`INSERT INTO page_blocks (id,folder_id,kind,position,text,rich_content,file_id,ref_folder_id,width_pct) VALUES (${block.id}::uuid,${folderId}::uuid,${block.block_kind},0,${block.text},${block.rich_content === null ? null : JSON.stringify(block.rich_content)}::jsonb,${block.file_id}::uuid,${block.ref_folder_id}::uuid,${block.width_pct}) ON CONFLICT (id) DO UPDATE SET kind=EXCLUDED.kind,text=EXCLUDED.text,rich_content=EXCLUDED.rich_content,file_id=EXCLUDED.file_id,ref_folder_id=EXCLUDED.ref_folder_id,width_pct=EXCLUDED.width_pct,updated_at=now()`)
 for(const task of created){const result=await createTaskIn(tx,viewerId,{folder_id:folderId,title:task.title},{id:task.id,pagePosition:'a0'});if(result.kind!=='created')throw new DocumentRefusal('not_convertible','Task creation was refused.')}
 const keys=initialKeys(outline.length)
 const structureChanged=outline.length!==previousOutline.length || outline.some((item,index)=>{const prior=previousOutline[index];return prior?.id!==item.id||prior.kind!==item.kind||prior.sectionBlockId!==item.section_block_id||prior.pagePosition===null})
 if(structureChanged)for(const [index,item] of outline.entries())await tx.execute(item.kind==='block'?sql`UPDATE page_blocks SET page_position=${keys[index]},position=${index},section_block_id=${item.section_block_id}::uuid WHERE id=${item.id}::uuid`:sql`UPDATE tasks SET page_position=${keys[index]},section_block_id=${item.section_block_id}::uuid WHERE id=${item.id}::uuid`)
 const named=await rowsOf(tx,sql`SELECT name FROM folders WHERE id=${folderId}::uuid`)
 await recordEvent(tx,{actorId:viewerId,verb:'edited',subjectKind:'folder',subjectId:folderId,subjectName:String(named[0]?.name??''),folderId,detail:'edited the page'})
 const committed=await documentMetadata(tx,folderId)
 await tx.execute(sql`INSERT INTO page_document_receipts (actor_id,folder_id,mutation_id,payload_hash,committed_revision,created_task_ids) VALUES (${viewerId}::uuid,${folderId}::uuid,${body.mutation_id}::uuid,${hash},${committed.revision},${JSON.stringify(created.map(t=>t.id))}::jsonb)`)
 return {mutation_id:body.mutation_id,committed_revision:committed.revision,replayed:false,created_task_ids:created.map(t=>t.id)}
}
