import { sql } from 'drizzle-orm'
import type { Executor } from '../database.js'
import { rowsOf } from '../database.js'
import type { DocumentTransaction, DocumentOperation, DocumentOutlineItem } from '../../shared/pages.js'
import { BLOCK_FILE_KINDS, MAX_SECTION_DEPTH, isMediaKind } from '../../shared/page-document.js'
import { allowedIn } from '../../shared/block-kinds.js'
import { refusedKindMessage } from './document-body.js'
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
export { documentHash } from './document-hash.js'
import { documentHash } from './document-hash.js'
/* `field` is set only by `importWorkflow`, which knows the page's path in a workflow file (folders.<n>.page). */
export class DocumentRefusal extends Error { constructor(readonly kind:'stale'|'not_convertible'|'file_not_here'|'file_kind_mismatch'|'not_found',message:string,readonly field?:string){super(message)} }
export async function documentMetadata(tx:Executor,folderId:string|null,facetId?:string) {
 if(folderId===null)return {revision:documentHash(null),task_placements:[]}
 const blocks=hashableBlocks(await rowsOf(tx,sql`SELECT id,kind,text,rich_content,file_id,ref_folder_id,width_pct,section_block_id,list_parent_block_id,checked,page_position,position,toggleable FROM page_blocks WHERE folder_id=${folderId}::uuid AND ${facetId===undefined?sql`(page_facet_id IS NULL OR page_facet_id=(SELECT id FROM page_facets WHERE content_folder_id=${folderId}::uuid))`:sql`page_facet_id=${facetId}::uuid`} ORDER BY id`))
 const tasks=await rowsOf(tx,sql`SELECT id,section_block_id,page_position FROM tasks WHERE folder_id=${folderId}::uuid AND ${facetId===undefined?sql`(page_facet_id IS NULL OR page_facet_id=(SELECT id FROM page_facets WHERE content_folder_id=${folderId}::uuid))`:sql`page_facet_id=${facetId}::uuid`} AND deleted_at IS NULL ORDER BY id`)
 return {revision:documentHash({blocks,tasks}),task_placements:tasks.map(t=>({id:String(t.id),section_block_id:t.section_block_id==null?null:String(t.section_block_id)}))}
}
/** Whether a Main-document transaction changes the page tree. Such a transaction takes the tree lock before the folder row. */
export function touchesPageTree(body:DocumentTransaction):boolean {
 return body.operations.some(op=>op.op==='create_page'||op.op==='trash_page'||(op.op==='put_block'&&op.block_kind==='page'))
}
const PAGE_BLOCK_RETAINED='A page block leaves only when its page goes to Trash.'
export async function applyDocument(tx:Executor,viewerId:string,folderId:string,body:DocumentTransaction,facetId?:string) {
 const hash=documentHash(body)
 const receipts=await rowsOf(tx,sql`SELECT payload_hash,committed_revision,created_task_ids,page_facet_id FROM page_document_receipts WHERE actor_id=${viewerId}::uuid AND folder_id=${folderId}::uuid AND mutation_id=${body.mutation_id}::uuid`)
 const receipt=receipts[0]
 if(receipt){
  if((receipt.page_facet_id == null ? null : String(receipt.page_facet_id)) !== (facetId ?? null))throw new DocumentRefusal('stale','This mutation belongs to another Facet.')
  if(receipt.payload_hash!==hash)throw new DocumentRefusal('stale','This retry identity already belongs to a different edit.')
  return {mutation_id:body.mutation_id,committed_revision:String(receipt.committed_revision),replayed:true,created_task_ids:receipt.created_task_ids as string[]}
 }
 const previousOutline=await positionedItems(tx,folderId,facetId)
 const metadata=await documentMetadata(tx,folderId,facetId)
 if(metadata.revision!==body.base_revision)throw new DocumentRefusal('stale','The page changed. Your draft is retained; reconcile it with the current page.')
 const stored=await rowsOf(tx,sql`SELECT id,kind,text,rich_content,file_id,ref_folder_id,width_pct,page_position,position,section_block_id,list_parent_block_id,checked,toggleable FROM page_blocks WHERE folder_id=${folderId}::uuid AND ${facetId===undefined?sql`(page_facet_id IS NULL OR page_facet_id=(SELECT id FROM page_facets WHERE content_folder_id=${folderId}::uuid))`:sql`page_facet_id=${facetId}::uuid`} FOR UPDATE`)
 const blocks=new Map<string,BlockOp>(stored.map(b=>[String(b.id),{op:'put_block',id:String(b.id),block_kind:b.kind as BlockOp['block_kind'],text:b.text as string|null,rich_content:b.rich_content as BlockOp['rich_content'],file_id:b.file_id as string|null,ref_folder_id:b.ref_folder_id as string|null,width_pct:b.width_pct as number|null,checked:b.checked===null||b.checked===undefined?null:Boolean(b.checked),toggleable:b.toggleable===true?true:null}]))
 const original=new Set(blocks.keys())
 const tasks=new Set(metadata.task_placements.map(t=>t.id))
 // What a page stores follows its kind: Work stores `work`, Doc and an unpicked root `doc`; Discussion holds threads.
 const kindRows=await rowsOf(tx,sql`SELECT kind FROM folders WHERE id=${folderId}::uuid`)
 const pageKind=kindRows[0]?.kind==null?null:String(kindRows[0].kind)
 if(pageKind==='discussion')throw new DocumentRefusal('not_convertible','A Discussion page holds threads, not writing.')
 const home=facetId===undefined?(pageKind==='work'?'work':'doc'):'work'
 const created:Extract<DocumentOperation,{op:'create_task'}>[]=[]
 const createdPages:Extract<DocumentOperation,{op:'create_page'}>[]=[]
 const trashedPages=new Set<string>()
 let outline:DocumentOutlineItem[]=[]
 for(const op of body.operations){
  // A checklist item always records a tick, so an omitted one is unchecked (page_blocks_checked_kind_check).
  if(op.op==='put_block'){
   if(!allowedIn(op.block_kind,home))throw new DocumentRefusal('not_convertible',refusedKindMessage(op.block_kind,home))
   // A presentation heading groups nothing, so it never names a Section.
   blocks.set(op.id,{...op,checked:op.block_kind==='checklist'?(op.checked??false):null,toggleable:op.toggleable===true?true:null})
  }
  else if(op.op==='delete_block') {if(!blocks.delete(op.id))throw new DocumentRefusal('not_found','Block not found.')}
  else if(op.op==='create_task'){
   // Tasks belong on Work pages. Legacy placements on a Doc stay readable, but no new Task may be created there.
   if(home!=='work')throw new DocumentRefusal('not_convertible','A Task belongs on a Work page.')
   if(tasks.has(op.id)||created.some(t=>t.id===op.id))throw new DocumentRefusal('not_convertible','Task identity already exists.')
   created.push(op);tasks.add(op.id)
  }
  /* A sub-page and its home `page` block, made together. The folder row is written after validation. */
  else if(op.op==='create_page'){
   if(op.id===op.block_id||blocks.has(op.block_id)||createdPages.some(p=>p.id===op.id||p.block_id===op.block_id))throw new DocumentRefusal('not_convertible','An inserted identity already exists.')
   createdPages.push(op)
   blocks.set(op.block_id,{op:'put_block',id:op.block_id,block_kind:'page',text:null,rich_content:null,file_id:null,ref_folder_id:op.id,width_pct:null,checked:null,toggleable:null})
  }
  else if(op.op==='trash_page')trashedPages.add(op.folder_id)
  else if(op.op==='set_outline')outline=op.items
  else {const unknown:never=op;throw new DocumentRefusal('not_convertible',`Unknown operation ${String((unknown as {op?:unknown}).op)}.`)}
 }
 // Only growth past the cap is refused, so a page already over it still saves edits that add no blocks.
 if(blocks.size>500&&blocks.size>original.size)throw new DocumentRefusal('not_convertible','A page holds at most 500 blocks.')
 if(tasks.size>1000)throw new DocumentRefusal('not_convertible','A page holds at most 1000 Tasks.')
 // A Section's heading level is its depth in this outline; `depths` records each accepted Section's depth.
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
 const nesting=nestingProblem(outline,(id)=>blocks.get(id)?.block_kind)
 if(nesting!==null)throw new DocumentRefusal('not_convertible',nesting)
 /*
 Reference rules audit only the blocks this transaction writes, not the merged document.
 Other routes and ON DELETE SET NULL can leave stored rows these rules would refuse; auditing them
 would make a page permanently unsaveable. Blocks outside this set are not written below.
  */
 const changed = new Set(body.operations.flatMap(op=>op.op==='put_block'?[op.id]:op.op==='create_page'?[op.block_id]:[]))
 const tree=await pageTreeRules(tx,viewerId,folderId,{stored,blocks,original,createdPages,trashedPages})
 for(const block of blocks.values()){
  if(!changed.has(block.id))continue
  /*
  A block's file: scope first (in this folder, else the same answer as missing, 10.2), then treatment.
  The block kind must match the upload's kind (`BLOCK_FILE_KINDS`), never re-derived from the filename:
  a `file` row is untrusted bytes and must never be dressed as inline media.
   */
  if(block.file_id!==null){
   const files=await rowsOf(tx,sql`SELECT id,kind FROM files WHERE id=${block.file_id}::uuid AND folder_id=${folderId}::uuid`)
   const file=files[0]
   if(file===undefined)throw new DocumentRefusal('file_not_here','That file is not in this folder.')
   if(isMediaKind(block.block_kind)&&!(BLOCK_FILE_KINDS[block.block_kind] as readonly string[]).includes(String(file.kind)))throw new DocumentRefusal('file_kind_mismatch',`This ${block.block_kind} block names a file uploaded as ${String(file.kind)}. Upload it again as the kind you mean to insert.`)
  }
  if(block.block_kind==='person'){
   const member=await rowsOf(tx,sql`SELECT 1 AS present FROM visible_folder_members m JOIN folders f ON f.project_id=m.folder_id WHERE f.id=${folderId}::uuid AND m.user_id=${block.text}::uuid`)
   if(member.length===0)throw new DocumentRefusal('not_found','This person is not on the Team.')
  }
  // A `page` block's reference was judged by `pageTreeRules` above.
  if(block.ref_folder_id!==null&&block.block_kind!=='page'&&(await folderActorFacts(tx,viewerId,block.ref_folder_id))===null)throw new DocumentRefusal('not_found','Referenced folder is not accessible.')
 }
 const fresh=[...blocks.keys()].filter(id=>!original.has(id)).concat(created.map(t=>t.id),createdPages.map(p=>p.id))
 if(new Set(fresh).size!==fresh.length)throw new DocumentRefusal('not_convertible','An inserted identity already exists.')
 if(fresh.length){const ids=sql.join(fresh.map(id=>sql`${id}::uuid`),sql`,`);const collisions=await rowsOf(tx,sql`SELECT id FROM page_blocks WHERE id IN (${ids}) UNION ALL SELECT id FROM tasks WHERE id IN (${ids}) UNION ALL SELECT id FROM folders WHERE id IN (${ids})`);if(collisions.length)throw new DocumentRefusal('not_convertible','An inserted identity already exists.')}
 // All authorization and validation precede the first write.
 /* Tree writes first, so a new page's folder row exists before its `page` block is inserted. */
 for(const id of tree.toTrash)await trashFolderSubtree(tx,viewerId,id)
 for(const page of tree.toRestore){
  await restoreTrashedPage(tx,viewerId,page.id,page.name)
  if(facetId!==undefined)await tx.execute(sql`UPDATE folders SET containing_facet_id=${facetId}::uuid WHERE id=${page.id}::uuid`)
 }
 for(const page of createdPages){
  const made=await createSubPage(tx,viewerId,folderId,{id:page.id,name:page.title,homeBlock:false})
  if(made.kind==='parent_not_found')throw new DocumentRefusal('not_found','Folder not found.')
  if(made.kind==='forbidden')throw new DocumentRefusal('not_convertible',made.reason)
  if(made.kind==='too_deep')throw new DocumentRefusal('not_convertible','Pages nest 20 levels deep at most.')
  if(made.kind==='default_parent')throw new DocumentRefusal('not_convertible','A default folder holds no sub-pages.')
  if(made.kind==='profile_doc_kind')throw new DocumentRefusal('not_convertible','A profile Doc holds Doc pages only.')
  if(made.kind==='folder_cap')throw new DocumentRefusal('not_convertible','You have reached the folder limit.')
  if(facetId!==undefined)await tx.execute(sql`UPDATE folders SET containing_facet_id=${facetId}::uuid WHERE id=${page.id}::uuid`)
 }
 for(const id of original)if(!blocks.has(id))await tx.execute(sql`DELETE FROM page_blocks WHERE id=${id}::uuid`)
 /* A kind that stops being a checklist loses `checked` in the same statement (page_blocks_checked_kind_check).
 `file_reclaimed_at` survives a rewrite of the same kind with no file, since the client re-sends reclaimed
 images with `file_id: null`; it clears once the block gets a file or changes kind. */
 for(const block of blocks.values())if(changed.has(block.id))await tx.execute(sql`INSERT INTO page_blocks (id,folder_id,page_facet_id,kind,position,text,rich_content,file_id,ref_folder_id,width_pct,checked,toggleable) VALUES (${block.id}::uuid,${folderId}::uuid,${facetId??null}::uuid,${block.block_kind},0,${block.text},${block.rich_content === null ? null : JSON.stringify(block.rich_content)}::jsonb,${block.file_id}::uuid,${block.ref_folder_id}::uuid,${block.width_pct},${block.checked},${block.toggleable}) ON CONFLICT (id) DO UPDATE SET page_facet_id=EXCLUDED.page_facet_id,kind=EXCLUDED.kind,text=EXCLUDED.text,rich_content=EXCLUDED.rich_content,file_id=EXCLUDED.file_id,ref_folder_id=EXCLUDED.ref_folder_id,width_pct=EXCLUDED.width_pct,checked=EXCLUDED.checked,toggleable=EXCLUDED.toggleable,file_reclaimed_at=CASE WHEN EXCLUDED.file_id IS NULL AND EXCLUDED.kind=page_blocks.kind THEN page_blocks.file_reclaimed_at END,list_parent_block_id=CASE WHEN EXCLUDED.kind <> 'section' THEN page_blocks.list_parent_block_id ELSE NULL END,updated_at=now()`)
 for(const task of created){
  const result=await createTaskIn(tx,viewerId,{folder_id:folderId,title:task.title},{id:task.id,pagePosition:'a0'})
  if(result.kind!=='created')throw new DocumentRefusal('not_convertible','Task creation was refused.')
  if(facetId!==undefined)await tx.execute(sql`UPDATE tasks SET page_facet_id=${facetId}::uuid WHERE id=${task.id}::uuid`)
 }
 const keys=initialKeys(outline.length)
 // List parentage is structure: without it here, a re-nest alone would be accepted and not written.
 const structureChanged=outline.length!==previousOutline.length || outline.some((item,index)=>{const prior=previousOutline[index];return prior?.id!==item.id||prior.kind!==item.kind||prior.sectionBlockId!==item.section_block_id||prior.listParentBlockId!==item.list_parent_block_id||prior.pagePosition===null})
 if(structureChanged)for(const [index,item] of outline.entries())await tx.execute(item.kind==='block'?sql`UPDATE page_blocks SET page_position=${keys[index]},position=${index},section_block_id=${item.section_block_id}::uuid,list_parent_block_id=${item.list_parent_block_id}::uuid WHERE id=${item.id}::uuid`:sql`UPDATE tasks SET page_position=${keys[index]},section_block_id=${item.section_block_id}::uuid WHERE id=${item.id}::uuid`)
 await syncMentions(tx,{pageFolderId:folderId,actorId:viewerId,blockIds:changed,refuse:m=>new DocumentRefusal('not_convertible',m,'rich_content')})
 const named=await rowsOf(tx,sql`SELECT name FROM folders WHERE id=${folderId}::uuid`)
 await recordEvent(tx,{actorId:viewerId,verb:'edited',subjectKind:'folder',subjectId:folderId,subjectName:String(named[0]?.name??''),folderId,detail:'edited the page'})
 const committed=await documentMetadata(tx,folderId,facetId)
 await tx.execute(sql`INSERT INTO page_document_receipts (actor_id,folder_id,mutation_id,payload_hash,committed_revision,created_task_ids,page_facet_id) VALUES (${viewerId}::uuid,${folderId}::uuid,${body.mutation_id}::uuid,${hash},${committed.revision},${JSON.stringify(created.map(t=>t.id))}::jsonb,${facetId??null}::uuid)`)
 return {mutation_id:body.mutation_id,committed_revision:committed.revision,replayed:false,created_task_ids:created.map(t=>t.id)}
}

/*
Rules for `page` blocks (sub-page homes) in a Folder's Main document, checked before any write.
A stored `page` block must remain unchanged unless `trash_page` trashes its page in the same transaction.
`create_page`'s block must be present at the end. A new `page` block for an existing sub-page with no home
re-homes it, restoring it from Trash if it went there alone (the editor's Undo). Anything else is refused.
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
