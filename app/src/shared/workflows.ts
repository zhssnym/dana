/*
The 7.16 workflow-file contract (RFC 0005, DES-206), as RFC 0005 change
control item 44's B3 widened it: a folder's page blocks and each task's
title, notes, star, repeat, reminder and step titles, never ids, people, due
dates or states. The refusal is the schema's shape, not a scrubbing pass:
zod strips every key these objects do not name, so a hostile file's members,
statuses and ids are not rejected so much as never read, and what remains is
exactly what an empty folder plus typed work would have been.

**A step's tick is a state, so it does not travel either.** The prototype's
own workflow file carries each task's state and whether each step is ticked,
and item 44's list carries neither; ledger entry L-115 records the prototype
contradicting itself about this and the schema settling it by carrying no
completion. A step therefore arrives as a title, and `done` is one of the
keys stripped rather than read.

**A reminder arrives in its date-only mode and no other.** 4.8 admits two,
and an offset is computed from the task's due_time (8.6), which a file
carrying no dates never supplies. So `time_of_day` is the only mode this
schema names, and an offset key is stripped like any other.

**Every limit here is one 10.3 already carried.** An imported task is
refused by exactly the numbers a typed one is, which is why this file names
no cap of its own beyond the three the endpoint has always had: up to 50
folders, 500 blocks and 1000 tasks per file; the folder cap is the array's,
the block and task caps the whole file's, checked across folders. The task
cap was added by RFC 0005 change control item 18: until then the array's
only bound was the body parser's default, an accident a parser
configuration change would have widened silently.
*/
import { z } from 'zod'

import { recurrenceRule } from './tasks.js'

const importStep = z.object({
  title: z.string().min(1).max(300),
})

const importReminder = z.object({
  time_of_day: z
    .string()
    .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'reminder: a time of day as HH:MM'),
})

const importTask = z.object({
  title: z.string().min(1).max(300),
  notes: z.string().max(10000).optional(),
  important: z.boolean().optional(),
  recurrence_rule: recurrenceRule.optional(),
  reminder: importReminder.optional(),
  steps: z.array(importStep).max(50).optional(),
})

/** Whether the file asks the endpoint to evaluate a date, which is the
 * condition frozen 7.6's own tz ruling of 2026-08-10 puts a required
 * parameter behind: a repeat needs 4.5's anchor and a reminder needs 8.6's,
 * and a file carrying neither evaluates nothing and needs no zone. */
export function needsImportAnchor(file: ImportWorkflowBody): boolean {
  return file.folders.some((folder) =>
    (folder.tasks ?? []).some(
      (task) => task.recurrence_rule !== undefined || task.reminder !== undefined,
    ),
  )
}

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
