/*
The task, and everything true about one that is not a question of how it looks.

`docs/design/prototype-v2/src/lib/task-model.ts`, read at `7d2064c`, reduced
to its declarations. The file arrives here rather than at S23 because
`lib/task-writer.tsx`, `lib/task-concept.ts` and every surface that follows
them speak in this shape, and a shape declared twice is a shape that will one
day disagree with itself. Its own header says why it exists at all: the row
and its card disagreed twice while each wrote its own copy of one fact, "the
row said Weekly about a task that repeated on weekdays", and both faults were
one fact written down in two places.

**What crossed and what did not, named rather than discovered.** The four
interfaces below and the two counts are the whole of the lift, verbatim. What
stayed behind is the prototype's fixture half, `PEOPLE`, `FACE_*`,
`LAB_TODAY`, `TODAY_ISO` and the tasks themselves, which RFC 0004's close
forbids crossing in any form, and its **wording half**: `dueLabelFor`,
`dueChipValue`, `reminderChipValue`, `repeatShort`, `repeatSummary`,
`parseDueLabel`, `dayStamp` and their neighbours. Those are not withheld, they
are somebody else's row: they turn a field into the words a chip or a row
says, and the surfaces that say them arrive at S23. This client already writes
a due label in `parts/presenters.ts` against 4.11's today and 9.7's clock, so
importing a second set now would be the two-copies fault this file's own
header is about, one release early.

**The seam these types cross.** A `ConceptTask` is what a card holds; a
`TaskCard` and a `TaskDetail` are what 7.0 answers. `lib/task-concept.ts` is
the join and is the only place the two vocabularies meet.
*/

export interface ConceptStep {
  title: string
  done: boolean
}

/*
Something attached to a task or hung on a comment.

One declaration. It was written out twice, once for a task's attachments and
once for a comment's files, with the same four fields, which is how a `link`
kind can be added to one and not the other.

**`link` is a kind, not a file with an address**, and that distinction is the
whole of the fault Imran found: a pasted link was stored as `kind: "file"`, so
it landed in the file list wearing a paperclip and a row that said
**"Download"**. It was neither downloadable nor openable.

A link has a `url` and is rendered as an anchor. A file does not and is not.

`kind` stays a small closed set rather than a MIME type, for the reason
DES-055 gives: a server has to decide this by sniffing the bytes anyway,
because a browser will happily run a script a client labelled image/png, so
the client never sees a type it might be tempted to trust.

**Nothing fills this today and `lib/task-concept.ts` says so where it maps.**
Attachments need storage, permissions and the virus story DES-055 has owed
since v1; the type is here so the card can be built with a third block in it
rather than two, which is the prototype's own reason for drawing it.
*/
export interface Attachment {
  name: string
  meta: string
  kind: 'image' | 'video' | 'document' | 'file' | 'link'
  /* A thumbnail, where there is something to see. */
  preview?: string
  /* Where the link goes. Set only on `kind: "link"`; a file has no address
     that outlives the session. */
  url?: string
}

/*
A comment: who said it, when, and one of three kinds of what, words, a voice
note, or files riding along. Replies are the same shape one level down, and
one level is deliberate: a task's conversation is a short thread, not a forum,
and unbounded nesting is how a card grows a scrollbar inside a scrollbar.

**The conversation is 9.6's and this client already serves one**, at
`GET /folders/:id/thread` with `queryKeys.thread()`. Mapping a thread into
this shape is S26's row, where the thread mounts on a task, so
`lib/task-concept.ts` leaves `comments` undefined and names the row that
fills it. The type is here because `ConceptTask` refers to it.
*/
export interface ConceptComment {
  id: string
  author: { initials: string; name: string; image?: string }
  at: string
  body?: string
  /* Reactions: the lightest way a team says "seen and agreed" without a
     message. A small closed set, no picker dependency. */
  reactions?: { emoji: string; count: number; mine?: boolean }[]
  /* Whether the body was changed after posting; drawn as a quiet "(edited)"
     because silent edits are how threads stop being trusted. */
  edited?: boolean
  /* A voice note: how long it runs and the waveform to draw. */
  voice?: { seconds: number; bars: number[]; url?: string }
  files?: Attachment[]
  /* Mine, so a surface knows which comments offer Delete. */
  mine?: boolean
  replies?: ConceptComment[]
}

export interface ConceptTask {
  id: string
  title: string
  done?: boolean
  /*
  **The one widening this file makes, and it is a named seam.**

  The prototype's folder is `{name, color}`, because its store is name-keyed
  and a name is the only handle it has. Dana addresses a folder by id (7.4),
  and RFC 0004's close forbids the name-keyed store crossing in any form. So
  `id` is added and left optional: a lifted card that sets a name and a colour
  still typechecks and still behaves, and a picker written against this client
  sets the id, which `lib/task-writer.tsx` prefers over the name. Optional
  rather than required so `components/task-card.tsx` and
  `components/task-row.tsx` cross verbatim at S23, which is the whole point of
  the exercise.

  The same widening, for the same reason, on `assignee` below.
  */
  folder?: { name: string; color: string; id?: string }
  /* A due date is a day, not a moment. There was a `dueTime` here until
     2026-08-18; Imran ruled the Due picker date-only, and a field nothing
     can set is a field the next person has to work out the fate of. A task
     that needs a time of day has a reminder, which carries one. */
  due?: { label: string; overdue?: boolean }
  reminder?: string
  repeatEvery?: string
  repeatDays?: string[]
  repeatEnds?: string
  assignee?: { initials: string; name: string; image?: string; id?: string }
  /* Steps are the items themselves rather than a count, so the count is
     derived and ticking one in an expanded card moves the number in the row
     behind it. A count that cannot be wrong is better than a count. */
  steps?: ConceptStep[]
  attachments?: Attachment[]
  /* Which unit a recurrence counts in. */
  repeatUnit?: 'day' | 'week' | 'month' | 'year'
  recurrence?: boolean
  pulled?: boolean
  important?: boolean
  abandoned?: boolean
  notes?: string
  /* The conversation about the task, pinned after the content blocks and
     outside their order: commentary is not content. DES-129. */
  comments?: ConceptComment[]
}

export function stepCount(task: ConceptTask): { done: number; total: number } | null {
  if (!task.steps || task.steps.length === 0) return null
  return {
    done: task.steps.filter((s) => s.done).length,
    total: task.steps.length,
  }
}

export function commentCount(comments: ConceptComment[] | undefined): number {
  if (!comments) return 0
  return comments.reduce(
    (sum, comment) => sum + 1 + (comment.replies?.length ?? 0),
    0,
  )
}
