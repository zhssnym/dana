/*
The client-side edge of workflow import.

The server owns the 7.16 shape and every 10.3 cap. This module answers only
the two questions the shell has to answer before it can make that request:
is the selected JSON recognisably a Dana workflow, and did normalisation
leave any unsupported content behind? It deliberately does not turn a
server validation rule into a second client validation rule.

**It broke that rule once, on the one field where it cost something.** The
envelope check below carried a hand-written `value.version !== 1` from the
day this file was written until #260, which is a second copy of a number the
contract owns. #204 widened the contract to version 2 on 2026-09-17 and made
"Save as workflow" write version 2 for every folder with a page, and from
that day until this one Dana refused its own files as unreadable. The
envelope still asks about the version — that is what tells a `package.json`
from a workflow — but the set of readable versions is imported from the
contract now, so a third version arrives here without anybody editing this
line.

**A fourth arrived four days later and this line did not move**, which is that
claim being repaid rather than merely made: #185 made every export version 4,
and a picker still carrying its own literal would have refused every file this
product writes.
*/
import {
  WORKFLOW_FILE_VERSIONS,
  importWorkflowBody,
  normalizeWorkflowFile,
} from '../../shared/workflows.js'
import type { ImportWorkflowBody } from '../../shared/workflows.js'

export interface PreparedWorkflowImport {
  readonly body: Record<string, unknown>
  readonly skippedContent: boolean
  readonly taskCount: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sourceFolders(source: Record<string, unknown>): unknown[] {
  if (Array.isArray(source.folders)) return source.folders
  return [source]
}

function pageItems(folder: Record<string, unknown>): unknown[] | null {
  if (Array.isArray(folder.blocks)) return folder.blocks
  if (Array.isArray(folder.items)) return folder.items
  return null
}

/**
 * The losses performed by `normalizeWorkflowFile`, as opposed to the keys
 * 7.16 intentionally never imports. Counts are enough because blocks and
 * steps keep their order; a foreign reminder and a `labels` key below
 * version 3 are the two the normaliser removes outright.
 */
function skippedByNormalization(
  source: Record<string, unknown>,
  canonical: ImportWorkflowBody,
): boolean {
  if (
    Array.isArray(source.folders) &&
    ((Array.isArray(source.items) && source.items.length > 0) ||
      (Array.isArray(source.tasks) && source.tasks.length > 0))
  ) {
    return true
  }

  const beforeFolders = sourceFolders(source)
  for (const [folderIndex, beforeFolder] of beforeFolders.entries()) {
    if (!isRecord(beforeFolder)) continue
    const afterFolder = canonical.folders[folderIndex]
    if (afterFolder === undefined) continue

    if (
      Array.isArray(beforeFolder.blocks) &&
      Array.isArray(beforeFolder.items) &&
      beforeFolder.items.length > 0
    ) {
      return true
    }

    const beforePage = pageItems(beforeFolder)
    if (beforePage !== null && beforePage.length > (afterFolder.blocks?.length ?? 0)) {
      return true
    }

    /*
    A `labels` key the parser dropped (#227 area 4).

    **Tolerating the file and saying nothing are two different decisions, and
    this is the second one.** `shared/workflows.ts` drops `labels` from a file
    below version 3 as a foreign arrangement rather than refusing it — a
    version 1 file declares no vocabulary, so it cannot contradict one, and
    `labels` as an array of tag names per task is what most to-do exports
    write. That is right, and it is also exactly the "unsupported content left
    behind" this function exists to report: a dropped paragraph loses a
    sentence, a dropped classification loses the reason the work was sorted.
    The file still imports; the toast says something did not come with it.

    A null is absence rather than loss — `dropFolderNulls` reads it as "no
    vocabulary", which is what a serialiser spelling "none" as `null` meant —
    so it is not reported.
    */
    if (
      beforeFolder.labels !== undefined &&
      beforeFolder.labels !== null &&
      afterFolder.labels === undefined
    ) {
      return true
    }

    if (!Array.isArray(beforeFolder.tasks)) continue
    for (const [taskIndex, beforeTask] of beforeFolder.tasks.entries()) {
      if (!isRecord(beforeTask)) continue
      const afterTask = afterFolder.tasks?.[taskIndex]
      if (afterTask === undefined) continue

      if (
        Array.isArray(beforeTask.steps) &&
        beforeTask.steps.length > (afterTask.steps?.length ?? 0)
      ) {
        return true
      }
      if (typeof beforeTask.reminder === 'string' && afterTask.reminder === undefined) {
        return true
      }
      /* The task's half of the rule above: its own `labels`, which is the key
         a foreign export is most likely to carry. */
      if (
        beforeTask.labels !== undefined &&
        beforeTask.labels !== null &&
        afterTask.labels === undefined
      ) {
        return true
      }
    }
  }
  return false
}

/**
 * How many Tasks the import is about to make, which is what the toast says.
 *
 * **Both arrangements, because both are current.** A version 1 to 3 folder
 * lists its work under `tasks`; a version 4 folder writes each Task as a block
 * of its page, at the position it sits in (#185). Counting only the first would
 * have told every person importing a file this product now writes that their
 * folder arrived with no work in it.
 */
function taskCount(folders: unknown[]): number {
  return folders.reduce<number>((sum, folder) => {
    if (!isRecord(folder)) return sum
    const listed = Array.isArray(folder.tasks) ? folder.tasks.length : 0
    const page = isRecord(folder.page) && Array.isArray(folder.page.blocks)
      ? folder.page.blocks.filter(
          (block) => isRecord(block) && block.kind === 'task',
        ).length
      : 0
    return sum + listed + page
  }, 0)
}

/**
 * Returns null only when the JSON is not recognisably a workflow at all.
 * Field errors and caps remain in `body` so POST /workflows/import can return
 * its existing 422 with the field name intact.
 */
export function prepareWorkflowImport(
  value: unknown,
  takenNames: ReadonlySet<string>,
): PreparedWorkflowImport | null {
  if (!isRecord(value) || value.dana !== 'workflow') return null
  /* Widened to `unknown` rather than narrowed to the version type: the point
     of the check is that `value.version` is not known to be one of these. */
  if (!(WORKFLOW_FILE_VERSIONS as readonly unknown[]).includes(value.version)) {
    return null
  }

  const normalized = normalizeWorkflowFile(value)
  if (!isRecord(normalized)) return null

  const folders = Array.isArray(normalized.folders)
    ? normalized.folders.map((folder) => {
        if (!isRecord(folder) || typeof folder.name !== 'string') return folder
        if (!takenNames.has(folder.name)) return folder
        return { ...folder, name: `${folder.name} (imported)`.slice(0, 100) }
      })
    : null
  const body = folders === null ? normalized : { ...normalized, folders }

  // Used only to describe a successful import. A failure here never blocks
  // the request; the endpoint remains the authority for that failure.
  const canonical = importWorkflowBody.safeParse(value)
  return {
    body,
    skippedContent:
      canonical.success && skippedByNormalization(value, canonical.data),
    taskCount: taskCount(folders ?? []),
  }
}
