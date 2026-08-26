/*
A folder, saved as a shape you can use again.

Imran's brief of 2026-08-23, item 14: "a folder or a group saved locally as a
workflow, and imported."

**A workflow is a shape, not a copy**, and that one sentence settles every
question the format raises. Duplicate ([[DES-198]]) makes another instance of
your own folder inside your own account, where keeping the assignments would
merely be wrong. A workflow *leaves*: it becomes a file, and a file gets sent to
people. So the rule that governed duplicate — a grant is not a thing — is not
enough here, because the risk is no longer "Sara gets eight tasks she did not
accept" but "Sara's name, and what she was asked to do, and when, in a file on
somebody else's machine."

**So the line is drawn at people and dates, not at structure.** Imran,
2026-08-23: "only due dates, people, conversations can't be exported and
imported, all the remaining data can be saved as a workflow and when someone
wants to import it, everything should appear."

That is a wider file than the first version wrote, and he is right that it
should be. A template of a launch is not much of a template if the notes you
wrote on each task, the checklists inside them and the things you starred all
have to be typed again. The first version carried titles and nothing else,
which made a workflow a table of contents rather than a copy of the work.

So a workflow carries:

- the folder's name, glyph, colour and description
- its sections in order, the paragraphs between them, and its **images** —
  because a worked example that arrives without its picture is not one, and the
  picture is the author's own rather than something the format scraped
- each task's **title, notes, star, repeat and reminder**, its **steps with
  their titles and whether each is ticked**, whether the task itself is done or
  abandoned, and which section it sits under

And it carries **nothing that is a person or a date**:

- **no assignee and no invitation** — a grant is not a thing, and here it would
  be somebody's name in a file on a stranger's machine
- **no due date or time** — Imran's line, and the right one: a date is *when
  this run happened*, not what the work is
- **no conversation** — a message is something a person said, to someone, at a
  time; copying it puts their words in a room they were never in
- **no completion stamp and no "by"** — the state travels because it is data,
  but *who finished it and when* is an event rather than a shape

The consequence worth stating: a folder saved half-finished imports
half-finished. That follows from "all the remaining data" and is the honest
reading — a workflow is a save of the folder, where a duplicate ([[DES-198]]) is
a fresh run of it. Two acts, two rules, and the difference is deliberate.

**Imported as a new folder, never merged into an existing one.** Merging raises
a question with no good answer — what happens to a section that exists in both —
and a person who wanted a merge can import and then move things, which is a
sequence they can see. Importing something you already have gives you "Trip 2",
using the same naming duplicate uses, because a workflow you import twice is
usually a second trip rather than a mistake.

Lane 2: the file is the interesting half. Nothing here needs a server — that is
what "saved locally" means and why this item was cheap — but a ported Dana that
lets people *publish* workflows needs a validating parser, a size limit and a
decision about images that this does not make.
*/

import { folderLibrary } from "@/lib/folder-library"
import { readFolderLayout, saveFolderLayout } from "@/lib/folder-layout"
import {
  readPrototypeFolderPresentation,
  restorePrototypeFolder,
  savePrototypeFolderIdentity,
} from "@/lib/folder-presentation"
import { readPageImage, savePageImage } from "@/lib/page-images"

/* Bumped when the shape changes in a way an older file cannot satisfy. A file
   without it is not one of ours and is refused rather than guessed at. */
export const WORKFLOW_VERSION = 1

export interface WorkflowStep {
  title: string
  done: boolean
}

export interface WorkflowTask {
  title: string
  /* The id of the section it sits under, or nothing. */
  section?: string
  steps?: WorkflowStep[]
  notes?: string
  important?: boolean
  /* "completed" and "abandoned" travel; "pending" is the absence of both. */
  status?: "completed" | "abandoned"
  reminder?: string
  repeat?: string
  repeatDays?: string[]
  repeatInterval?: string
  repeatMonthlyDay?: string
  repeatEnds?: string
}

export interface WorkflowFile {
  dana: "workflow"
  version: number
  name: string
  glyph?: string
  color?: string
  description?: string
  /* Sections and paragraphs in page order, and images with their bytes. */
  items: unknown[]
  tasks: WorkflowTask[]
}

/* The one shape a task must have for this to read it, kept structural so the
   lib never imports a screen's type. */
export interface ExportableTask {
  id: string
  title: string
  status?: "pending" | "completed" | "abandoned"
  form: {
    folder: string
    notes?: string
    important?: boolean
    reminder?: string
    repeat?: string
    repeatDays?: string[]
    repeatInterval?: string
    repeatMonthlyDay?: string
    repeatEnds?: string
    steps: Array<{ title: string; done?: boolean }>
  }
}

/*
The folder, as a file.

Images are inlined, because a workflow is one file by design — a folder of
assets beside it is a thing to lose, and the whole promise is "send this to
somebody".
*/
export function folderToWorkflow<Task extends ExportableTask>(
  name: string,
  tasks: Task[],
): WorkflowFile {
  const layout = readFolderLayout<{
    kind: string
    section?: { id: string; name: string }
    paragraph?: { text: string }
    image?: { id: string; ratio: number; caption: string }
  }>(name)
  const identity = readPrototypeFolderPresentation().identity[name]

  const items = (layout?.items ?? []).map((item) =>
    item.kind === "image" && item.image
      ? {
          ...item,
          /* The bytes travel with it; the id does not, because the importing
             side mints its own. */
          image: { ...item.image, id: undefined, data: readPageImage(item.image.id) },
        }
      : item,
  )

  return {
    dana: "workflow",
    version: WORKFLOW_VERSION,
    name,
    glyph: identity?.glyph,
    color: identity?.color,
    description: identity?.description,
    items,
    tasks: tasks
      .filter((task) => task.form.folder === name)
      .map((task) => ({
        title: task.title,
        section: layout?.assign?.[task.id],
        steps: task.form.steps.length
          ? task.form.steps.map((step) => ({
              title: step.title,
              done: Boolean(step.done),
            }))
          : undefined,
        notes: task.form.notes || undefined,
        important: task.form.important || undefined,
        status: task.status === "pending" ? undefined : task.status,
        reminder: task.form.reminder === "none" ? undefined : task.form.reminder,
        repeat: task.form.repeat === "none" ? undefined : task.form.repeat,
        repeatDays: task.form.repeat === "none" ? undefined : task.form.repeatDays,
        repeatInterval:
          task.form.repeat === "none" ? undefined : task.form.repeatInterval,
        repeatMonthlyDay:
          task.form.repeat === "none" ? undefined : task.form.repeatMonthlyDay,
        repeatEnds: task.form.repeat === "none" ? undefined : task.form.repeatEnds,
      })),
  }
}

/* Offered as a download. The name is the folder's, because a file called
   `workflow.json` in a downloads folder is a file nobody can identify. */
export function saveWorkflowFile(workflow: WorkflowFile) {
  const blob = new Blob([JSON.stringify(workflow, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${workflow.name.replace(/[\\/:*?"<>|]/g, "-")}.dana-workflow.json`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/*
A file, back into a folder.

Refuses rather than guesses: a file that does not say it is one of ours, or
claims a version this build does not know, produces nothing. Importing
half-understood JSON as a folder is how somebody ends up with a page full of
`[object Object]`.
*/
export function parseWorkflow(text: string): WorkflowFile | null {
  try {
    const value = JSON.parse(text)
    if (value?.dana !== "workflow") return null
    if (typeof value.version !== "number" || value.version > WORKFLOW_VERSION) {
      return null
    }
    if (typeof value.name !== "string" || !Array.isArray(value.items)) return null
    if (!Array.isArray(value.tasks)) return null
    return value as WorkflowFile
  } catch {
    return null
  }
}

/* "Trip", then "Trip 2" — the same shape duplicate uses, because importing a
   workflow twice is usually a second trip rather than a mistake. */
export function availableFolderName(wanted: string) {
  const taken = new Set(folderLibrary().map((folder) => folder.name))
  if (!taken.has(wanted)) return wanted
  let n = 2
  while (taken.has(`${wanted} ${n}`)) n += 1
  return `${wanted} ${n}`
}

/*
Applies a workflow's page to a new folder, and returns the tasks to add.

The caller supplies a way to mint task ids, because only the shell knows what a
task id looks like here — the same split every act in this prototype uses.
*/
export function applyWorkflow(
  workflow: WorkflowFile,
  folderName: string,
  mintId: (index: number) => string,
) {
  restorePrototypeFolder(folderName)
  if (workflow.glyph || workflow.color || workflow.description) {
    savePrototypeFolderIdentity(folderName, {
      glyph: workflow.glyph,
      color: workflow.color,
      description: workflow.description,
    })
  }

  /* Images get fresh ids on this side and their bytes go to the image store,
     so a workflow imported twice does not have two folders sharing one
     picture — and deleting one does not blank the other. */
  const items = workflow.items.map((raw, index) => {
    const item = raw as {
      kind?: string
      image?: { ratio?: number; caption?: string; data?: string }
    }
    if (item.kind !== "image" || !item.image) return raw
    const id = `${folderName}-image-${index}`
    if (item.image.data) savePageImage(id, item.image.data)
    return {
      kind: "image",
      image: {
        id,
        ratio: item.image.ratio ?? 16 / 9,
        caption: item.image.caption ?? "",
      },
    }
  })

  const assign: Record<string, string> = {}
  const tasks = workflow.tasks.map((task, index) => {
    const id = mintId(index)
    if (task.section) assign[id] = task.section
    return {
      id,
      title: task.title,
      /* Older files carried bare step titles; a string is read as an unticked
         step, which is what it meant. */
      steps: (task.steps ?? []).map((step) =>
        typeof step === "string" ? { title: step, done: false } : step,
      ),
      notes: task.notes ?? "",
      important: Boolean(task.important),
      status: task.status,
      reminder: task.reminder ?? "none",
      repeat: task.repeat ?? "none",
      repeatDays: task.repeatDays ?? ["Mo"],
      repeatInterval: task.repeatInterval ?? "2",
      repeatMonthlyDay: task.repeatMonthlyDay ?? "10",
      repeatEnds: task.repeatEnds ?? "",
    }
  })

  saveFolderLayout(folderName, { items, assign })
  return tasks
}

/*
A shelf, as a file.

Imran's test for whether the shelf page earns its place: it must have an
address and be savable as a workflow. This is the second half.

A shelf's workflow is **its page and the names of its folders**, not those
folders' contents. That is what a shelf *is* — an arrangement somebody made
over things that exist without it (DES-195) — so a file that dragged eight
folders' tasks along would be a backup of half an account wearing a shelf's
name. Importing one makes the shelf and the folders it lists, empty, ready to
fill: the shape, again.
*/
export interface ShelfWorkflowFile {
  dana: "shelf-workflow"
  version: number
  name: string
  glyph?: string
  color?: string
  description?: string
  items: unknown[]
  folders: string[]
}

export function shelfToWorkflow(
  key: string,
  name: string,
  folders: string[],
): ShelfWorkflowFile {
  const layout = readFolderLayout<{
    kind: string
    image?: { id: string; ratio: number; caption: string }
  }>(key)
  const identity = readPrototypeFolderPresentation().identity[key]
  return {
    dana: "shelf-workflow",
    version: WORKFLOW_VERSION,
    name,
    glyph: identity?.glyph,
    color: identity?.color,
    description: identity?.description,
    items: (layout?.items ?? []).map((item) =>
      item.kind === "image" && item.image
        ? { ...item, image: { ...item.image, id: undefined, data: readPageImage(item.image.id) } }
        : item,
    ),
    folders,
  }
}

export function saveShelfWorkflowFile(workflow: ShelfWorkflowFile) {
  const blob = new Blob([JSON.stringify(workflow, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${workflow.name.replace(/[\/:*?"<>|]/g, "-")}.dana-shelf.json`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/*
A shelf file, back into a shelf.

Imran, 2026-08-23: "a folder can be imported as a workflow, but a shelf still
can't be imported as a workflow while it can be exported." A format you can
write and not read is not a format, it is a leak — and it was the same omission
twice over, because the import path checked for `dana: "workflow"` and a shelf
file says `dana: "shelf-workflow"`, so it was refused by the guard that exists
to refuse *foreign* files.

The two are read by one function now. A caller that wants either gets a tagged
result and switches once, rather than every caller learning both shapes.
*/
export type AnyWorkflow =
  | { kind: "folder"; file: WorkflowFile }
  | { kind: "shelf"; file: ShelfWorkflowFile }

export function parseAnyWorkflow(text: string): AnyWorkflow | null {
  const folder = parseWorkflow(text)
  if (folder) return { kind: "folder", file: folder }
  try {
    const value = JSON.parse(text)
    if (value?.dana !== "shelf-workflow") return null
    if (typeof value.version !== "number" || value.version > WORKFLOW_VERSION) {
      return null
    }
    if (typeof value.name !== "string" || !Array.isArray(value.items)) return null
    if (!Array.isArray(value.folders)) return null
    return { kind: "shelf", file: value as ShelfWorkflowFile }
  } catch {
    return null
  }
}

/*
Applies a shelf's file: its page, and the folders it named.

The folders arrive **empty and by name**, because that is what a shelf's file
carries and why it is small (DES-210). A folder the account already has is
joined to the shelf rather than duplicated — importing a shelf that mentions
Travel should put your Travel on it, not make a second one.
*/
export function applyShelfWorkflow(
  file: ShelfWorkflowFile,
  shelfName: string,
  shelfStorageKey: string,
) {
  restorePrototypeFolder(shelfStorageKey)
  if (file.glyph || file.color || file.description) {
    savePrototypeFolderIdentity(shelfStorageKey, {
      glyph: file.glyph,
      color: file.color,
      description: file.description,
    })
  }

  const items = file.items.map((raw, index) => {
    const item = raw as {
      kind?: string
      image?: { ratio?: number; caption?: string; data?: string }
    }
    if (item.kind !== "image" || !item.image) return raw
    const id = `${shelfStorageKey}-image-${index}`
    if (item.image.data) savePageImage(id, item.image.data)
    return {
      kind: "image",
      image: {
        id,
        ratio: item.image.ratio ?? 16 / 9,
        caption: item.image.caption ?? "",
      },
    }
  })
  saveFolderLayout(shelfStorageKey, { items, assign: {} })

  const existing = new Set(folderLibrary().map((folder) => folder.name))
  return {
    /* Already yours: joined to the shelf. */
    join: file.folders.filter((folder) => existing.has(folder)),
    /* Named but absent: made, empty. */
    create: file.folders.filter((folder) => !existing.has(folder)),
  }
}
