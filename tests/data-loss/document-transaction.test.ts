import {randomUUID} from 'node:crypto'
import {afterAll,beforeAll,expect,test} from 'vitest'
import {startAuthTestApp} from '../support/auth-harness.js'
import type {AuthTestApp} from '../support/auth-harness.js'
import {sql} from 'drizzle-orm'
import {Cast,createFolder,expectStatus,seedTask} from '../support/folders-harness.js'
import type {Actor} from '../support/folders-harness.js'
import type {PageView,DocumentTransaction,DocumentOperation} from '../../src/shared/pages.js'
let app:AuthTestApp
const cast=new Cast(['owner','stranger'],'doc194')
beforeAll(async()=>{app=await startAuthTestApp()},60000)
afterAll(async()=>{if(app){await cast.cleanup(app.db);await app.close()}})
const block=(id:string,text:string,kind:'paragraph'|'section'='paragraph'):DocumentOperation=>({op:'put_block',id,block_kind:kind,text,rich_content:{version:1,runs:[{text,bold:true}]},file_id:null,ref_folder_id:null,width_pct:null,checked:null})
async function read(owner:Actor,id:string){const r=await owner.browser.json(`/folders/${id}/page`,'GET');expectStatus(r,200,'page');return r.json() as PageView}
test('bounded rich hierarchy and real Task commit once, conflict atomically, preserve fields and refuse legacy loss',async()=>{
 const [owner,stranger]=await cast.of(app) as [Actor,Actor]
 const folder=await createFolder(owner,'document contract');const initial=await read(owner,folder)
 const h1=randomUUID(),h2=randomUUID(),p=randomUUID(),t=randomUUID()
 const body:DocumentTransaction={action:'document_transaction',mutation_id:randomUUID(),base_revision:initial.revision!,operations:[block(h1,'','section'),block(h2,'Sub','section'),block(p,'Rich'),{op:'create_task',id:t,title:'Real task'},{op:'set_outline',items:[{kind:'block',id:h1,section_block_id:null,list_parent_block_id:null},{kind:'block',id:h2,section_block_id:h1,list_parent_block_id:null},{kind:'block',id:p,section_block_id:h2,list_parent_block_id:null},{kind:'task',id:t,section_block_id:h2,list_parent_block_id:null}]}]}
 const url=`/folders/${folder}/page/actions`
 expectStatus(await stranger.browser.json(url,'POST',body),404,'stranger cannot write')
 const written=await owner.browser.json(url,'POST',body);expectStatus(written,200,'atomic document')
 const page=written.json() as PageView
 expect(page.blocks.find(b=>b.id===p)?.rich_content).toEqual({version:1,runs:[{text:'Rich',bold:true}]})
 expect(page.task_placements).toEqual([{id:t,section_block_id:h2}])
 const retry=await owner.browser.json(url,'POST',body);expectStatus(retry,200,'ambiguous retry');expect((retry.json() as PageView).mutation?.replayed).toBe(true)
 expectStatus(await owner.browser.json(url,'POST',{...body,operations:[block(p,'changed'),body.operations.at(-1)]}),409,'changed retry conflicts')
 const fresh=await read(owner,folder);expect(fresh.items).toEqual(page.items)
 const invalid={...body,mutation_id:randomUUID(),base_revision:fresh.revision,operations:[block(p,'must rollback'),{op:'set_outline',items:[{kind:'block',id:h1,section_block_id:null,list_parent_block_id:null},{kind:'block',id:h2,section_block_id:h1,list_parent_block_id:null},{kind:'block',id:p,section_block_id:h2,list_parent_block_id:null}]}]}
 expectStatus(await owner.browser.json(url,'POST',invalid),422,'implicit Task detach refused')
 expect((await read(owner,folder)).blocks.find(b=>b.id===p)?.text).toBe('Rich')
 expectStatus(await owner.browser.json(`/folders/${folder}/page`,'PUT',{blocks:fresh.blocks.map(b=>({...b,text:b.text||'Legacy heading',position:b.position}))}),409,'legacy rich loss refused')
 const paragraph=fresh.blocks.find(b=>b.id===p)!
 expectStatus(await owner.browser.json(url,'POST',{action:'update_block',block_id:p,updated_at:paragraph.updated_at,text:'plain overwrite'}),409,'old edit cannot erase rich content')
 expectStatus(await owner.browser.json(url,'POST',{...body,mutation_id:randomUUID()}),409,'stale revision refused')
})




test('duplicate, export and workflow import retain hierarchy and rich content with fresh identities',async()=>{
 const [owner]=await cast.of(app) as [Actor,Actor]
 const folder=await createFolder(owner,'document transfer');const initial=await read(owner,folder)
 const h1=randomUUID(),h2=randomUUID(),p=randomUUID()
 const outline=[{kind:'block' as const,id:h1,section_block_id:null,list_parent_block_id:null},{kind:'block' as const,id:h2,section_block_id:h1,list_parent_block_id:null},{kind:'block' as const,id:p,section_block_id:h2,list_parent_block_id:null}]
 const blocks=[block(h1,'Top','section'),block(h2,'Sub','section'),block(p,'Formatted')]
 const body:DocumentTransaction={action:'document_transaction',mutation_id:randomUUID(),base_revision:initial.revision!,operations:[...blocks,{op:'set_outline',items:outline}]}
 expectStatus(await owner.browser.json(`/folders/${folder}/page/actions`,'POST',body),200,'source document')
 const duplicate=await owner.browser.json(`/folders/${folder}/duplicate`,'POST',{})
 expectStatus(duplicate,201,'duplicate')
 const copy=await read(owner,(duplicate.json() as {id:string}).id)
 const top=copy.blocks.find(b=>b.text==='Top')!,sub=copy.blocks.find(b=>b.text==='Sub')!,paragraph=copy.blocks.find(b=>b.text==='Formatted')!
 expect(top.id).not.toBe(h1);expect(sub.section_block_id).toBe(top.id);expect(paragraph.section_block_id).toBe(sub.id);expect(paragraph.rich_content?.runs[0]?.bold).toBe(true)
 const imported=await owner.browser.json('/workflows/import','POST',{dana:'workflow',version:2,folders:[{name:'Imported rich',tasks:[],document:{blocks,outline,task_ids:[]}}]})
 expectStatus(imported,201,'version2 workflow')
 const importedPage=await read(owner,(imported.json() as {folders:{id:string}[]}).folders[0]!.id)
 expect(importedPage.blocks.map(b=>b.text)).toEqual(['Top','Sub','Formatted'])
 expect(importedPage.blocks[1]?.section_block_id).toBe(importedPage.blocks[0]?.id)
 expect(importedPage.blocks[2]?.rich_content?.runs[0]?.bold).toBe(true)
 const exported=await owner.browser.json('/me/export','GET');expectStatus(exported,200,'account export')
 const data=exported.json() as {version:number;folders:{id:string;blocks:{id:string;rich_content:unknown;section_block_id:string|null}[]}[]}
 /* 2 to 3 at issue #226: the export's `exportFolder.my_label` became
    `my_shelf`, the Shelf half of removing the collision with #208's Label
    model, and EXPORT_VERSION is the mechanism by which a reader that knows
    the old shape refuses rather than guesses. The decision this line pins is
    "which version the document declares", and it moved in the same change as
    the key it is about. That note is #226's and is kept; the one below is
    #230's, and this is the resolution #230 asked for -- both notes and the
    higher number.

    **3 to 4 at issue #227**, on exactly the same rule and in the same shape:
    the document gained the viewer's Personal Label catalog, each owned
    folder's Folder Label vocabulary, and the id arrays that connect them to
    the Work. A version-3 reader's schema declares none of those keys and
    would strip them, so the bump is again what tells it to refuse rather
    than hand back a document quietly missing a person's classification.
    AC-550 asserts the number against `EXPORT_VERSION` and the shape beside
    it; this line stays because it is the one that notices a *shape* change
    that forgot its bump, which is the direction a green suite cannot see.

    **4 to 5 at issue #230**, which adds a `responsibilities` collection.
    Branches that change the export shape in parallel must each take their own
    number: two branches bumping to one number merge cleanly and leave one
    version covering two different documents, which is worse than either
    change alone.
    **5 to 6 at issue #210**, which adds a `facets` collection: a private facet
    is content only its owner can reach, so an export without it hands
    somebody a copy of their own data with their own writing missing.

    `shared/export.ts` carries the chain. This assertion is incidental to what
    the case is about -- hierarchy and rich content surviving a duplicate, an
    import and an export -- and it moves with the document's shape rather than
    with anything this case asserts.

    **7 to 8 in wave 2 (pages in pages)**: every folder gains
    `parent_folder_id`.
    **8 to 9 at issue #353**: settings gains the durable `focus_appearance`
    map, so an older reader cannot silently discard the viewer's Focus identity. */
 expect(data.version).toBe(11);expect(data.folders.find(f=>f.id===folder)?.blocks.find(b=>b.id===p)?.section_block_id).toBe(h2)
 const current=await read(owner,folder)
 expectStatus(await owner.browser.json(`/folders/${folder}/page/actions`,'POST',{action:'document_transaction',mutation_id:randomUUID(),base_revision:current.revision,operations:[{op:'delete_block',id:h1},{op:'set_outline',items:[{kind:'block',id:h2,section_block_id:null,list_parent_block_id:null},{kind:'block',id:p,section_block_id:h2,list_parent_block_id:null}]}]}),200,'remove H1 promotes subgroup')
 expect((await read(owner,folder)).blocks.find(b=>b.id===h2)?.section_block_id).toBeNull()
})

/*
The Section hierarchy has three heading levels. A Section carries no level of
its own: its level is its depth in the section_block_id relation, so these
cases assert depth and parentage rather than any stored heading number. The
fourth level is refused before the first write, which is why each rejection
is followed by a read proving the page did not move.
*/
test('three Section levels round-trip, a fourth is refused before writes, and content follows its Section',async()=>{
 const [owner]=await cast.of(app) as [Actor,Actor]
 const folder=await createFolder(owner,'three levels');const url=`/folders/${folder}/page/actions`
 const h1=randomUUID(),h2a=randomUUID(),h2b=randomUUID(),h3=randomUUID(),h4=randomUUID(),p=randomUUID(),t=randomUUID()
 const initial=await read(owner,folder)
 const created=await owner.browser.json(url,'POST',{action:'document_transaction',mutation_id:randomUUID(),base_revision:initial.revision!,operations:[block(h1,'Top','section'),block(h2a,'Sub','section'),block(h3,'Detail','section'),block(p,'Under the detail'),{op:'create_task',id:t,title:'Detail task'},{op:'set_outline',items:[{kind:'block',id:h1,section_block_id:null,list_parent_block_id:null},{kind:'block',id:h2a,section_block_id:h1,list_parent_block_id:null},{kind:'block',id:h3,section_block_id:h2a,list_parent_block_id:null},{kind:'block',id:p,section_block_id:h3,list_parent_block_id:null},{kind:'task',id:t,section_block_id:h3,list_parent_block_id:null}]}]})
 expectStatus(created,200,'H1 to H3 accepted')
 const three=created.json() as PageView
 expect(three.blocks.find(b=>b.id===h3)?.section_block_id).toBe(h2a)
 expect(three.blocks.find(b=>b.id===p)?.section_block_id).toBe(h3)
 expect(three.task_placements).toEqual([{id:t,section_block_id:h3}])
 const reloaded=await read(owner,folder)
 expect(reloaded.items.map(i=>i.id)).toEqual([h1,h2a,h3,p,t])
 expect(reloaded.blocks.find(b=>b.id===h3)?.section_block_id).toBe(h2a)

 const fourth:DocumentTransaction={action:'document_transaction',mutation_id:randomUUID(),base_revision:reloaded.revision!,operations:[block(h4,'Too deep','section'),{op:'set_outline',items:[{kind:'block',id:h1,section_block_id:null,list_parent_block_id:null},{kind:'block',id:h2a,section_block_id:h1,list_parent_block_id:null},{kind:'block',id:h3,section_block_id:h2a,list_parent_block_id:null},{kind:'block',id:h4,section_block_id:h3,list_parent_block_id:null},{kind:'block',id:p,section_block_id:h4,list_parent_block_id:null},{kind:'task',id:t,section_block_id:h3,list_parent_block_id:null}]}]}
 expectStatus(await owner.browser.json(url,'POST',fourth),422,'a fourth Section level is refused')
 const unmoved=await read(owner,folder)
 expect(unmoved.revision).toBe(reloaded.revision)
 expect(unmoved.blocks.some(b=>b.id===h4)).toBe(false)

 const moved=await owner.browser.json(url,'POST',{action:'document_transaction',mutation_id:randomUUID(),base_revision:unmoved.revision!,operations:[block(h2b,'Other sub','section'),{op:'set_outline',items:[{kind:'block',id:h1,section_block_id:null,list_parent_block_id:null},{kind:'block',id:h2a,section_block_id:h1,list_parent_block_id:null},{kind:'block',id:h2b,section_block_id:h1,list_parent_block_id:null},{kind:'block',id:h3,section_block_id:h2b,list_parent_block_id:null},{kind:'block',id:p,section_block_id:h3,list_parent_block_id:null},{kind:'task',id:t,section_block_id:h3,list_parent_block_id:null}]}]})
 expectStatus(moved,200,'H3 moves between H2 groups')
 const regrouped=await read(owner,folder)
 expect(regrouped.blocks.find(b=>b.id===h3)?.section_block_id).toBe(h2b)
 expect(regrouped.blocks.find(b=>b.id===p)?.section_block_id).toBe(h3)
 expect(regrouped.task_placements).toEqual([{id:t,section_block_id:h3}])

 const promotion:DocumentTransaction={action:'document_transaction',mutation_id:randomUUID(),base_revision:regrouped.revision!,operations:[{op:'set_outline',items:[{kind:'block',id:h1,section_block_id:null,list_parent_block_id:null},{kind:'block',id:h2a,section_block_id:h1,list_parent_block_id:null},{kind:'block',id:h2b,section_block_id:h1,list_parent_block_id:null},{kind:'block',id:h3,section_block_id:null,list_parent_block_id:null},{kind:'block',id:p,section_block_id:h3,list_parent_block_id:null},{kind:'task',id:t,section_block_id:h3,list_parent_block_id:null}]}]}
 expectStatus(await owner.browser.json(url,'POST',promotion),200,'H3 promotes to the page root')
 const promoted=await read(owner,folder)
 expect(promoted.blocks.find(b=>b.id===h3)?.section_block_id).toBeNull()
 expect(promoted.blocks.find(b=>b.id===p)?.section_block_id).toBe(h3)
 expect(promoted.task_placements).toEqual([{id:t,section_block_id:h3}])
 const replay=await owner.browser.json(url,'POST',promotion)
 expectStatus(replay,200,'a three-level retry still replays')
 expect((replay.json() as PageView).mutation?.replayed).toBe(true)
})

test('legacy two-level documents are unchanged by the third level',async()=>{
 const [owner]=await cast.of(app) as [Actor,Actor]
 const folder=await createFolder(owner,'legacy two levels');const url=`/folders/${folder}/page/actions`
 const h1=randomUUID(),h2=randomUUID(),p=randomUUID(),root=randomUUID()
 const initial=await read(owner,folder)
 const outline=[{kind:'block' as const,id:h1,section_block_id:null,list_parent_block_id:null},{kind:'block' as const,id:h2,section_block_id:h1,list_parent_block_id:null},{kind:'block' as const,id:p,section_block_id:h2,list_parent_block_id:null},{kind:'block' as const,id:root,section_block_id:null,list_parent_block_id:null}]
 expectStatus(await owner.browser.json(url,'POST',{action:'document_transaction',mutation_id:randomUUID(),base_revision:initial.revision!,operations:[block(h1,'Top','section'),block(h2,'Sub','section'),block(p,'Owned prose'),block(root,'Root prose'),{op:'set_outline',items:outline}]}),200,'legacy shape accepted')
 const legacy=await read(owner,folder)
 expect(legacy.items.map(i=>i.id)).toEqual([h1,h2,p,root])
 expect(legacy.blocks.find(b=>b.id===h2)?.section_block_id).toBe(h1)
 expect(legacy.blocks.find(b=>b.id===p)?.section_block_id).toBe(h2)
 expect(legacy.blocks.find(b=>b.id===root)?.section_block_id).toBeNull()
 expectStatus(await owner.browser.json(url,'POST',{action:'document_transaction',mutation_id:randomUUID(),base_revision:legacy.revision!,operations:[block(p,'Owned prose, edited'),{op:'set_outline',items:outline}]}),200,'an unchanged two-level outline still saves')
 const again=await read(owner,folder)
 expect(again.items.map(i=>i.id)).toEqual([h1,h2,p,root])
 expect(again.blocks.find(b=>b.id===h2)?.section_block_id).toBe(h1)
 expect(again.blocks.find(b=>b.id===root)?.section_block_id).toBeNull()
})

/*
Any block nests (migration 0038): `list_parent_block_id` is the general block
parent on every home, judged by one validator (`domain/document-outline.ts`)
ahead of the first write. Each refusal below is followed by a read proving the
page did not move. The kind-change case is the silent one: the upsert keeps a
block's parent only for the kinds its CASE lists, so a list narrower than
`mayNest` would clear the parent while the outline still claims it.
*/
type PutKind=Extract<DocumentOperation,{op:'put_block'}>['block_kind']
const put=(id:string,kind:PutKind,text:string|null,extra:Record<string,unknown>={}):DocumentOperation=>({op:'put_block',id,block_kind:kind,text,rich_content:null,file_id:null,ref_folder_id:null,width_pct:null,checked:kind==='checklist'?false:null,...extra} as DocumentOperation)
const at=(id:string,parent:string|null=null,section:string|null=null)=>({kind:'block' as const,id,section_block_id:section,list_parent_block_id:parent})
async function transact(actor:Actor,url:string,base:string,operations:DocumentOperation[],method:'POST'|'PUT'='POST'){return actor.browser.json(url,method,{action:'document_transaction',mutation_id:randomUUID(),base_revision:base,operations})}

test('a Person block names only a current Team member',async()=>{
 const [owner,stranger]=await cast.of(app) as [Actor,Actor]
 const folder=await createFolder(owner,'Person reference');const url=`/folders/${folder}/page/actions`
 const id=randomUUID();const outline=[at(id)]
 const before=await read(owner,folder)
 expectStatus(await transact(owner,url,before.revision!,[put(id,'person',stranger.id),{op:'set_outline',items:outline}]),404,'another user is not on the Team')
 expect((await read(owner,folder)).revision).toBe(before.revision)
 expectStatus(await transact(owner,url,before.revision!,[put(id,'person',owner.id),{op:'set_outline',items:outline}]),200,'member reference saves')
 const saved=await read(owner,folder)
 expect(saved.blocks.find((item)=>item.id===id)?.text).toBe(owner.id)
 expectStatus(await stranger.browser.json(`/folders/${folder}/page`,'GET'),404,'nonmember cannot read the reference')
})

test('a folder page nests any block under writing, keeps it through a kind change, and refuses bad nesting before writes',async()=>{
 const [owner]=await cast.of(app) as [Actor,Actor]
 const folder=await createFolder(owner,'nesting');const url=`/folders/${folder}/page/actions`
 const s=randomUUID(),p=randomUUID(),q=randomUUID(),todo=randomUUID(),img=randomUUID(),code=randomUUID(),t=randomUUID()
 const task={kind:'task' as const,id:t,section_block_id:null,list_parent_block_id:null}
 const outline=[at(s),at(p,null,s),at(q,p,s),at(todo,q,s),at(img,todo,s),at(code,p,s),task]
 const written=await transact(owner,url,(await read(owner,folder)).revision!,[put(s,'section','Work'),put(p,'paragraph','Parent'),put(q,'quote','Quoted'),put(todo,'checklist','Do it'),put(img,'image',''),put(code,'code','x = 1'),{op:'create_task',id:t,title:'Root task'},{op:'set_outline',items:outline}])
 expectStatus(written,200,'paragraph > quote > to-do > image, and code under the paragraph')
 const page=await read(owner,folder)
 const parent=(id:string)=>page.blocks.find(b=>b.id===id)?.list_parent_block_id
 expect([parent(p),parent(q),parent(todo),parent(img),parent(code)]).toEqual([null,p,q,todo,p])
 expect(page.blocks.find(b=>b.id===q)?.section_block_id).toBe(s)

 // A kind change with the outline unchanged keeps the parent (the upsert's CASE).
 expectStatus(await transact(owner,url,page.revision!,[put(q,'callout','Now a callout'),put(code,'divider',null),{op:'set_outline',items:outline}]),200,'kind change')
 const changed=await read(owner,folder)
 expect(changed.blocks.find(b=>b.id===q)?.kind).toBe('callout')
 expect(changed.blocks.find(b=>b.id===q)?.list_parent_block_id).toBe(p)
 expect(changed.blocks.find(b=>b.id===code)?.list_parent_block_id).toBe(p)

 const refused=async(operations:DocumentOperation[],why:string)=>{
  const before=await read(owner,folder)
  const r=await transact(owner,url,before.revision!,operations)
  expect(r.status,why).toBe(422)
  expect((await read(owner,folder)).revision,why).toBe(before.revision)
 }
 const rest=[at(q,p,s),at(todo,q,s),at(img,todo,s),at(code,p,s)]
 const x=randomUUID(),s2=randomUUID()
 await refused([put(x,'paragraph','under a picture'),{op:'set_outline',items:[at(s),at(p,null,s),...rest,at(x,img,s),task]}],'nothing nests under an image')
 await refused([put(x,'paragraph','under a divider'),{op:'set_outline',items:[at(s),at(p,null,s),...rest,at(x,code,s),task]}],'nothing nests under a divider')
 await refused([put(s2,'section','Nested section'),{op:'set_outline',items:[at(s),at(p,null,s),...rest,at(s2,p),task]}],'a Section never nests')
 await refused([{op:'set_outline',items:[at(s),at(q,p,s),at(p,null,s),at(todo,q,s),at(img,todo,s),at(code,p,s),task]}],'a parent precedes its child')
 await refused([put(s2,'section','Other'),put(x,'paragraph','astray'),{op:'set_outline',items:[at(s),at(p,null,s),...rest,task,at(s2),at(x,p,s2)]}],'a nested block shares its parent Section')
 await refused([{op:'set_outline',items:[at(s),at(p,null,s),...rest,{kind:'task',id:t,section_block_id:s,list_parent_block_id:p}]}],'a Task never nests')
 const chain=Array.from({length:14},()=>randomUUID())
 const deep=(n:number)=>[...chain.slice(0,n).map(id=>put(id,'paragraph','deep')),{op:'set_outline' as const,items:[at(s),at(p,null,s),...rest,task,at(chain[0]!),...chain.slice(1,n).map((id,i)=>at(id,chain[i]!))]}]
 await refused(deep(14),'thirteen levels under a root block is one too deep')
 expectStatus(await transact(owner,url,(await read(owner,folder)).revision!,deep(13)),200,'twelve levels under a root block save')
})

test('a Task document and a Purpose document nest blocks and store a toggle heading',async()=>{
 const [owner]=await cast.of(app) as [Actor,Actor]
 const folder=await createFolder(owner,'task nesting')
 const taskId=await seedTask(app.db,{folderId:folder,createdBy:owner.id})
 const docUrl=`/tasks/${taskId}/document`
 const doc=async()=>{const r=await owner.browser.api(docUrl);expectStatus(r,200,'task document');return r.json() as PageView}
 const h=randomUUID(),p=randomUUID(),b=randomUUID(),d=randomUUID()
 const wrote=await transact(owner,docUrl,(await doc()).revision!,[put(h,'heading2','Folds',{toggleable:true}),put(p,'paragraph','inside'),put(b,'bullet','deeper'),put(d,'divider',null),{op:'set_outline',items:[at(h),at(p,h),at(b,p),at(d,h)]}],'PUT')
 expectStatus(wrote,200,'a Task document nests under a toggle heading')
 const view=await doc()
 const by=new Map(view.blocks.map(x=>[x.id,x]))
 expect([by.get(p)?.list_parent_block_id,by.get(b)?.list_parent_block_id,by.get(d)?.list_parent_block_id]).toEqual([h,p,h])
 expect(by.get(h)?.toggleable).toBe(true)
 expect(by.get(p)?.toggleable??null).toBeNull()
 // The stored row, not only the read: the value arrived in the column.
 const stored=(await app.db.execute(sql`SELECT id, toggleable FROM page_blocks WHERE task_id = ${taskId}::uuid ORDER BY page_position`)) as unknown as {rows:{id:string;toggleable:boolean|null}[]}
 expect(stored.rows.map(r=>[r.id,r.toggleable])).toEqual([[h,true],[p,null],[b,null],[d,null]])

 // Refusals leave the Task document as it was.
 const before=await doc()
 const bad=async(operations:DocumentOperation[],why:string)=>{const r=await transact(owner,docUrl,before.revision!,operations,'PUT');expect(r.status,why).toBe(422);expect((await doc()).revision,why).toBe(before.revision)}
 const x=randomUUID()
 await bad([put(x,'paragraph','under a rule'),{op:'set_outline',items:[at(h),at(p,h),at(b,p),at(d,h),at(x,d)]}],'nothing nests under a divider')
 await bad([put(p,'paragraph','folds?',{toggleable:true}),{op:'set_outline',items:[at(h),at(p,h),at(b,p),at(d,h)]}],'only a heading folds')

 // Un-nesting (Shift-Tab) is an outline change the Task document writes.
 expectStatus(await transact(owner,docUrl,before.revision!,[{op:'set_outline',items:[at(h),at(p),at(b,p),at(d)]}],'PUT'),200,'un-nest')
 const flat=await doc()
 expect(flat.blocks.find(x=>x.id===p)?.list_parent_block_id).toBeNull()
 expect(flat.blocks.find(x=>x.id===b)?.list_parent_block_id).toBe(p)

 // A Doc tab (Purpose since step 7): the same rule and the same column.
 const tabs=await owner.browser.json(`/folders/${folder}/tabs`,'POST',{kind:'doc'})
 expectStatus(tabs,201,'a Doc tab')
 const purpose=(tabs.json() as {id:string;kind:string}[]).find(f=>f.kind==='doc')!
 const page=`/folders/${purpose.id}/page`
 const fbase=(await owner.browser.json(page,'GET')).json() as PageView
 const fh=randomUUID(),fq=randomUUID()
 expectStatus(await transact(owner,`${page}/actions`,fbase.revision!,[put(fh,'heading1','Why',{toggleable:true}),put(fq,'quote','Because'),{op:'set_outline',items:[at(fh),at(fq,fh)]}]),200,'a quote under a toggle heading on Purpose')
 const fread=(await owner.browser.json(page,'GET')).json() as PageView
 expect(fread.blocks.find(x=>x.id===fq)?.list_parent_block_id).toBe(fh)
 expect(fread.blocks.find(x=>x.id===fh)?.toggleable).toBe(true)
})

/*
Wave 2 (pages in pages): a `page` block is a sub-page's home in its parent's
Main document, retained like a Task. Deleting one without `trash_page`, or
retyping it, is refused before the first write -- the revision, the block row
and the sub-page are all as they were. Every other document home (a Task
document, a Shelf, and since step 7 a Discussion tab) refuses the two tree ops
and the kind.
*/
test('a page block leaves only with trash_page, keeps its kind, and lives only on a folder page',async()=>{
 const [owner]=await cast.of(app) as [Actor,Actor]
 const folder=await createFolder(owner,'page retention');const url=`/folders/${folder}/page/actions`
 const child=randomUUID(),home=randomUUID(),p=randomUUID()
 expectStatus(await transact(owner,url,(await read(owner,folder)).revision!,[put(p,'paragraph','Intro'),{op:'create_page',id:child,block_id:home,title:'Kept child'},{op:'set_outline',items:[at(p),at(home)]}]),200,'create_page')
 // The Task whose document is tried below, seeded before the baseline.
 const taskId=await seedTask(app.db,{folderId:folder,createdBy:owner.id})
 const taskUrl=`/tasks/${taskId}/document`
 const before=await read(owner,folder)
 const unchanged=async(why:string)=>{
  expect((await read(owner,folder)).revision,why).toBe(before.revision)
  const row=(await app.db.execute(sql`SELECT b.kind, b.ref_folder_id, f.deleted_at FROM page_blocks b JOIN folders f ON f.id = b.ref_folder_id WHERE b.id = ${home}::uuid`)) as unknown as {rows:{kind:string;ref_folder_id:string;deleted_at:unknown}[]}
  expect(row.rows.map(r=>[r.kind,r.ref_folder_id,r.deleted_at]),why).toEqual([['page',child,null]])
 }
 const refused=async(operations:DocumentOperation[],why:string)=>{const r=await transact(owner,url,before.revision!,operations);expect(r.status,why).toBe(422);await unchanged(why)}
 await refused([{op:'delete_block',id:home},{op:'set_outline',items:[at(p)]}],'deleting a page block without trash_page')
 await refused([put(home,'paragraph','no longer a page'),{op:'set_outline',items:[at(p),at(home)]}],'turning a page block into a paragraph')
 const other=await createFolder(owner,'page retention elsewhere')
 await refused([put(home,'page',null,{ref_folder_id:other}),{op:'set_outline',items:[at(p),at(home)]}],'pointing a page block at another page')
 await refused([put(p,'page',null,{ref_folder_id:child}),{op:'set_outline',items:[at(p),at(home)]}],'turning a paragraph into a page block')
 const sneak=randomUUID()
 await refused([put(sneak,'page',null,{ref_folder_id:other}),{op:'set_outline',items:[at(p),at(home),at(sneak)]}],'homing a page that is not a sub-page of this one')

 // Every other document home refuses the tree ops and the kind.
 const page=randomUUID(),pb=randomUUID()
 const treeOps:DocumentOperation[][]=[
  [{op:'create_page',id:page,block_id:pb,title:'Nope'},{op:'set_outline',items:[at(pb)]}],
  [{op:'trash_page',folder_id:child},{op:'set_outline',items:[]}],
  [put(pb,'page',null,{ref_folder_id:child}),{op:'set_outline',items:[at(pb)]}],
 ]
 const taskBase=((await owner.browser.api(taskUrl)).json() as PageView).revision!
 for(const ops of treeOps){const r=await transact(owner,taskUrl,taskBase,ops,'PUT');expect(r.status,`task document: ${ops[0]!.op}`).toBe(422)}
 expect(((await owner.browser.api(taskUrl)).json() as PageView).revision).toBe(taskBase)
 // Step 7: a Discussion tab holds threads, not writing, and refuses them all.
 const talk=await owner.browser.json(`/folders/${folder}/tabs`,'POST',{kind:'discussion'})
 expectStatus(talk,201,'a Discussion tab')
 const discussion=`/folders/${(talk.json() as {id:string;kind:string}[]).find(f=>f.kind==='discussion')!.id}/page`
 const talkBase=((await owner.browser.json(discussion,'GET')).json() as PageView).revision!
 for(const ops of treeOps){const r=await transact(owner,`${discussion}/actions`,talkBase,ops);expect(r.status,`discussion page: ${ops[0]!.op}`).toBe(422)}
 expect(((await owner.browser.json(discussion,'GET')).json() as PageView).revision).toBe(talkBase)
 const shelf=await owner.browser.json('/shelves','POST',{name:'page retention shelf'});expectStatus(shelf,201,'shelf')
 const shelfPage=`/shelves/${String((shelf.json() as {id:unknown}).id)}/page`
 const shelfBase=((await owner.browser.json(shelfPage,'GET')).json() as PageView).revision!
 for(const ops of treeOps){const r=await transact(owner,`${shelfPage}/actions`,shelfBase,ops);expect(r.status,`shelf document: ${ops[0]!.op}`).toBe(422)}
 expect(((await owner.browser.json(shelfPage,'GET')).json() as PageView).revision).toBe(shelfBase)
 const made=(await app.db.execute(sql`SELECT id FROM folders WHERE id = ${page}::uuid`)) as unknown as {rows:unknown[]}
 expect(made.rows).toEqual([])
 await unchanged('after the other homes refused')
})

test('a folder page stores presentation headings beside its Sections: flat, toggleable, and never a Section parent',async()=>{
 const [owner]=await cast.of(app) as [Actor,Actor]
 const folder=await createFolder(owner,'work headings');const url=`/folders/${folder}/page/actions`
 const s=randomUUID(),h3=randomUUID(),th=randomUUID(),p=randomUUID(),root=randomUUID()
 const outline=[at(s),at(h3,null,s),at(th,null,s),at(p,th,s),at(root)]
 const wrote=await transact(owner,url,(await read(owner,folder)).revision!,[put(s,'section','Launch'),put(h3,'heading3','Notes'),put(th,'heading1','Details',{toggleable:true}),put(p,'paragraph','folded'),put(root,'heading2','Root heading'),{op:'set_outline',items:outline}])
 expectStatus(wrote,200,'Heading 3 and a toggle heading inside a Section, a heading at the root')
 const page=await read(owner,folder)
 const by=new Map(page.blocks.map(b=>[b.id,b]))
 expect([by.get(h3)?.kind,by.get(th)?.kind,by.get(root)?.kind]).toEqual(['heading3','heading1','heading2'])
 expect([by.get(h3)?.section_block_id,by.get(th)?.section_block_id,by.get(root)?.section_block_id]).toEqual([s,s,null])
 expect(by.get(th)?.toggleable).toBe(true)
 expect(by.get(h3)?.toggleable??null).toBeNull()
 expect(by.get(p)?.list_parent_block_id).toBe(th)
 // A presentation heading groups nothing: content naming it as its Section is refused before writes.
 const before=page.revision
 const x=randomUUID()
 const r=await transact(owner,url,before!,[put(x,'paragraph','astray'),{op:'set_outline',items:[...outline,at(x,null,h3)]}])
 expect(r.status).toBe(422)
 expect((await read(owner,folder)).revision).toBe(before)
 // Only a heading folds, on Main as anywhere.
 const bad=await transact(owner,url,before!,[put(p,'paragraph','folds?',{toggleable:true}),{op:'set_outline',items:outline}])
 expect(bad.status).toBe(422)
})

test('a table keeps formatted cells through folder and Task saves, copy and export',async()=>{
 const [owner]=await cast.of(app) as [Actor,Actor]
 const folder=await createFolder(owner,'table writing')
 const id=randomUUID()
 const props={backgroundColor:'default',textColor:'default',textAlignment:'left'}
 const rich={version:1,runs:[],table:{columnWidths:[160,null],headerRows:1,rows:[
  {cells:[{props,runs:[{text:'Name',bold:true}]},{props,runs:[{text:'Page'}]}]},
  {cells:[{props,runs:[{text:'Dana'}]},{props,runs:[{text:'Open',href:`/app/folders/${folder}`}]}]},
 ]}}
 const text='Name\tPage\nDana\tOpen'
 const url=`/folders/${folder}/page/actions`
 const initial=await read(owner,folder)
 expectStatus(await transact(owner,url,initial.revision!,[put(id,'table',text,{rich_content:rich}),{op:'set_outline',items:[at(id)]}]),200,'save table')
 const written=await read(owner,folder)
 expect(written.blocks.find(block=>block.id===id)?.rich_content).toEqual(rich)
 const invalid=await transact(owner,url,written.revision!,[put(id,'table','wrong',{rich_content:rich}),{op:'set_outline',items:[at(id)]}])
 expectStatus(invalid,422,'refuse a mismatched table projection')
 expect((await read(owner,folder)).revision).toBe(written.revision)
 const copied=await owner.browser.json(`/folders/${folder}/duplicate`,'POST',{})
 expectStatus(copied,201,'copy table page')
 const copy=await read(owner,(copied.json() as {id:string}).id)
 expect(copy.blocks.find(block=>block.kind==='table')?.rich_content).toEqual(rich)
 const exported=await owner.browser.json('/me/export','GET')
 expectStatus(exported,200,'export table')
 const data=exported.json() as {folders:{id:string;blocks:{kind:string;rich_content:unknown}[]}[]}
 expect(data.folders.find(entry=>entry.id===folder)?.blocks.find(block=>block.kind==='table')?.rich_content).toEqual(rich)

 const taskId=await seedTask(app.db,{folderId:folder,createdBy:owner.id})
 const taskUrl=`/tasks/${taskId}/document`
 const before=(await owner.browser.api(taskUrl)).json() as PageView
 const taskTable=randomUUID()
 expectStatus(await transact(owner,taskUrl,before.revision!,[put(taskTable,'table',text,{rich_content:rich}),{op:'set_outline',items:[at(taskTable)]}],'PUT'),200,'save Task table')
 const task=(await owner.browser.api(taskUrl)).json() as PageView
 expect(task.blocks.find(block=>block.id===taskTable)?.rich_content).toEqual(rich)
})
