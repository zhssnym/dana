import { sql } from 'drizzle-orm'
import type { Executor } from '../database.js'
import { rowsOf } from '../database.js'
import type { DocumentTransaction, DocumentOperation, DocumentOutlineItem } from '../../shared/pages.js'
import { BLOCK_FILE_KINDS, MAX_SECTION_DEPTH, isMediaKind } from '../../shared/page-document.js'
import { nestingProblem } from './document-outline.js'
import { hashableBlocks } from './document-hash.js'
import { initialKeys } from './fractional-index.js'
import { createTaskIn } from './tasks.js'
import { positionedItems } from './page-order.js'
import { recordEvent } from './events.js'
import { syncMentions } from './mentions.js'
import { createSubPage, trashFolderSubtree } from './folders.js'
import { folderActorFacts, mayPerform } from './folder-access.js'
import { restoreTrashedPage } from './page-tree.js'

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
 const blocks=hashableBlocks(await rowsOf(tx,sql`SELECT id,kind,text,rich_content,file_id,ref_folder_id,width_pct,section_block_id,list_parent_block_id,checked,page_position,position,toggleable FROM page_blocks WHERE folder_id=${folderId}::uuid ORDER BY id`))
 const tasks=await rowsOf(tx,sql`SELECT id,section_block_id,page_position FROM tasks WHERE folder_id=${folderId}::uuid AND deleted_at IS NULL ORDER BY id`)
 return {revision:documentHash({blocks,tasks}),task_placements:tasks.map(t=>({id:String(t.id),section_block_id:t.section_block_id==null?null:String(t.section_block_id)}))}
}
/** Whether a Main-document transaction changes the page tree: it creates or
 * trashes a sub-page, or puts a `page` block (which may re-home or restore
 * one). Such a transaction takes the tree lock before the folder row. */
export function touchesPageTree(body:DocumentTransaction):boolean {
 return body.operations.some(op=>op.op==='create_page'||op.op==='trash_page'||(op.op==='put_block'&&op.block_kind==='page'))
}
const PAGE_BLOCK_RETAINED='A page block leaves only when its page goes to Trash.'
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
 const stored=await rowsOf(tx,sql`SELECT id,kind,text,rich_content,file_id,ref_folder_id,width_pct,page_position,position,section_block_id,list_parent_block_id,checked,toggleable FROM page_blocks WHERE folder_id=${folderId}::uuid FOR UPDATE`)
 const blocks=new Map<string,BlockOp>(stored.map(b=>[String(b.id),{op:'put_block',id:String(b.id),block_kind:b.kind as BlockOp['block_kind'],text:b.text as string|null,rich_content:b.rich_content as BlockOp['rich_content'],file_id:b.file_id as string|null,ref_folder_id:b.ref_folder_id as string|null,width_pct:b.width_pct as number|null,checked:b.checked===null||b.checked===undefined?null:Boolean(b.checked),toggleable:b.toggleable===true?true:null}]))
 const original=new Set(blocks.keys())
 const tasks=new Set(metadata.task_placements.map(t=>t.id))
 const created:Extract<DocumentOperation,{op:'create_task'}>[]=[]
 const createdPages:Extract<DocumentOperation,{op:'create_page'}>[]=[]
 const trashedPages=new Set<string>()
 let outline:DocumentOutlineItem[]=[]
 for(const op of body.operations){
  // A checklist item always records a tick, so an omitted one is unchecked
  // rather than absent; every other kind carries none. That is the one
  // normalization this function does to a put_block, and it is what
  // page_blocks_checked_kind_check states in the database.
  if(op.op==='put_block'){
   // A presentation heading (heading1-3, `toggleable` or not) is writing on
   // Main as on a facet: it groups nothing, so it never names a Section and
   // `section_block_id` below still admits only a `section` as a parent.
   blocks.set(op.id,{...op,checked:op.block_kind==='checklist'?(op.checked??false):null,toggleable:op.toggleable===true?true:null})
  }
  else if(op.op==='delete_block') {if(!blocks.delete(op.id))throw new DocumentRefusal('not_found','Block not found.')}
  else if(op.op==='create_task'){if(tasks.has(op.id)||created.some(t=>t.id===op.id))throw new DocumentRefusal('not_convertible','Task identity already exists.');created.push(op);tasks.add(op.id)}
  /* Wave 2: a sub-page and its home `page` block, made together. The block is
     an ordinary member of the block set from here on, so the outline must
     place it like any other; the folder row is written after validation. */
  else if(op.op==='create_page'){
   if(op.id===op.block_id||blocks.has(op.block_id)||createdPages.some(p=>p.id===op.id||p.block_id===op.block_id))throw new DocumentRefusal('not_convertible','An inserted identity already exists.')
   createdPages.push(op)
   blocks.set(op.block_id,{op:'put_block',id:op.block_id,block_kind:'page',text:null,rich_content:null,file_id:null,ref_folder_id:op.id,width_pct:null,checked:null,toggleable:null})
  }
  else if(op.op==='trash_page')trashedPages.add(op.folder_id)
  else if(op.op==='set_outline')outline=op.items
  else {const unknown:never=op;throw new DocumentRefusal('not_convertible',`Unknown operation ${String((unknown as {op?:unknown}).op)}.`)}
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
 // Block nesting (0038): parent kind, precedence, one Section, depth -- the
 // rule every document home shares (`document-outline.ts`).
 const nesting=nestingProblem(outline,(id)=>blocks.get(id)?.block_kind)
 if(nesting!==null)throw new DocumentRefusal('not_convertible',nesting)
 /*
 The blocks this transaction writes, and the set every reference rule below is
 asked over. It is the same set the INSERT pass uses further down, hoisted here
 so that one answer to "what does this write store" governs both.

 **It was the merged document until the adversarial review of #220, and that
 was a trap rather than extra safety.** These rules are about what a write may
 store; they were never about auditing rows somebody else wrote, and three
 routes write `page_blocks.file_id` and `ref_folder_id` without passing through
 this function at all — `update_block`, `insert_block` and 7.16's legacy
 whole-page `PUT`. Migration 0024 leaves them alone, and no CHECK stands
 behind them either. So a row this
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
 const changed = new Set(body.operations.flatMap(op=>op.op==='put_block'?[op.id]:op.op==='create_page'?[op.block_id]:[]))
 const tree=await pageTreeRules(tx,viewerId,folderId,{stored,blocks,original,createdPages,trashedPages})
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
  // A `page` block's reference was judged by `pageTreeRules` above.
  if(block.ref_folder_id!==null&&block.block_kind!=='page'){const refs=await rowsOf(tx,sql`SELECT f.id FROM folders f JOIN folder_members m ON m.folder_id=f.id WHERE f.id=${block.ref_folder_id}::uuid AND m.user_id=${viewerId}::uuid AND f.deleted_at IS NULL`);if(refs.length===0)throw new DocumentRefusal('not_found','Referenced folder is not accessible.')}
 }
 const fresh=[...blocks.keys()].filter(id=>!original.has(id)).concat(created.map(t=>t.id),createdPages.map(p=>p.id))
 if(new Set(fresh).size!==fresh.length)throw new DocumentRefusal('not_convertible','An inserted identity already exists.')
 if(fresh.length){const ids=sql.join(fresh.map(id=>sql`${id}::uuid`),sql`,`);const collisions=await rowsOf(tx,sql`SELECT id FROM page_blocks WHERE id IN (${ids}) UNION ALL SELECT id FROM tasks WHERE id IN (${ids}) UNION ALL SELECT id FROM folders WHERE id IN (${ids})`);if(collisions.length)throw new DocumentRefusal('not_convertible','An inserted identity already exists.')}
 // All authorization and final-state validation precede the first write.
 /* The tree writes come first: a trashed page goes (with the sub-pages its
    actor may trash), a re-put page comes back, and a new page's folder row
    exists before the `page` block that references it is inserted. A refusal
    from `createSubPage` rolls the whole transaction back like any other. */
 for(const id of tree.toTrash)await trashFolderSubtree(tx,viewerId,id)
 for(const page of tree.toRestore)await restoreTrashedPage(tx,viewerId,page.id,page.name)
 for(const page of createdPages){
  const made=await createSubPage(tx,viewerId,folderId,{id:page.id,name:page.title,homeBlock:false})
  if(made.kind==='parent_not_found')throw new DocumentRefusal('not_found','Folder not found.')
  if(made.kind==='forbidden')throw new DocumentRefusal('not_convertible',made.reason)
  if(made.kind==='too_deep')throw new DocumentRefusal('not_convertible','Pages nest 20 levels deep at most.')
  if(made.kind==='default_parent')throw new DocumentRefusal('not_convertible','A default folder holds no sub-pages.')
  if(made.kind==='folder_cap')throw new DocumentRefusal('not_convertible','You have reached the folder limit.')
 }
 for(const id of original)if(!blocks.has(id))await tx.execute(sql`DELETE FROM page_blocks WHERE id=${id}::uuid`)
 /* `checked` travels with the block rather than with the outline, because a
    tick is authored content and not placement. A kind that stops being a
    checklist loses it in the same statement that changes the kind, which is
    what keeps page_blocks_checked_kind_check satisfied without a second pass. */
 /* Issue #267: `file_reclaimed_at` survives a rewrite that leaves the block the
    same kind with no file — the deployed client re-sends a reclaimed image with
    `file_id: null` whenever its caption changes, and must not erase the only
    record that a picture was there — and clears once the block gets a file or
    becomes another kind. */
 for(const block of blocks.values())if(changed.has(block.id))await tx.execute(sql`INSERT INTO page_blocks (id,folder_id,kind,position,text,rich_content,file_id,ref_folder_id,width_pct,checked,toggleable) VALUES (${block.id}::uuid,${folderId}::uuid,${block.block_kind},0,${block.text},${block.rich_content === null ? null : JSON.stringify(block.rich_content)}::jsonb,${block.file_id}::uuid,${block.ref_folder_id}::uuid,${block.width_pct},${block.checked},${block.toggleable}) ON CONFLICT (id) DO UPDATE SET kind=EXCLUDED.kind,text=EXCLUDED.text,rich_content=EXCLUDED.rich_content,file_id=EXCLUDED.file_id,ref_folder_id=EXCLUDED.ref_folder_id,width_pct=EXCLUDED.width_pct,checked=EXCLUDED.checked,toggleable=EXCLUDED.toggleable,file_reclaimed_at=CASE WHEN EXCLUDED.file_id IS NULL AND EXCLUDED.kind=page_blocks.kind THEN page_blocks.file_reclaimed_at END,list_parent_block_id=CASE WHEN EXCLUDED.kind <> 'section' THEN page_blocks.list_parent_block_id ELSE NULL END,updated_at=now()`)
 for(const task of created){const result=await createTaskIn(tx,viewerId,{folder_id:folderId,title:task.title},{id:task.id,pagePosition:'a0'});if(result.kind!=='created')throw new DocumentRefusal('not_convertible','Task creation was refused.')}
 const keys=initialKeys(outline.length)
 // List parentage is structure, so a save that only re-nests a list item must
 // reach the pass below; without it in this comparison the outline would be
 // accepted and the nesting silently not written.
 const structureChanged=outline.length!==previousOutline.length || outline.some((item,index)=>{const prior=previousOutline[index];return prior?.id!==item.id||prior.kind!==item.kind||prior.sectionBlockId!==item.section_block_id||prior.listParentBlockId!==item.list_parent_block_id||prior.pagePosition===null})
 if(structureChanged)for(const [index,item] of outline.entries())await tx.execute(item.kind==='block'?sql`UPDATE page_blocks SET page_position=${keys[index]},position=${index},section_block_id=${item.section_block_id}::uuid,list_parent_block_id=${item.list_parent_block_id}::uuid WHERE id=${item.id}::uuid`:sql`UPDATE tasks SET page_position=${keys[index]},section_block_id=${item.section_block_id}::uuid WHERE id=${item.id}::uuid`)
 await syncMentions(tx,{pageFolderId:folderId,actorId:viewerId,blockIds:changed,refuse:m=>new DocumentRefusal('not_convertible',m,'rich_content')})
 const named=await rowsOf(tx,sql`SELECT name FROM folders WHERE id=${folderId}::uuid`)
 await recordEvent(tx,{actorId:viewerId,verb:'edited',subjectKind:'folder',subjectId:folderId,subjectName:String(named[0]?.name??''),folderId,detail:'edited the page'})
 const committed=await documentMetadata(tx,folderId)
 await tx.execute(sql`INSERT INTO page_document_receipts (actor_id,folder_id,mutation_id,payload_hash,committed_revision,created_task_ids) VALUES (${viewerId}::uuid,${folderId}::uuid,${body.mutation_id}::uuid,${hash},${committed.revision},${JSON.stringify(created.map(t=>t.id))}::jsonb)`)
 return {mutation_id:body.mutation_id,committed_revision:committed.revision,replayed:false,created_task_ids:created.map(t=>t.id)}
}

/*
Wave 2's rules for `page` blocks in a Folder's Main document, asked over the
final block set before anything is written. A `page` block is a sub-page's
home: it names one page whose parent is this folder, the database keeps at most
one per page (`page_blocks_page_home_idx`), and it is how the page appears in
this document.

- **Retention, like a Task's.** Every stored `page` block is still here at the
  end, the same kind naming the same page, unless the same transaction sends
  its page to Trash (`trash_page`). Deleting one, retyping it or pointing it
  elsewhere is refused and nothing is written.
- **`trash_page` names a page this document holds**, and its block must be gone
  at the end. It needs `folder.trash` on that page; a page the viewer is not a
  member of answers 404 and nothing else. A page already in Trash (its block
  outlived it, e.g. a sub-page trashed with a grandparent) is only unhomed.
- **`create_page`'s block must be here at the end**, naming the page it made.
- **A new `page` block for an existing page** re-homes a sub-page of this
  folder that has no home block: a live one simply gets it, and one in Trash
  that went there on its own is restored in place (`folder.restore`) -- the
  editor's Undo of "Move page to Trash". Anything else is refused.
*/
async function pageTreeRules(tx:Executor,viewerId:string,folderId:string,state:{stored:Record<string,unknown>[],blocks:Map<string,BlockOp>,original:Set<string>,createdPages:Extract<DocumentOperation,{op:'create_page'}>[],trashedPages:Set<string>}):Promise<{toTrash:string[],toRestore:{id:string,name:string}[]}>{
 const {stored,blocks,original,createdPages,trashedPages}=state
 const storedPages=new Map<string,string>()
 for(const row of stored)if(row.kind==='page')storedPages.set(String(row.id),String(row.ref_folder_id))
 const storedRefs=new Set(storedPages.values())
 const finalRefs=new Map<string,string>()
 for(const block of blocks.values()){
  if(block.block_kind!=='page')continue
  const ref=block.ref_folder_id as string
  if(finalRefs.has(ref))throw new DocumentRefusal('not_convertible','A page has one page block.')
  finalRefs.set(ref,block.id)
  if(original.has(block.id)&&!storedPages.has(block.id))throw new DocumentRefusal('not_convertible','A block does not turn into a page block; create the page instead.')
 }
 for(const [id,ref] of storedPages){
  const now=blocks.get(id)
  if(now===undefined?!trashedPages.has(ref):(now.block_kind!=='page'||now.ref_folder_id!==ref))throw new DocumentRefusal('not_convertible',PAGE_BLOCK_RETAINED)
 }
 const toTrash:string[]=[]
 for(const ref of trashedPages){
  if(!storedRefs.has(ref))throw new DocumentRefusal('not_found','Page not found.')
  const facts=await folderActorFacts(tx,viewerId,ref,{includeTrashed:true})
  if(facts===null)throw new DocumentRefusal('not_found','Page not found.')
  if(finalRefs.has(ref))throw new DocumentRefusal('not_convertible','A page going to Trash leaves its page block.')
  const live=await rowsOf(tx,sql`SELECT 1 FROM folders WHERE id=${ref}::uuid AND deleted_at IS NULL FOR UPDATE`)
  if(live.length===0)continue
  const decision=mayPerform(facts,'folder.trash')
  if(!decision.allowed||facts.isDefault)throw new DocumentRefusal('not_convertible',decision.allowed?'A default folder is never moved to Trash.':decision.reason)
  toTrash.push(ref)
 }
 const made=new Map(createdPages.map(p=>[p.id,p.block_id]))
 for(const [id,blockId] of made)if(finalRefs.get(id)!==blockId)throw new DocumentRefusal('not_convertible','A new page keeps its page block in the outline.')
 const toRestore:{id:string,name:string}[]=[]
 for(const [ref,blockId] of finalRefs){
  if(original.has(blockId)||made.has(ref))continue
  const facts=await folderActorFacts(tx,viewerId,ref,{includeTrashed:true})
  if(facts===null)throw new DocumentRefusal('not_found','Referenced page is not accessible.')
  const rows=await rowsOf(tx,sql`SELECT f.parent_folder_id,(f.deleted_at IS NOT NULL) AS trashed,f.trashed_with_folder_id,EXISTS(SELECT 1 FROM page_blocks h WHERE h.kind='page' AND h.ref_folder_id=f.id) AS homed FROM folders f WHERE f.id=${ref}::uuid FOR UPDATE OF f`)
  const row=rows[0]
  if(row===undefined||row.parent_folder_id===null||String(row.parent_folder_id)!==folderId)throw new DocumentRefusal('not_convertible','A page block stands for a page under this one.')
  if(row.homed===true)throw new DocumentRefusal('not_convertible','That page already has its page block.')
  if(row.trashed!==true)continue
  if(row.trashed_with_folder_id!==null)throw new DocumentRefusal('not_convertible','That page went to Trash with another page; restore that one.')
  const decision=mayPerform(facts,'folder.restore')
  if(!decision.allowed)throw new DocumentRefusal('not_convertible',decision.reason)
  toRestore.push({id:ref,name:facts.name})
 }
 return {toTrash,toRestore}
}
