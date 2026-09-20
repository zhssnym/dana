import {randomUUID} from 'node:crypto'
import {afterAll,beforeAll,expect,test} from 'vitest'
import {startAuthTestApp} from '../support/auth-harness.js'
import type {AuthTestApp} from '../support/auth-harness.js'
import {Cast,createFolder,expectStatus} from '../support/folders-harness.js'
import type {Actor} from '../support/folders-harness.js'
import type {PageView,DocumentTransaction,DocumentOperation} from '../../src/shared/pages.js'
let app:AuthTestApp
const cast=new Cast(['owner','stranger'],'doc194')
beforeAll(async()=>{app=await startAuthTestApp()},60000)
afterAll(async()=>{if(app){await cast.cleanup(app.db);await app.close()}})
const block=(id:string,text:string,kind:'paragraph'|'section'='paragraph'):DocumentOperation=>({op:'put_block',id,block_kind:kind,text,rich_content:{version:1,runs:[{text,bold:true}]},file_id:null,ref_folder_id:null,width_pct:null,checked:null})
async function read(owner:Actor,id:string){const r=await owner.browser.json(`/folders/${id}/page`,'GET');expectStatus(r,200,'page');return r.json() as PageView}
test('Issue194 bounded rich hierarchy and real Task commit once, conflict atomically, preserve fields and refuse legacy loss',async()=>{
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




test('Issue194 duplicate, export and workflow import retain hierarchy and rich content with fresh identities',async()=>{
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
 expect(data.version).toBe(2);expect(data.folders.find(f=>f.id===folder)?.blocks.find(b=>b.id===p)?.section_block_id).toBe(h2)
 const current=await read(owner,folder)
 expectStatus(await owner.browser.json(`/folders/${folder}/page/actions`,'POST',{action:'document_transaction',mutation_id:randomUUID(),base_revision:current.revision,operations:[{op:'delete_block',id:h1},{op:'set_outline',items:[{kind:'block',id:h2,section_block_id:null,list_parent_block_id:null},{kind:'block',id:p,section_block_id:h2,list_parent_block_id:null}]}]}),200,'remove H1 promotes subgroup')
 expect((await read(owner,folder)).blocks.find(b=>b.id===h2)?.section_block_id).toBeNull()
})

/*
Issue218 extends the Section hierarchy from two heading levels to three. A
Section still carries no level of its own: its level is its depth in the
section_block_id relation, so these cases assert depth and parentage rather
than any stored heading number. The fourth level is refused before the first
write, which is why each rejection is followed by a read proving the page did
not move.
*/
test('Issue218 three Section levels round-trip, a fourth is refused before writes, and content follows its Section',async()=>{
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

test('Issue218 legacy two-level documents are unchanged by the third level',async()=>{
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
