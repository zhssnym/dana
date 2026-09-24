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
import { useNavigate } from 'react-router'

import { useImportWorkflowFile } from '../api/mutations.js'
import { useFolders } from '../api/queries.js'
import { paths } from '../routes.js'
import { dismissToast, showToast, toastSnapshot } from '../state/toasts.js'
import {
  WORKFLOW_FILE_VERSIONS,
  importWorkflowBody,
  normalizeWorkflowFile,
} from '../../shared/workflows.js'
import type { ImportWorkflowBody } from '../../shared/workflows.js'

export interface PreparedWorkflowImport {
  readonly body: Record<string, unknown>
  readonly skippedContent: boolean
  /**
   * How many `omitted` placeholders the file carried (#185, and the
   * adversarial review of it).
   *
   * **This is not `skippedContent` and must not be folded into it.** That flag
   * is about what *this import* lost on the way in — a foreign reminder, a
   * vocabulary the version does not declare, a page an older file had no
   * business carrying. A placeholder is a loss the **exporting** side already
   * made and wrote down on purpose: the person who saved the file was told,
   * and the person importing it is a different person who was told nothing.
   * The file records the gap precisely so that it can be reported here, and
   * reading it and saying nothing would waste the only thing the placeholder
   * is for.
   *
   * Zero for every file below version 4, which has no page to carry one.
   */
  readonly omittedCount: number
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

/** The blocks of a format 4 page, wherever this function is handed one — a
 * file's own folder or the body this module is about to send. */
function pageBlocks(folder: Record<string, unknown>): unknown[] {
  if (!isRecord(folder.page) || !Array.isArray(folder.page.blocks)) return []
  return folder.page.blocks
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
    A `page` key the parser dropped for being below version 4, and it is the
    same decision as the `labels` one below reached one version later.

    7.16 says a `page` below 4 "is dropped as `labels` below 3 is **and the
    picker reports the drop**": `pageItems` above reads `blocks` and `items`
    and never `page`, so without this a version 1 file carrying a whole
    composed page would import with `skippedContent` false and nothing said. A dropped page is
    the largest single loss this module can be asked to report — every
    paragraph, every heading and every Task on it — and it was the one loss it
    was silent about.

    A null is absence rather than loss, exactly as it is for `labels`.
    */
    if (
      beforeFolder.page !== undefined &&
      beforeFolder.page !== null &&
      afterFolder.page === undefined
    ) {
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

    /* #211: Purpose belongs to workflow v5. A foreign/older file carrying the
       key is tolerated by normalization, but the picker must say it was left
       behind rather than silently implying it travelled. */
    if (
      beforeFolder.purpose !== undefined &&
      beforeFolder.purpose !== null &&
      afterFolder.purpose === undefined
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
 * How many placeholders the file recorded, which is what the toast says about
 * the exporting side's own losses (#185).
 *
 * Counted off the body this module is about to send rather than off the raw
 * file, for the reason every other count here is: what a person is told must
 * describe the request that was made. The two are the same array — the
 * normaliser touches a format 4 page not at all — and reading the body is what
 * keeps that true if it ever stops being.
 */
function omittedCount(folders: unknown[]): number {
  return folders.reduce<number>((sum, folder) => {
    if (!isRecord(folder)) return sum
    const purpose =
      isRecord(folder.purpose) && Array.isArray(folder.purpose.blocks)
        ? folder.purpose.blocks
        : []
    return (
      sum +
      pageBlocks(folder).filter(
        (block) => isRecord(block) && block.kind === 'omitted',
      ).length +
      purpose.filter(
        (block) => isRecord(block) && block.kind === 'omitted',
      ).length
    )
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
    omittedCount: omittedCount(folders ?? []),
  }
}

/* What Import says when the file is not a workflow at all: what happened, and
   nothing about JSON. */
export const WORKFLOW_UNREADABLE = "That file isn't a workflow Dana can read."

/**
 * The whole of "Import workflow…" after the file chooser closes, as one flow:
 * one quiet "Importing …" line while the file is read and sent, then the
 * imported folder opens with a one-line result, or one clear error. The
 * endpoint's own failure toast (a 422 names its field) is the error line; the
 * progress line is withdrawn either way so it never outlives the request.
 */
export function useWorkflowFileImport(): (file: File) => void {
  const navigate = useNavigate()
  const folders = useFolders()
  const importWorkflow = useImportWorkflowFile()
  return (file: File): void => {
    const progress = `Importing ${file.name}…`
    showToast(progress)
    const done = (): void => {
      const line = toastSnapshot().find((toast) => toast.message === progress)
      if (line !== undefined) dismissToast(line.id)
    }
    const unreadable = (): void => {
      done()
      showToast(WORKFLOW_UNREADABLE)
    }
    void file.text().then((text) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        unreadable()
        return
      }
      const taken = new Set((folders.data ?? []).map((folder) => folder.name))
      const prepared = prepareWorkflowImport(parsed, taken)
      if (prepared === null) {
        unreadable()
        return
      }
      importWorkflow.mutate(prepared.body, {
        onSettled: done,
        onSuccess: (made) => {
          const first = made.folders[0]
          /* Landing on the imported folder is the success; a toast is kept
             only for what did not come with it. What the file itself recorded
             as left behind (#185) is a different sentence from "unsupported
             content was skipped": a placeholder is a loss the export made on
             purpose, and the importer was told nothing about it. */
          const notes = [
            prepared.skippedContent ? 'Some unsupported content was skipped.' : '',
            prepared.omittedCount === 0
              ? ''
              : `${String(prepared.omittedCount)} ${prepared.omittedCount === 1 ? 'picture, file or folder link was' : 'pictures, files or folder links were'} not included in this file.`,
          ].filter((note) => note !== '')
          if (notes.length > 0) showToast(notes.join(' '))
          if (first !== undefined) void navigate(paths.folder(first.id))
        },
      })
    }, unreadable)
  }
}
