/*
9.3's "Invite by email", kept alive across the form's retirement.

The section's assignee row: the choices are "the target folder's members plus
'Invite by email', and, new in v2, closing section 13 item 28, 'Unassigned',
offered last after a separator". The v1 form carried all three, the prototype
carries none of them: its own entry reads "Invite and assign…" against a
handler that does nothing, because its fixtures model no membership and it has
nobody to invite.

**Why this is a module rather than a few lines in the card.** 7.5's invite is
a folder act, and the folder is the task's, so the write needs the id and the
name the card holds and nothing else; but it also needs its own small piece of
state, an address being typed, and the card is a lifted file. Keeping it here
is the same arrangement `components/task-move-guard.tsx` takes for the same
reason.

**The invite is the folder's and the assignment is 8.7's**, which is the one
thing worth being precise about. 7.5 takes an email and a folder, so accepting
grants membership; the task is not sent with it, and the v1 form's comment
says why in terms this file keeps: "a create has no task yet, and an
assignment invite against a task the person has not saved would name a row
that does not exist." So this offers the person the folder, and assigning them
is a second act once they are in it, which is what the roster refreshing under
the chip means.

**Nothing here validates.** 10.3 bounds the address and 7.5 refuses a
duplicate with the 409 that 9.8 words; an empty box simply does not send,
which is not a rule but the absence of a request.
*/

import { useState } from 'react'

import { useCreateInvite } from '../api/mutations.js'
import { Button } from './ui/button.js'
import { Input } from './ui/input.js'
import { INVITE_BY_EMAIL } from './task-copy.js'

export function TaskAssigneeInvite({
  folderId,
  folderName,
  onDone,
}: {
  readonly folderId: string
  readonly folderName: string
  readonly onDone: () => void
}): React.JSX.Element {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<string | null>(null)
  const invite = useCreateInvite()

  function send(): void {
    const address = email.trim()
    if (address === '') return
    invite.mutate(
      { email: address, folder_id: folderId },
      {
        onSuccess: () => {
          setSent(address)
          onDone()
        },
      },
    )
  }

  if (sent !== null) {
    /* 9.8's sentence, which the row draws as a chip the moment 7.4 reports
       the pending invite. Said here too, because the person who just sent it
       is looking at this and not at the row behind it. */
    return (
      <p className="px-1.5 py-1 text-[12px] leading-4 text-[var(--color-info-700)]">
        {`Invite pending: ${sent}`}
      </p>
    )
  }

  return (
    <div className="flex items-center gap-1 px-1.5 py-1">
      <Input
        type="email"
        aria-label={INVITE_BY_EMAIL}
        value={email}
        placeholder="name@example.com"
        onChange={(event) => {
          setEmail(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          send()
        }}
        className="h-7 border-0 bg-[var(--color-graphite-50)] px-2 text-[13px] shadow-none"
      />
      <Button
        type="button"
        variant="ghost"
        disabled={invite.isPending}
        onClick={send}
        className="h-7 px-2.5 text-xs hover:bg-[var(--color-graphite-100)]"
      >
        Send
      </Button>
      <span className="sr-only">{`Share ${folderName} and assign this task.`}</span>
    </div>
  )
}
