// The sample workspace's types (7.20). The words live in ./projects/, one file per project.
// Dates are days relative to account creation, so the sample always reads as this month.

/** Days from today, the next given weekday, or the next given day of the month. */
export type SampleDue =
  | number
  | { readonly weekday: 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU' }
  | { readonly monthday: number }

/** Another person in the sample, by key, or `me` for the account holder. */
export type SamplePersonKey = 'sara' | 'nadia' | 'lucia'
export type SampleAuthor = SamplePersonKey | 'me'

export interface SamplePerson {
  readonly key: SamplePersonKey
  /** Fixed, so every account's sample shares the same rows. */
  readonly id: string
  readonly name: string
}

export const SAMPLE_PEOPLE: readonly SamplePerson[] = [
  { key: 'nadia', id: '5a3b1e00-0000-4000-8000-00000000d001', name: 'Nadia Rahman' },
  { key: 'sara', id: '5a3b1e00-0000-4000-8000-00000000d002', name: 'Sara Lindqvist' },
  { key: 'lucia', id: '5a3b1e00-0000-4000-8000-00000000d003', name: 'Lucía Ortega' },
]

/** One run of inline text: plain, or bold/italic, a web link, a Dana link
 * to a sample page or task (by name), or an @mention. */
export type SampleRun =
  | string
  | {
      readonly text: string
      readonly bold?: boolean
      readonly italic?: boolean
      readonly href?: string
      readonly page?: string
      readonly task?: string
    }
  | { readonly mention: SampleAuthor }

export type SampleText = string | readonly SampleRun[]

export interface SampleBlock {
  readonly kind:
    | 'section'
    | 'heading2'
    | 'heading3'
    | 'paragraph'
    | 'bullet'
    | 'numbered'
    | 'checklist'
    | 'toggle'
    | 'quote'
    | 'callout'
    | 'code'
    | 'divider'
  readonly text?: SampleText
  /** A heading2/heading3 that folds. */
  readonly toggleable?: boolean
  readonly checked?: boolean
  readonly children?: readonly SampleBlock[]
}

/** A block, a task (by title) or a sub-page (by name). Unnamed tasks and sub-pages go after the rest. */
export type SampleItem = SampleBlock | { readonly task: string } | { readonly page: string }

export interface SampleStep {
  readonly title: string
  readonly done?: boolean
}

export interface SamplePost {
  readonly by: SampleAuthor
  /** When, as days (and hours) before now. */
  readonly daysAgo: number
  readonly hoursAgo?: number
  readonly text: SampleText
  readonly likes?: readonly SampleAuthor[]
  readonly replies?: readonly SamplePost[]
}

export interface SampleThread {
  readonly title: string
  readonly by: SampleAuthor
  readonly posts: readonly SamplePost[]
  /** Closed with a decision. */
  readonly resolved?: { readonly by: SampleAuthor; readonly daysAgo: number; readonly decision: string }
}

export interface SampleTask {
  readonly title: string
  readonly notes?: string
  readonly important?: boolean
  readonly due?: SampleDue
  /** HH:MM, needs a due date. */
  readonly time?: string
  /** Started this many days from today (negative: already in progress). */
  readonly start?: number
  /** 4.11's rule; the due date is its anchor. */
  readonly repeat?: string
  /** Earlier occurrences of a repeating task, completed this many days ago. */
  readonly history?: readonly number[]
  /** A reminder at this HH:MM on the due day, or this many minutes before
   * the due time. */
  readonly reminder?: { readonly at: string } | { readonly before: number }
  readonly steps?: readonly SampleStep[]
  readonly assignee?: SamplePersonKey
  /** Completed this many days ago. */
  readonly doneDaysAgo?: number
  readonly abandoned?: boolean
  /** Pulled into Today. */
  readonly today?: boolean
  readonly thread?: readonly SamplePost[]
  /** Blocked by these tasks, by title (4.23), so the sample shows waiting. */
  readonly waitsOn?: readonly string[]
}

export interface SampleFolder {
  readonly name: string
  /** The parent page by name; none for a top-level page. Parents are listed first. */
  readonly parent?: string
  readonly icon?: string
  readonly color?: string
  readonly cover?: string
  readonly description?: string
  /** The Work tab. */
  readonly doc?: readonly SampleItem[]
  readonly purpose?: readonly SampleBlock[]
  readonly results?: readonly SampleBlock[]
  /** A custom tab and its page. */
  readonly tab?: { readonly name: string; readonly blocks: readonly SampleBlock[] }
  readonly tasks?: readonly SampleTask[]
  readonly threads?: readonly SampleThread[]
  /** Other people with access; sub-pages inherit them. */
  readonly members?: readonly SamplePersonKey[]
}

export interface SampleView {
  readonly name: string
  readonly definition: Record<string, unknown>
  readonly pinned: boolean
}

export interface SampleWorkspace {
  readonly folders: readonly SampleFolder[]
  /** Unfiled tasks, which land on Desk. */
  readonly desk: readonly SampleTask[]
  readonly views: readonly SampleView[]
  /** The sidebar's Focus lists. */
  readonly focusLists: readonly string[]
}

import { PROJECTS, DESK, FOCUS_LISTS } from './projects/index.js'

export const SAMPLE_WORKSPACE: SampleWorkspace = {
  focusLists: FOCUS_LISTS,
  folders: PROJECTS,
  desk: DESK,
  views: [],
}
