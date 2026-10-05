// "Invite by email" in the assignee menu. The invite grants folder membership only;
// assigning the person is a second act once they are in.

import { useState } from 'react'

import { folderInviteBody } from '../api/folder-invite.js'
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
  const invite = useCreateInvite()

  function send(): void {
    const address = email.trim()
    if (address === '') return
    invite.mutate(
      folderInviteBody(address, folderId),
      {
        onSuccess: onDone,
      },
    )
  }

  return (
    // Inside the assignee menu: let only Escape reach the menu, so its typeahead never
    // eats the address.
    <div
      className="flex items-center gap-1 px-1.5 py-1"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') event.stopPropagation()
      }}
    >
      <Input
        type="email"
        aria-label={INVITE_BY_EMAIL}
        value={email}
        autoFocus
        placeholder="name@example.com"
        onChange={(event) => {
          setEmail(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          send()
        }}
        className="h-7 border-0 bg-accent px-2 text-sm shadow-none"
      />
      <Button
        type="button"
        variant="ghost"
        disabled={invite.isPending}
        onClick={send}
        className="h-7 px-2.5 text-xs hover:bg-accent"
      >
        Send
      </Button>
      <span className="sr-only">{`Share ${folderName} and assign this task.`}</span>
    </div>
  )
}
