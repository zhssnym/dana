/*
The client-side edge of workflow import.

The server owns the 7.16 shape and every 10.3 cap. This module answers only
the two questions the shell has to answer before it can make that request:
is the selected JSON recognisably a Dana workflow, and did normalisation
leave any unsupported content behind? It deliberately does not turn a
server validation rule into a second client validation rule.
*/
import {
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
 * steps keep their order; a foreign reminder and a `labels` key below version
 * 3 are the two the normaliser removes outright.
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

    /* A `labels` key below version 3 (#227 area 4). The parser drops it as a
       foreign arrangement rather than refusing the file, which is right — a
       version 1 file declares no vocabulary and cannot contradict one — but a
       dropped classification is exactly the "unsupported content left behind"
       this function exists to report, and saying nothing is what the version
       bump's own reasoning argues against. A null is absence rather than
       loss, and is not reported. */
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

function taskCount(folders: unknown[]): number {
  return folders.reduce<number>((sum, folder) => {
    if (!isRecord(folder) || !Array.isArray(folder.tasks)) return sum
    return sum + folder.tasks.length
  }, 0)
}

/**
 * Returns null only when the JSON is not recognisably a workflow at all.
 * Field errors and caps remain in `body` so POST /workflows/import can return
 * its existing 422 with the field name intact.
 *
 * **The envelope is `dana: 'workflow'` and nothing else, and the version is
 * deliberately not read here.** It was, until this line: `version !== 1`
 * refused every file above version 1 with "this is not a Dana workflow file",
 * which is the one message this module is for and the wrong one for a file
 * Dana itself wrote. #204 made version 2 a readable arrangement and #227 made
 * version 3 one, and "Save as workflow" writes a 3 for any folder with a
 * Folder Label — so this branch's own export could not be imported through
 * the product, measured rather than reasoned: `folderToWorkflowFile` writes
 * 3, and `prepareWorkflowImport` answered null for it.
 *
 * Reading the version here would be a second client validation rule, which
 * this module's header says in terms it does not do. `importWorkflowBody`
 * knows which versions are arrangements, the endpoint answers 422 for one it
 * does not know, and AC-548 pins both halves.
 */
export function prepareWorkflowImport(
  value: unknown,
  takenNames: ReadonlySet<string>,
): PreparedWorkflowImport | null {
  if (!isRecord(value) || value.dana !== 'workflow') return null

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
