import { sql } from 'drizzle-orm'
import type { Executor } from '../database.js'
import { rowsOf } from '../database.js'
import type { DocumentTransaction, DocumentOperation, DocumentOutlineItem } from '../../shared/pages.js'
import { BLOCK_FILE_KINDS, MAX_SECTION_DEPTH, isListKind, isMediaKind } from '../../shared/page-document.js'
import { initialKeys } from './fractional-index.js'
import { createTaskIn } from './tasks.js'
import { positionedItems } from './page-order.js'
import { recordEvent } from './events.js'

type BlockOp = Extract<DocumentOperation,{op:'put_block'}>
/* `documentHash` moved to `document-hash.ts` with issue #230 and is re-exported
   here unchanged, because the Responsibility document is its second consumer
   and importing this file from `domain/responsibility.ts` closed a cycle
   through `tasks.ts` and `folders.ts`. That file carries the reasoning; nothing
   about the function moved with it. */
export { documentHash } from './document-hash.js'
import { documentHash } from './document-hash.js'
/*
`field` is the one thing this class carries that the document transaction
itself never sets, and it is deliberately optional.

7.16 answers a page action with a rule and no field, because the body *is* the
page and there is nothing to address. A **workflow file** is a different body:
its page sits at `folders.<n>.page`, and a file with two folders in it answered
with "A nested list item belongs to its list parent's Section" and nothing else
tells a caller a rule and not which folder broke it. So a caller that knows
where the page it handed over came from re-throws with that path, and the route
sends the same 422 through `sendFieldValidationError` — the one formatter, so
that a refusal from here reads like a refusal from the schema (7.0).

Nothing in this module sets it. It is set by `importWorkflow`, which is the
only caller that has a path to give.
*/
export class DocumentRefusal extends Error { constructor(readonly kind:'stale'|'not_convertible'|'file_not_here'|'file_kind_mismatch'|'not_found',message:string,readonly field?:string){super(message)} }
export async function documentMetadata(tx:Executor,folderId:string|null) {
 if(folderId===null)return {revision:documentHash(null),task_placements:[]}
 const blocks=await rowsOf(tx,sql`SELECT id,kind,text,rich_content,file_id,ref_folder_id,width_pct,section_block_id,list_parent_block_id,checked,page_position,position FROM page_blocks WHERE folder_id=${folderId}::uuid ORDER BY id`)
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
 const stored=await rowsOf(tx,sql`SELECT id,kind,text,rich_content,file_id,ref_folder_id,width_pct,page_position,position,section_block_id,list_parent_block_id,checked FROM page_blocks WHERE folder_id=${folderId}::uuid FOR UPDATE`)
 const blocks=new Map<string,BlockOp>(stored.map(b=>[String(b.id),{op:'put_block',id:String(b.id),block_kind:b.kind as BlockOp['block_kind'],text:b.text as string|null,rich_content:b.rich_content as BlockOp['rich_content'],file_id:b.file_id as string|null,ref_folder_id:b.ref_folder_id as string|null,width_pct:b.width_pct as number|null,checked:b.checked===null||b.checked===undefined?null:Boolean(b.checked)}]))
 const original=new Set(blocks.keys())
 const tasks=new Set(metadata.task_placements.map(t=>t.id))
 const created:Extract<DocumentOperation,{op:'create_task'}>[]=[]
 let outline:DocumentOutlineItem[]=[]
 for(const op of body.operations){
  // A checklist item always records a tick, so an omitted one is unchecked
  // rather than absent; every other kind carries none. That is the one
  // normalization this function does to a put_block, and it is what
  // page_blocks_checked_kind_check states in the database.
  if(op.op==='put_block')blocks.set(op.id,{...op,checked:op.block_kind==='checklist'?(op.checked??false):null})
  else if(op.op==='delete_block') {if(!blocks.delete(op.id))throw new DocumentRefusal('not_found','Block not found.')}
  else if(op.op==='create_task'){if(tasks.has(op.id)||created.some(t=>t.id===op.id))throw new DocumentRefusal('not_convertible','Task identity already exists.');created.push(op);tasks.add(op.id)}
  else outline=op.items
 }
 if(blocks.size>500)throw new DocumentRefusal('not_convertible','A page holds at most 500 blocks.')
 if(tasks.size>1000)throw new DocumentRefusal('not_convertible','A page holds at most 1000 Tasks.')
 // A Section's heading level is its depth in this outline and nothing else; depths
 // is the running ancestry measurement, recorded as each Section is accepted so that
 // a child reads its parent's rather than re-walking the chain.
 // listParents records each accepted list item's Section, so a nested item can
 // be checked against its parent's without re-walking the outline.
 const seen=new Set<string>();const depths=new Map<string,number>();const listParents=new Map<string,string|null>();let active:string[]=[]
 for(const item of outline){
  if(seen.has(item.id)||(item.kind==='block'?!blocks.has(item.id):!tasks.has(item.id)))throw new DocumentRefusal('not_convertible','The outline has unknown or repeated identities.')
  seen.add(item.id)
  const parent=item.section_block_id
  if(parent!==null && (blocks.get(parent)?.block_kind!=='section'||!seen.has(parent)))throw new DocumentRefusal('not_convertible','A parent must precede its content.')
  const block=item.kind==='block'?blocks.get(item.id):undefined
  const depth=parent===null?1:(depths.get(parent)??0)+1
  if(block?.block_kind==='section' && depth>MAX_SECTION_DEPTH)throw new DocumentRefusal('not_convertible',`Headings nest ${MAX_SECTION_DEPTH} levels deep at most.`)
  /*
  List nesting (#219), and it is a second relation rather than a second use of
  the one above. Everything it refuses is refused here, ahead of the first
  write, and every rule reads off the ordered outline:

  - only a bullet, a numbered item or a checklist item takes part at all, on
    either end, so a Task, a Section, a paragraph, a quote, a callout, a code
    block and an image can neither be nested nor be nested under;
  - the parent is a block of this same document, because it is looked up in
    `blocks`, which holds this folder's blocks and nothing else;
  - the parent precedes its descendants, which `seen` answers, and that is also
    the whole of the cycle rule: a relation in which every parent appears
    earlier in one finite order cannot close a loop.

  The last rule is the one deliberately added beyond the issue's list, and it is
  stated rather than assumed: a nested list item shares its list parent's
  Section. The two relations stay independent — neither is derived from the
  other and neither is inferred from proximity — but a child whose Section
  differs from its parent's describes a list that is inside two Sections at
  once, which no reader can draw. It is refused rather than stored.
  */
  const listParent=item.list_parent_block_id
  if(listParent!==null){
   if(item.kind!=='block'||block===undefined||!isListKind(block.block_kind))throw new DocumentRefusal('not_convertible','Only a bullet, numbered or checklist item is a nested list item.')
   const parentBlock=blocks.get(listParent)
   if(parentBlock===undefined||!isListKind(parentBlock.block_kind))throw new DocumentRefusal('not_convertible','A list item nests under another list item of this page.')
   if(!seen.has(listParent))throw new DocumentRefusal('not_convertible','A list parent must precede the items nested under it.')
   if(listParents.get(listParent)!==item.section_block_id)throw new DocumentRefusal('not_convertible',"A nested list item belongs to its list parent's Section.")
  }
  if(item.kind==='block'&&block!==undefined&&isListKind(block.block_kind))listParents.set(item.id,item.section_block_id)
  if(parent===null)active=[]
  else {const at=active.indexOf(parent);if(at<0)throw new DocumentRefusal('not_convertible','Heading content must form a contiguous group.');active=active.slice(0,at+1)}
  if(block?.block_kind==='section'){active.push(item.id);depths.set(item.id,depth)}
 }
 if(seen.size!==blocks.size+tasks.size)throw new DocumentRefusal('not_convertible','The outline must retain every Task and undeleted block.')
 /*
 The blocks this transaction writes, and the set every reference rule below is
 asked over. It is the same set the INSERT pass uses further down, hoisted here
 so that one answer to "what does this write store" governs both.

 **It was the merged document until the adversarial review of #220, and that
 was a trap rather than extra safety.** These rules are about what a write may
 store; they were never about auditing rows somebody else wrote, and three
 routes write `page_blocks.file_id` and `ref_folder_id` without passing through
 this function at all — `update_block`, `insert_block` and 7.16's legacy
 whole-page `PUT`. Migration 0024 records the ruling that leaves them alone,
 and the same ruling is why no CHECK stands behind them either. So a row this
 function would refuse is reachable today, and reading the rules over the
 merged document turned one into a page that reads perfectly and can never be
 saved again: every later transaction was refused for a row it was not
 touching, including one editing an unrelated paragraph. Deleting the offending
 block recovered it and nothing said so.

 Two more ways in that are nobody's mistake, which is what settles it.
 `page_blocks_file_id_fkey` is ON DELETE SET NULL, so 7.19's ordinary reclaim
 leaves a media block naming nothing; and trashing a folder makes every
 `folder_ref` block pointing at it unreachable. Neither is a bypass anyone
 forgot, and under the old reading either one made somebody's page permanently
 unsaveable.

 Nothing is weakened by the scope. A block outside this set is not written by
 the pass below, so no unvalidated `file_id` or `ref_folder_id` can reach the
 table through here; `set_outline` writes placement and never a reference. What
 changes is only which rows are *audited*, and auditing a row this transaction
 leaves exactly as it found it was never this function's job.
 */
 const changed = new Set(body.operations.flatMap(op=>op.op==='put_block'?[op.id]:[]))
 for(const block of blocks.values()){
  if(!changed.has(block.id))continue
  /*
  A block's file, in two questions that are asked in this order and are not the
  same question.

  **Scope first (10.2).** The row must be in this folder, and a row that is not
  and a row that does not exist answer identically, so the refusal discloses
  nothing either way. That clause is issue #107's; what it says is unchanged,
  and the only thing that moved is which blocks it is asked about, which the
  paragraph above this loop sets out.

  **Then the treatment (#220), and only for a caller who has already been told
  the file is here.** A media block's kind is the insertion mode the person
  chose and the server validated at upload: the same JPG is an Image block when
  it was dropped as media and a File block when it was inserted through the
  File command, and `BLOCK_FILE_KINDS` is the table that keeps them apart. The
  server **never re-derives which from the filename or the extension** — those
  are presentation and are not security truth — so what it does instead is
  refuse a pairing the upload did not produce.

  It fails closed in the direction that matters. A `file` row is untrusted
  bytes of any type, served as an attachment with nosniff; an `image`, `audio`
  or `video` row passed a validation on the way in and is served inline. So a
  `file` row may never be dressed as previewable media, which is the mismatch
  with consequences, and previewable bytes may not be quietly demoted into a
  File block either, because a File block is one by virtue of how its bytes
  were uploaded.

  Both run before the first write, with everything else in this function.
  */
  if(block.file_id!==null){
   const files=await rowsOf(tx,sql`SELECT id,kind FROM files WHERE id=${block.file_id}::uuid AND folder_id=${folderId}::uuid`)
   const file=files[0]
   if(file===undefined)throw new DocumentRefusal('file_not_here','That file is not in this folder.')
   if(isMediaKind(block.block_kind)&&!(BLOCK_FILE_KINDS[block.block_kind] as readonly string[]).includes(String(file.kind)))throw new DocumentRefusal('file_kind_mismatch',`This ${block.block_kind} block names a file uploaded as ${String(file.kind)}. Upload it again as the kind you mean to insert.`)
  }
  if(block.ref_folder_id!==null){const refs=await rowsOf(tx,sql`SELECT f.id FROM folders f JOIN folder_members m ON m.folder_id=f.id WHERE f.id=${block.ref_folder_id}::uuid AND m.user_id=${viewerId}::uuid AND f.deleted_at IS NULL`);if(refs.length===0)throw new DocumentRefusal('not_found','Referenced folder is not accessible.')}
 }
 const fresh=[...blocks.keys()].filter(id=>!original.has(id)).concat(created.map(t=>t.id))
 if(fresh.length){const collisions=await rowsOf(tx,sql`SELECT id FROM page_blocks WHERE id IN (${sql.join(fresh.map(id=>sql`${id}::uuid`),sql`,`)}) UNION ALL SELECT id FROM tasks WHERE id IN (${sql.join(fresh.map(id=>sql`${id}::uuid`),sql`,`)})`);if(collisions.length)throw new DocumentRefusal('not_convertible','An inserted identity already exists.')}
 // All authorization and final-state validation precede the first write.
 for(const id of original)if(!blocks.has(id))await tx.execute(sql`DELETE FROM page_blocks WHERE id=${id}::uuid`)
 /* `checked` travels with the block rather than with the outline, because a
    tick is authored content and not placement. A kind that stops being a
    checklist loses it in the same statement that changes the kind, which is
    what keeps page_blocks_checked_kind_check satisfied without a second pass. */
 for(const block of blocks.values())if(changed.has(block.id))await tx.execute(sql`INSERT INTO page_blocks (id,folder_id,kind,position,text,rich_content,file_id,ref_folder_id,width_pct,checked) VALUES (${block.id}::uuid,${folderId}::uuid,${block.block_kind},0,${block.text},${block.rich_content === null ? null : JSON.stringify(block.rich_content)}::jsonb,${block.file_id}::uuid,${block.ref_folder_id}::uuid,${block.width_pct},${block.checked}) ON CONFLICT (id) DO UPDATE SET kind=EXCLUDED.kind,text=EXCLUDED.text,rich_content=EXCLUDED.rich_content,file_id=EXCLUDED.file_id,ref_folder_id=EXCLUDED.ref_folder_id,width_pct=EXCLUDED.width_pct,checked=EXCLUDED.checked,list_parent_block_id=CASE WHEN EXCLUDED.kind IN ('bullet','numbered','checklist') THEN page_blocks.list_parent_block_id ELSE NULL END,updated_at=now()`)
 for(const task of created){const result=await createTaskIn(tx,viewerId,{folder_id:folderId,title:task.title},{id:task.id,pagePosition:'a0'});if(result.kind!=='created')throw new DocumentRefusal('not_convertible','Task creation was refused.')}
 const keys=initialKeys(outline.length)
 // List parentage is structure, so a save that only re-nests a list item must
 // reach the pass below; without it in this comparison the outline would be
 // accepted and the nesting silently not written.
 const structureChanged=outline.length!==previousOutline.length || outline.some((item,index)=>{const prior=previousOutline[index];return prior?.id!==item.id||prior.kind!==item.kind||prior.sectionBlockId!==item.section_block_id||prior.listParentBlockId!==item.list_parent_block_id||prior.pagePosition===null})
 if(structureChanged)for(const [index,item] of outline.entries())await tx.execute(item.kind==='block'?sql`UPDATE page_blocks SET page_position=${keys[index]},position=${index},section_block_id=${item.section_block_id}::uuid,list_parent_block_id=${item.list_parent_block_id}::uuid WHERE id=${item.id}::uuid`:sql`UPDATE tasks SET page_position=${keys[index]},section_block_id=${item.section_block_id}::uuid WHERE id=${item.id}::uuid`)
 const named=await rowsOf(tx,sql`SELECT name FROM folders WHERE id=${folderId}::uuid`)
 await recordEvent(tx,{actorId:viewerId,verb:'edited',subjectKind:'folder',subjectId:folderId,subjectName:String(named[0]?.name??''),folderId,detail:'edited the page'})
 const committed=await documentMetadata(tx,folderId)
 await tx.execute(sql`INSERT INTO page_document_receipts (actor_id,folder_id,mutation_id,payload_hash,committed_revision,created_task_ids) VALUES (${viewerId}::uuid,${folderId}::uuid,${body.mutation_id}::uuid,${hash},${committed.revision},${JSON.stringify(created.map(t=>t.id))}::jsonb)`)
 return {mutation_id:body.mutation_id,committed_revision:committed.revision,replayed:false,created_task_ids:created.map(t=>t.id)}
}
