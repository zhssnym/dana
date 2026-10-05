/*
 * The client edge of workflow import: is the JSON recognisably a Dana workflow, and what did normalisation
 * drop? The server owns the shape and caps. Readable versions come from the contract, never a local literal.
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
   * Placeholders the exporter wrote on purpose. Not `skippedContent`, which is what this import lost; keep them
   * apart. Zero below version 4.
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

/** The blocks of a format 4 page. */
function pageBlocks(folder: Record<string, unknown>): unknown[] {
  if (!isRecord(folder.page) || !Array.isArray(folder.page.blocks)) return []
  return folder.page.blocks
}

/** What `normalizeWorkflowFile` removed, as opposed to keys import never reads. */
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
     * A `page` key below version 4 is dropped by the parser; report it, or a whole page vanishes silently. Null
     * is absence.
     */
    if (
      beforeFolder.page !== undefined &&
      beforeFolder.page !== null &&
      afterFolder.page === undefined
    ) {
      return true
    }

    /* A `labels` key below version 3 is dropped by the parser; report it. Null is absence, not loss. */
    if (
      beforeFolder.labels !== undefined &&
      beforeFolder.labels !== null &&
      afterFolder.labels === undefined
    ) {
      return true
    }

    /* Purpose belongs to workflow v5; report it when an older file carries it. */
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
      /* The task's own `labels`, which foreign exports often carry. */
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

/** Counted off the body being sent, so the toast describes the request made. */
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

/** Null only when the JSON is not a workflow. Field errors stay in `body`, so the server returns its 422. */
export function prepareWorkflowImport(
  value: unknown,
  takenNames: ReadonlySet<string>,
): PreparedWorkflowImport | null {
  if (!isRecord(value) || value.dana !== 'workflow') return null
  /* Widened to `unknown`: the point is that `value.version` is not known to be one of these. */
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

  // Only describes a successful import; never blocks the request.
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
export const WORKFLOW_UNREADABLE = "Dana can't read that file."

/**
 * One quiet "Importing …" line while the file is read and sent, then the folder opens with one result line or
 * one error. The progress line is always withdrawn.
 */
export function useWorkflowFileImport(): (file: File, parentId?: string) => void {
  const navigate = useNavigate()
  const folders = useFolders()
  const importWorkflow = useImportWorkflowFile()
  return (file: File, parentId?: string): void => {
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
      // A name clashes only with the pages it will sit beside.
      const taken = new Set((folders.data ?? []).filter((folder) => (folder.parent_folder_id ?? undefined) === parentId).map((folder) => folder.name))
      const prepared = prepareWorkflowImport(parsed, taken)
      if (prepared === null) {
        unreadable()
        return
      }
      importWorkflow.mutate({ body: prepared.body, ...(parentId === undefined ? {} : { parentId }) }, {
        onSettled: done,
        onSuccess: (made) => {
          const first = made.folders[0]
          /*
           * Landing on the folder is the success. Toast only what did not come with it, and the exporter's own
           * placeholders separately.
           */
          const notes = [
            prepared.skippedContent ? 'Some unsupported content was skipped.' : '',
            prepared.omittedCount === 0
              ? ''
              : `${String(prepared.omittedCount)} ${prepared.omittedCount === 1 ? 'picture, file or page link was' : 'pictures, files or page links were'} not included in this file.`,
          ].filter((note) => note !== '')
          if (notes.length > 0) showToast(notes.join(' '))
          if (first !== undefined) void navigate(paths.folder(first.id))
        },
      })
    }, unreadable)
  }
}

/**
 * Imports into page `parentId` as sub-pages. Called from the menu press, so the chooser opens inside the user
 * gesture.
 */
export function usePageImport(): (parentId?: string) => void {
  const importFile = useWorkflowFileImport()
  /* No parent: the sidebar's right-click Import, into the Library's top level. */
  return (parentId?: string): void => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (file !== undefined) importFile(file, parentId)
    })
    input.click()
  }
}
