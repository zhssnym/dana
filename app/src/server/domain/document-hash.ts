/*
`documentHash`, Dana's one content-identity function.

**This module exists to break an import cycle, and it must keep importing
nothing but node's crypto.** Anything added here that reaches another domain
module re-closes the cycle described below, and the failure will not look like
an import problem: it looked like `TypeError: documentHash is not a function`
in exactly one file of the whole suite, pointing four modules away at a
function every other file was calling successfully.

## Why it moved here (issue #230)

It was declared at the top of `page-document.ts`, which is right for the only
consumer it had. The Responsibility document is the second, and importing
`page-document.ts` from `domain/responsibility.ts` closed a **cycle**:
`responsibility.ts` needs it, `page-document.ts` needs `tasks.ts` for
`createTaskIn`, and `folders.ts` -- which `tasks.ts` reaches -- needs
`responsibility.ts` for the lifecycle hook.

A cycle in this position fails in a way that reads as a broken function rather
than as a broken import graph, and it does not fail everywhere. Node evaluates
the modules in whatever order the *entry point* reaches them, so the binding
is initialized for most callers and not for the one that enters the cycle at
`page-document.ts`. That entry point fails with `TypeError: documentHash is
not a function` pointing at a function four modules away, while every other
file that uses the same code passes. Three layers of the cycle had nothing to do with hashing.

So it is a leaf module, `page-document.ts` re-exports it, and nothing about it
changed. `rich-content.ts` is the same move made on the shared side of the same
branch and for the same reason.

## What it promises, since this is now the file to read

The sha256 of `JSON.stringify(value)`, and therefore: **a canonical input or a
meaningless answer.** `JSON.stringify` writes keys in insertion order, so two
objects carrying the same data in a different order hash differently. Both
callers get canonicality from a zod `.transform()` that rebuilds the object
with a fixed key order before this is reached -- `richContent` on one side,
`responsibilityDocument` on the other -- and a third caller that skipped that
step would get a function that appears to work and is wrong exactly when two
clients disagree about key order.
*/
import { createHash } from 'node:crypto'

export const documentHash = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

/**
 * Block rows as a revision hashes them, with a column added after a document's
 * first revision dropped wherever it is null (0038's `toggleable`, and on a
 * Shelf `list_parent_block_id`), so adding the column changes no stored
 * revision and no open editor meets a conflict it did not cause; a non-null
 * value still changes the revision, which is the rule that matters.
 */
export const hashableBlocks = (
  rows: readonly Record<string, unknown>[],
  added: readonly string[] = ['toggleable'],
): Record<string, unknown>[] =>
  rows.map((row) => {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row)) {
      if (added.includes(key) && (value === null || value === undefined)) continue
      out[key] = value
    }
    return out
  })
