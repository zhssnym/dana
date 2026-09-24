/*
`richContent`, Dana's one safe inline-formatting primitive.

**This module exists to break an import cycle, and it must keep importing
nothing but zod.** Anything added here that reaches another `shared/` module
re-closes the cycle described below, and the failure will not look like an
import problem: it looked like `TypeError: Cannot read properties of undefined
(reading 'optional')` pointing at a perfectly ordinary `.optional()` call in
`shared/folders.ts`, three modules away from anything to do with rich text.

## Why it moved here (issue #230)

It was declared at the top of `page-document.ts` and every consumer imported it
from there. That was fine while the only consumers were the page transaction
and the export, both of which already depended on that file for other reasons.
The Responsibility document is the third consumer and it made the dependency a
**cycle**: `responsibility.ts` needed `page-document.ts`, which needs
`tasks.ts` for `taskTitle`, which needs `folders.ts`, whose
`postFolderMembersBody` now carries a Responsibility document. Node resolved it
at import time as `Cannot read properties of undefined (reading 'optional')`,
which reads as a broken schema and is not one.

**The symptom is worth memorising because it names the wrong file.** Node
evaluates a cycle in whatever order the entry point reaches it, so the binding
is initialized for most importers and `undefined` for the one that enters the
cycle first — and the error is thrown wherever that `undefined` is finally
used, which is not where the cycle is. `document-hash.ts` in `server/domain/`
is the same move for the same reason on the same branch, with a symptom that
misdirects even harder.

So the primitive is in a leaf module, `page-document.ts` re-exports it for the
call sites that already name it, and nothing about its behaviour changed. **The
definition is byte-for-byte the one that was there**, dense style included, so
that `git log -S` still finds its history and so that this move cannot be
mistaken for a rule change.

## What it guarantees, since this is now the file to read

- runs of text with optional `bold`, `italic`, `href` and `mention` (a
  person, `{ user_id }`, never together with `href`);
- an `href` that is `https?://`, `mailto:` or an internal `/path` -- which is
  what a Dana Link is on the wire -- and never a `javascript:` or a control
  character;
- a paragraph of at most 4000 characters across all its runs, and at most
  64 KiB serialized;
- a **fixed key order** on every run, because the `.transform()` rebuilds the
  object. That last one is not cosmetic: `documentHash` is `sha256` over
  `JSON.stringify`, so the transform is what makes two clients that sent the
  same content compute the same revision token.
*/
import { z } from 'zod'

/* Wave 2 (W-D): `mention` names a person; the run's text is the name as the
   author saw it. Appended last so every run without one hashes as before, and
   never beside an `href`, because a run is one kind of inline thing. The
   server checks the id exists and tells only the page's members (domain/mentions.ts). */
const mention = z.object({user_id:z.uuid()}).catchall(z.never()).transform(({user_id})=>({user_id}))
const richRun = z.object({text:z.string().max(4000),bold:z.boolean().optional(),italic:z.boolean().optional(),href:z.string().max(2048).refine(value => /^(https?:\/\/|mailto:|\/[^/])/i.test(value) && !Array.from(value).some(char=>char.charCodeAt(0)<=32), 'Use a safe web, mail or internal link.').optional(),mention:mention.optional()}).catchall(z.never()).refine(run=>run.href===undefined||run.mention===undefined,'A mention is not also a link.').transform(({text,bold,italic,href,mention}) => ({text,...(bold===undefined?{}:{bold}),...(italic===undefined?{}:{italic}),...(href===undefined?{}:{href}),...(mention===undefined?{}:{mention})}))
export const richContent = z.object({version:z.literal(1),runs:z.array(richRun).max(4000)}).catchall(z.never()).superRefine((value,ctx)=>{
 if(value.runs.reduce((n,run)=>n+run.text.length,0)>4000 || new TextEncoder().encode(JSON.stringify(value)).length>65536) ctx.addIssue({code:'custom',message:'Rich content exceeds the paragraph limit.'})
}).transform(({version,runs})=>({version,runs}))
export type RichContent = z.infer<typeof richContent>
