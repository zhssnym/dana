/*
The sample workspace's words (7.20). One person's projects in Dana: Maya, 29,
a product designer running seven projects that each end — a thing built,
a trip made, a flat moved into, a race run. Each project is a page with a
Purpose, the Work to do, Results when it is done, and the Discussion with the
people it involves. Each project's words live in its own file under
./projects/, gathered here.

Every string the sample writes is in this file and nowhere else, so the tone
can be read in one sitting and edited in one place. Plain, warm and concrete;
no jokes, no placeholder text, no reference to the product. Dates are days
relative to the day the account was made, in the person's own zone, so the
workspace always reads as this month rather than as the month it was written.

The other people are sample people (SAMPLE_PEOPLE): users rows with no sign-in
identity at all (no google_sub, no email), so nobody can ever sign in as them.
They are shared by every sample and never removed; what the sample removes is
their memberships, posts and assignments, with the sample's pages.
*/

/** Days from today, or the next given weekday, or the next given day of
 * the month. Resolved by the writer against today in the person's zone. */
export type SampleDue =
  | number
  | { readonly weekday: 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU' }
  | { readonly monthday: number }

/** Another person in the sample, by key, or `me` for the account holder. */
export type SamplePersonKey = 'sara' | 'nadia' | 'lucia'
export type SampleAuthor = SamplePersonKey | 'me'

export interface SamplePerson {
  readonly key: SamplePersonKey
  /** Fixed, so every account's sample shares the same three rows. */
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

/** One item of a page's Work document: a block, a task (by title, from the
 * page's own tasks) or a sub-page's block (by name). A task or sub-page the
 * document does not name is placed after everything it does. */
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
  /** The page it is a sub-page of, by name; none for a top-level page. Every
   * parent is listed before its children. */
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
