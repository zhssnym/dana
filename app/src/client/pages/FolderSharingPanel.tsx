/*
9.6's sharing panel, opened by the page header's Share button: one "Name or
email" field with one Invite button, the member list, and the pending invites.

The field suggests connections who are not yet members. A picked connection
(or a typed address that is exactly one of theirs) is added at once; any other
address is sent a page invite, which the server turns into an instant share
when the address is already a connection (7.5).

Every gate here (`mayAdd`, `mayInvite`, `mayRemove`, from `lib/folder-authority`)
only hides a control the server would refuse anyway (5.3, 5.4, 7.11). Remove is
never offered on the owner's row. Resend is disabled inside 24 hours with the
tooltip "Resent recently"; the server's 429 is the rule. The folder detail and
the roster arrive as props from `FolderPage`; nothing here reads.

The region "Sharing panel" (9.1) sits inside the sheet, because a dialog cannot
also be the region its controls are addressed within.
*/
import { useId, useState } from 'react'

import type { GetConnectionsResponse } from '../../shared/connections.js'
import type { GetFolderResponse } from '../../shared/folders.js'
import { folderInviteBody } from '../api/folder-invite.js'
import {
  useAddFolderMember,
  useCancelInvite,
  useCreateInvite,
  useRemoveFolderMember,
  useResendInvite,
} from '../api/mutations.js'
import { Avatar, AvatarFallback } from '../components/ui/avatar.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet.js'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../components/ui/tooltip.js'
import { cn } from '../components/ui/utils.js'
import { mayDraw } from '../lib/folder-authority.js'
import type { FolderViewerFacts } from '../lib/folder-authority.js'
import { formatCompactDate, formatRelativeDay } from '../parts/format-dates.js'
import { initialsOf, presenterToday } from '../parts/presenters.js'
import { ConfirmDialog, useConfirm } from './task-rows.js'
import { PersonFace } from '../components/person-face.js'

/** 9.1's sections table for this page. */
const SHARING_PANEL = 'Sharing panel'

/** 9.6: the one field's label and placeholder. */
const NAME_OR_EMAIL = 'Name or email'

/** 9.6: the tooltip on a resend refused inside the 24 hour window. */
const RESENT_RECENTLY = 'Resent recently'

const DAY_MS = 24 * 60 * 60 * 1000

/** Whether 5.2's resend window has passed, read off the invite itself. */
function resendable(lastSentAt: string): boolean {
  return Date.now() - Date.parse(lastSentAt) >= DAY_MS
}

/**
 * The confirm before removing a member, 9.6's own sentence, in one element:
 * AC-183 asserts it as a single text run.
 */
function removeMemberConfirm(who: string, folder: string): string {
  return (
    `Remove ${who} from ${folder}? They lose access, and anything in this ` +
    'page assigned to them becomes unassigned.'
  )
}

const ROW =
  'flex min-h-[var(--row-height)] items-center gap-[var(--space-inline)] rounded-md px-2 py-1'

type Target = { kind: 'add'; userId: string } | { kind: 'invite'; email: string }

export function FolderSharingPanel({
  folder,
  connections,
  viewer,
  onClose,
}: {
  readonly folder: GetFolderResponse
  /** 7.3's roster, which the suggestions are built from. Absent while it loads. */
  readonly connections: GetConnectionsResponse | undefined
  /** The viewer's own Access facts (issue #228). Null while unknown, which
   * withholds the administrative controls rather than flashing them. */
  readonly viewer: FolderViewerFacts | null
  readonly onClose: () => void
}): React.JSX.Element {
  const mayRemove = viewer !== null && mayDraw(viewer, 'member.remove')
  const mayAdd = viewer !== null && mayDraw(viewer, 'member.add')
  const mayInvite = viewer !== null && mayDraw(viewer, 'invite.create')
  const addMember = useAddFolderMember()
  const removeMember = useRemoveFolderMember()
  const invite = useCreateInvite()
  const cancel = useCancelInvite()
  const resend = useResendInvite()
  const confirm = useConfirm()
  const listId = useId()
  const [text, setText] = useState('')
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  const memberIds = new Set(folder.members.map((member) => member.user.id))
  const invitable = (connections ?? []).filter((entry) => !memberIds.has(entry.user.id))

  const query = text.trim().toLowerCase()
  const suggestions =
    mayAdd && pickedId === null && query !== ''
      ? invitable.filter(
          (entry) =>
            (entry.user.display_name ?? '').toLowerCase().includes(query) ||
            entry.user.email.toLowerCase().includes(query),
        )
      : []
  const showList = open && suggestions.length > 0

  /* What pressing Invite does right now, or null for nothing. */
  const exact = invitable.find((entry) => entry.user.email.toLowerCase() === query)
  const target: Target | null =
    mayAdd && pickedId !== null
      ? { kind: 'add', userId: pickedId }
      : mayAdd && exact !== undefined
        ? { kind: 'add', userId: exact.user.id }
        : mayInvite && query.includes('@')
          ? { kind: 'invite', email: text.trim() }
          : null
  const pending = addMember.isPending || invite.isPending

  function pick(index: number): void {
    const entry = suggestions[index]
    if (entry === undefined) return
    setText(entry.user.display_name ?? entry.user.email)
    setPickedId(entry.user.id)
    setOpen(false)
    setActive(-1)
  }

  function submit(): void {
    if (target === null || pending) return
    setText('')
    setPickedId(null)
    setOpen(false)
    setActive(-1)
    if (target.kind === 'add') {
      addMember.mutate({ folderId: folder.id, userId: target.userId })
    } else {
      // A page invite must name its Access; folderInviteBody says which.
      invite.mutate(folderInviteBody(target.email, folder.id))
    }
  }

  return (
    <>
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      /* Non-modal (DES-154, DES-186): the page stays usable beside it. */
      modal={false}
    >
      {/* The width token, inline because the primitive's max-width class wins
          by stylesheet order; never wider than the screen. */}
      <SheetContent
        side="right"
        className="w-[var(--sharing-panel-width)] sm:max-w-none"
        style={{
          width: 'min(var(--sharing-panel-width), 100vw)',
          maxWidth: 'min(var(--sharing-panel-width), 100vw)',
        }}
        overlayClassName="hidden"
      >
        <section aria-label={SHARING_PANEL} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader className="border-b border-border px-5 py-4 pr-16">
            <SheetTitle className="text-sm font-title">Share {folder.name}</SheetTitle>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            {mayAdd || mayInvite ? (
              <div className="mb-[var(--space-group)] flex gap-[var(--space-inline)] px-2">
                <div className="relative min-w-0 flex-1">
                  <Input
                    role="combobox"
                    aria-label={NAME_OR_EMAIL}
                    aria-autocomplete="list"
                    aria-expanded={showList}
                    aria-controls={listId}
                    {...(showList && active >= 0
                      ? { 'aria-activedescendant': `${listId}-${String(active)}` }
                      : {})}
                    autoComplete="off"
                    spellCheck={false}
                    value={text}
                    disabled={pending}
                    placeholder={mayAdd ? NAME_OR_EMAIL : 'Email'}
                    onChange={(event) => {
                      setText(event.target.value)
                      setPickedId(null)
                      setOpen(true)
                      setActive(-1)
                    }}
                    onFocus={() => {
                      setOpen(true)
                    }}
                    onBlur={() => {
                      setOpen(false)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowDown' && suggestions.length > 0) {
                        event.preventDefault()
                        setOpen(true)
                        setActive((at) => (at + 1) % suggestions.length)
                      } else if (event.key === 'ArrowUp' && suggestions.length > 0) {
                        event.preventDefault()
                        setOpen(true)
                        setActive((at) => (at <= 0 ? suggestions.length - 1 : at - 1))
                      } else if (event.key === 'Escape' && showList) {
                        // Close the suggestions, not the panel.
                        event.preventDefault()
                        event.stopPropagation()
                        setOpen(false)
                        setActive(-1)
                      } else if (event.key === 'Enter') {
                        event.preventDefault()
                        if (showList && active >= 0) pick(active)
                        else submit()
                      }
                    }}
                  />
                  {showList ? (
                    <ul
                      id={listId}
                      role="listbox"
                      aria-label={NAME_OR_EMAIL}
                      className="absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
                    >
                      {suggestions.map((entry, index) => (
                        <li
                          key={entry.user.id}
                          id={`${listId}-${String(index)}`}
                          role="option"
                          aria-selected={index === active}
                          onMouseMove={() => {
                            setActive(index)
                          }}
                          onMouseDown={(event) => {
                            event.preventDefault()
                          }}
                          onClick={() => {
                            pick(index)
                          }}
                          className={cn(
                            'flex h-[var(--control-height)] cursor-pointer items-center gap-[var(--space-inline)] rounded-md px-2 text-sm',
                            index === active ? 'bg-accent' : null,
                          )}
                        >
                          <span className="min-w-0 truncate text-foreground">
                            {entry.user.display_name ?? entry.user.email}
                          </span>
                          {entry.user.display_name === null ? null : (
                            <span className="min-w-0 truncate text-xs text-muted-foreground">
                              {entry.user.email}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <Button disabled={target === null || pending} onClick={submit}>
                  Invite
                </Button>
              </div>
            ) : null}

            <h3 className="px-2 pb-1 text-sm font-medium text-foreground">Members</h3>
            <ul role="list" className="flex flex-col gap-[var(--space-row)]">
              {folder.members.map((member) => {
                const name = member.user.display_name ?? 'Someone'
                return (
                  <li key={member.user.id} className={ROW}>
                    <PersonFace
                      id={member.user.id}
                      name={name}
                      initials={initialsOf(name)}
                      image={member.user.avatar_url}
                    />
                    <p className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {name}{' '}
                      <span className="text-xs text-muted-foreground">
                        {member.is_owner
                          ? 'Owner'
                          : `Joined ${formatCompactDate(member.joined_at.slice(0, 10))}`}
                      </span>
                    </p>
                    {mayRemove && !member.is_owner ? (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          confirm.ask(removeMemberConfirm(name, folder.name), () => {
                            removeMember.mutate({
                              folderId: folder.id,
                              userId: member.user.id,
                            })
                          })
                        }}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </li>
                )
              })}
            </ul>

            {/* Below Full control the server answers [] here (R9), so this
                list needs no gate of its own. */}
            {folder.pending_invites.length === 0 ? null : (
              <div className="mt-[var(--space-group)]">
                <h3 className="px-2 pb-1 text-sm font-medium text-foreground">Pending invites</h3>
                <ul role="list" className="flex flex-col gap-[var(--space-row)]">
                  {folder.pending_invites.map((row) => (
                    <li key={row.id} className={ROW}>
                      <Avatar size="sm">
                        <AvatarFallback className="text-xs">@</AvatarFallback>
                      </Avatar>
                      {/* The exact address, so a typo can be seen and repaired. */}
                      <p className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {row.email}{' '}
                        <span className="text-xs text-muted-foreground">
                          Sent {formatRelativeDay(row.last_sent_at, presenterToday())}
                        </span>
                      </p>
                      {/* Not bare "Cancel": that is the confirm dialog's word. */}
                      <Button
                        variant="ghost"
                        onClick={() => {
                          cancel.mutate(row.id)
                        }}
                      >
                        Cancel invite
                      </Button>
                      {resendable(row.last_sent_at) ? (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            resend.mutate(row.id)
                          }}
                        >
                          Resend
                        </Button>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span tabIndex={0} className="inline-flex">
                                <Button variant="ghost" disabled>
                                  Resend
                                </Button>
                              </span>
                            }
                          />
                          <TooltipContent>{RESENT_RECENTLY}</TooltipContent>
                        </Tooltip>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      </SheetContent>
    </Sheet>
    <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </>
  )
}
