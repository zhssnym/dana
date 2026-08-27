/*
The thread mount, and deliberately only the mount.

RFC 0004's S23 acceptance column asks that "the card carries its thread
mount"; its S26 row lifts the conversation itself, "comments including the
thread inside a task and its attachments". This file is the boundary between
those two rows, and it exists so that `components/task-card.tsx` crosses
verbatim: that file imports `CommentsThread` and renders it inside its
Comments disclosure, and a lifted file whose import had to be edited is a
lifted file that has left the strategy.

**Why the prototype's `comments.tsx` is not lifted here, measured rather than
deferred by preference.** It is 1,099 lines and it imports `PEOPLE` and
`personTint` from `lib/task-model.ts`, `PEOPLE` being three names written for
the row lab. RFC 0004's close forbids any fixture crossing in any form, and
`app/src/client/lib/task-model.ts` is that file reduced to its declarations
for exactly that reason. So the real thread needs a roster seam, a composer
over 7.14, and the files half of 4.16 hung on a comment, which is the body of
work S26's row names. Lifting it now would ship a composer that writes
nowhere, which is the fault change control item 45 measured on
`people-screen.tsx` and refused: "three controls that do nothing on a surface
Imran reviews at dana.so the same day, which is the false green protocol
section 4 forbids, dressed as a delivery."

**So what this draws is what is true today**, which is that a task's
conversation is not yet served. 9.6's thread is answered at `GET
/folders/:id/thread` and mounting it on a task is S26's, and
`lib/task-concept.ts` already leaves `comments` undefined for that reason and
says so. The disclosure above this still draws, with its count, because the
count is `commentCount([])` and is honestly nothing; what this renders inside
it is one line saying so and no composer.

**The one thing it deliberately does not do is draw a disabled composer.**
DES-144's rule, which this repository keeps applying: a dead control is worse
than an absent one, and "a menu of dead items is the least premium thing an
interface owns".

**The contract is the prototype's, unchanged**, so S26 replaces this file
rather than editing its callers: same name, same five props, same meanings.
`onChange` is accepted and unused here, which is the shape of a seam rather
than an oversight, and is why it carries no underscore: the prop exists
because the real thread has one.
*/

import type { ConceptComment } from '../lib/task-model.js'

export function CommentsThread({
  comments,
  emptyWord = 'comment',
  layout = 'block',
}: {
  readonly comments: ConceptComment[]
  readonly onChange: (next: ConceptComment[]) => void
  readonly placeholder?: string
  /** "comment" in a card, "message" in a chat panel: the only wording that
      differs between the surfaces. */
  readonly emptyWord?: string
  /** "block" flows with the page; "pinned" fills its container, scrolls the
      thread, and keeps the composer at the foot. */
  readonly layout?: 'block' | 'pinned'
}): React.JSX.Element {
  return (
    <p
      className={
        layout === 'pinned'
          ? 'flex h-full items-center justify-center px-2 py-6 text-[13px] leading-5 text-[var(--color-graphite-500)]'
          : 'px-2 py-3 text-[13px] leading-5 text-[var(--color-graphite-500)]'
      }
    >
      {comments.length === 0
        ? `No ${emptyWord}s yet.`
        : `${comments.length} ${emptyWord}${comments.length === 1 ? '' : 's'}.`}
    </p>
  )
}
