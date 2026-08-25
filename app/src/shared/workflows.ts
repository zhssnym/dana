/*
The 7.16 workflow-file contract (RFC 0005, DES-206): structure and titles
only, never ids, people, dates or states. The refusal is the schema's shape,
not a scrubbing pass: zod strips every key these objects do not name, so a
hostile file's members, statuses and ids are not rejected so much as never
read, and what remains is exactly what an empty folder plus typed titles
would have been.

10.3's caps: up to 50 folders, 500 blocks and 1000 tasks per file; the
folder cap is the array's, the block and task caps the whole file's,
checked across folders. The task cap was added by RFC 0005 change control
item 18: until then the array's only bound was the body parser's default,
an accident a parser configuration change would have widened silently.
*/
import { z } from 'zod'

const importTask = z.object({
  title: z.string().min(1).max(300),
})

const importBlock = z.object({
  kind: z.enum(['section', 'paragraph']),
  text: z.string().min(1).max(4000),
})

const importFolder = z.object({
  name: z.string().min(1).max(100),
  tasks: z.array(importTask).optional(),
  blocks: z.array(importBlock).optional(),
})

export const importWorkflowBody = z
  .object({
    dana: z.literal('workflow'),
    version: z.literal(1),
    name: z.string().max(100).optional(),
    folders: z
      .array(importFolder)
      .min(1, 'folders: a workflow file carries at least one')
      .max(50, 'folders: a workflow file carries at most 50'),
  })
  .superRefine((file, ctx) => {
    const blocks = file.folders.reduce(
      (sum, folder) => sum + (folder.blocks?.length ?? 0),
      0,
    )
    if (blocks > 500) {
      ctx.addIssue({
        code: 'custom',
        path: ['folders'],
        message: 'blocks: a workflow file carries at most 500 across folders',
      })
    }
    const tasks = file.folders.reduce(
      (sum, folder) => sum + (folder.tasks?.length ?? 0),
      0,
    )
    if (tasks > 1000) {
      ctx.addIssue({
        code: 'custom',
        path: ['folders'],
        message: 'tasks: a workflow file carries at most 1000 across folders',
      })
    }
  })
export type ImportWorkflowBody = z.infer<typeof importWorkflowBody>
