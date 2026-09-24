/*
9.6's sharing panel, the surface the folder header's Share button opens,
ported from the designer's `src/components/sharing-panel.tsx`
onto our mutations:

  "member list with joined dates and remove controls per the 5.4 matrix;
  roster picker ('Share with someone you're connected to'); email field
  ('Invite by email'); pending invites list with exact email, sent time,
  Cancel, Resend (disabled within 24 hours, tooltip 'Resent recently')."

**It is his 440px sheet and it is still a named region.** 9.1's sections table
carries "Sharing panel" for this page and says so in its own words: the panel
keeps that name "whether it is rendered beside the list or over it, that being
presentation and the name being addressing". A sheet is a dialog, and a dialog
is not a region, so the region is inside it and wraps everything the panel
holds. That is the whole of what the two rules together ask for, and it is what
AC-162 and AC-183 address the member list through.

**Four blocks, and each is a place the client hides a control the server would
refuse anyway.** 7.11 lists that under client conveniences with no authority,
which is the rule this file is written to: every condition below is decided
again by 5.3 and 5.4 server-side, and none of them is enforced here.

**Administering people is Full control's now, not the owner's** (issue #228;
accepted #209 R8A: Full control may "administer members, Access", and Can edit
"cannot administer people/Access"). Three of the four blocks below are that
one sentence -- removing a member, adding one from the roster, and inviting by
email -- so a viewer below Full control sees the member list and nothing else
on this panel. The gate is `lib/folder-authority.ts`'s `mayDraw`, reading the
same table `POST /folders/:id/members` resolves against; AC-024 carries the
decision.

*(The pending-invite list needs no gate of its own: R9 makes it member
administration data, and the server answers `[]` below Full control, so there
is nothing left to draw.)*

**What this panel still does not have is the Access control itself.** R8A's
six presets are on the wire for every member and this surface renders none of
them, so Access is administered through the API alone. That is named here
rather than left to be discovered, and it is not this change's to build.

- **Remove is offered to Full control alone**, and never on the owner's own
  row: the owner's membership is not another member's to end (the route
  answers "The folder's owner cannot be removed"), and the owner's own exit is
  R6's transfer-then-leave, which 9.6 puts in the header's overflow menu.
- **The roster picker offers connections who are not already members.** 5.3
  refuses an add for a non-connection (422) and for an existing member (409),
  and 7.3's roster is what the picker is built from.
- **Resend is disabled inside 24 hours**, with 9.6's own tooltip. 7.5 answers
  429 for the same window; disabling is the convenience and the 429 is the
  rule.

Two of his strings are corrected rather than transcribed, and both corrections
are section 9's.

His remove confirm reads "They'll lose access to {folder}. Tasks assigned to
them in this folder will become unassigned.", split across a dialog title and
its description. 9.6 writes that sentence itself, and design may restyle it and
not reword it, a sentence delivered in
two pieces being reworded by the reader rather than by the writer. So the whole
of 9.6's sentence is the title, and the two controls are 9.1's uniform
"Continue" and "Cancel".

And his cancel control on a pending invite reads "Cancel", which is the exact
name 9.1's table gives the second control of every confirmation. A folder with
a pending invite and an open confirmation would then hold two controls of one
name meaning two different things, one of which discards an invite. 9.6
describes this control rather than naming it, so the description is what it
takes: "Cancel invite".

**Nothing here reads.** The folder detail and the roster arrive as props from
`FolderPage`, which is the client's settled one-hook-per-surface rule. The
panel is mounted only while the person has opened it, so the reads it consumes
are the page's whether it is open or not.
*/
import { useState } from 'react'
import { Mail, UserPlus, UsersRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

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
import { Combobox } from '../components/ui/combobox.js'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../components/ui/sheet.js'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../components/ui/tooltip.js'
import { mayDraw } from '../lib/folder-authority.js'
import type { FolderViewerFacts } from '../lib/folder-authority.js'
import { formatCompactDate, formatRelativeDay } from '../parts/format-dates.js'
import { initialsOf, presenterToday } from '../parts/presenters.js'
import { ConfirmDialog, useConfirm } from './task-rows.js'
import { PersonFace } from '../components/person-face.js'

/** 9.1's sections table for this page. */
const SHARING_PANEL = 'Sharing panel'

/** 9.6, the roster picker's own label. */
const ROSTER_PICKER = "Share with someone you're connected to"

/** 9.6, the email field's label, and 9.3's word for the same act. */
const INVITE_BY_EMAIL = 'Invite by email'

/** 9.6: the tooltip on a resend refused inside the 24 hour window. */
const RESENT_RECENTLY = 'Resent recently'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Whether 5.2's resend window has passed, from the row's own `last_sent_at`.
 *
 * The window is read off the invite rather than remembered from a click, which
 * is why 7.5 carries `last_sent_at` on the invite at all: a person who reloads
 * the page, or who opens it on another device, sees the same disabled control
 * rather than one that has forgotten.
 */
function resendable(lastSentAt: string): boolean {
  return Date.now() - Date.parse(lastSentAt) >= DAY_MS
}

/**
 * The confirm before an owner removes a member, 9.6's own sentence.
 *
 * One sentence in one element: AC-183 asserts it as a single text run, and the
 * name in the middle may sit in its own element while a block boundary may not.
 */
function removeMemberConfirm(who: string, folder: string): string {
  return (
    `Remove ${who} from ${folder}? They lose access, and anything in this ` +
    'folder assigned to them becomes unassigned.'
  )
}

/** His section heading: a glyph, then the words, in the panel's quiet register. */
function PanelHeading({
  icon: Icon,
  children,
}: {
  readonly icon: LucideIcon
  readonly children: string
}): React.JSX.Element {
  return (
    <div className="mb-2 flex items-center gap-2">
      <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      <h3 className="text-sm font-semibold">{children}</h3>
    </div>
  )
}

export function FolderSharingPanel({
  folder,
  connections,
  viewer,
  onClose,
}: {
  readonly folder: GetFolderResponse
  /** 7.3's roster, which the picker is built from. Absent while it loads. */
  readonly connections: GetConnectionsResponse | undefined
  /** The viewer's own Access facts, read off the same folder detail this
   * panel draws (issue #228). Null while the roster has not arrived, which
   * withholds the three administrative blocks rather than flashing them. */
  readonly viewer: FolderViewerFacts | null
  readonly onClose: () => void
}): React.JSX.Element {
  /* One question per block, each asked of `shared/folder-actions.ts` -- the
     table the routes resolve against -- rather than restated here. */
  const mayRemove = viewer !== null && mayDraw(viewer, 'member.remove')
  const mayAdd = viewer !== null && mayDraw(viewer, 'member.add')
  const mayInvite = viewer !== null && mayDraw(viewer, 'invite.create')
  const addMember = useAddFolderMember()
  const removeMember = useRemoveFolderMember()
  const invite = useCreateInvite()
  const cancel = useCancelInvite()
  const resend = useResendInvite()
  const confirm = useConfirm()
  const [picked, setPicked] = useState('')
  const [email, setEmail] = useState('')

  const memberIds = new Set(folder.members.map((member) => member.user.id))
  const invitable = (connections ?? []).filter((entry) => !memberIds.has(entry.user.id))

  function sendInvite(): void {
    const trimmed = email.trim()
    if (trimmed === '') return
    setEmail('')
    // The folder rides the body, which is what makes this an invite to this
    // folder rather than the bare one the People screen sends, and what turns
    // a connected address into 7.5's instant share instead of its 409.
    // A folder invite must also name its Access; folderInviteBody says which.
    invite.mutate(folderInviteBody(trimmed, folder.id))
  }

  return (
    <>
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      /*
      Non-modal, this being the second of DES-154's two right-edge panels.

      That decision says a settled behaviour belongs to the mechanism rather
      than to each screen, and these two share one edge, so this panel takes
      the rule DES-186 fixed for the conversation's. A modal sheet makes the
      document beneath it inert and hides it behind a backdrop, which would
      turn the room the shell now reserves on the right into decoration: a
      page nobody can read or touch is not a page the panel is beside. The
      escape key, the focus handling and the close control stay the
      primitive's.
      */
      modal={false}
    >
      {/*
      DES-026's 440px sheet. The width lives in `tokens.css` as
      `--sharing-panel-width`, the home this file's R9 comment requested and
      the polish pass granted; the inline declaration is still what carries
      it, because the sheet primitive's `data-[side=right]:sm:max-w-sm` beats
      any class here by stylesheet order (measured at R9: the prototype's own
      `sm:max-w-none` loses the same collision and his panel renders 384,
      which is why DES-026's number existed only in his source).
      */}
      <SheetContent
        side="right"
        className="w-[var(--sharing-panel-width)] sm:max-w-none"
        /* polish: folderpage F11: never wider than the screen. */
        style={{
          width: 'min(var(--sharing-panel-width), 100vw)',
          maxWidth: 'min(var(--sharing-panel-width), 100vw)',
        }}
        /* No backdrop at all now that the sheet is non-modal: a dimmed plate
           over a page the panel is meant to sit beside is the covering this
           mechanism exists to end. */
        overlayClassName="hidden"
      >
        {/* The region 9.1's sections table names, inside the dialog rather
            than on it: a dialog is announced by its own title and cannot also
            be the region a control is addressed within. */}
        <section aria-label={SHARING_PANEL} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader className="border-b border-border px-5 py-4 pr-16">
            <SheetTitle className="text-base font-semibold">Share {folder.name}</SheetTitle>
            <SheetDescription>
              Members can view and manage every task in this folder.
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div>
              <PanelHeading icon={UsersRound}>Members</PanelHeading>
              <ul role="list" className="space-y-0.5">
                {folder.members.map((member) => {
                  const name = member.user.display_name ?? 'Someone'
                  return (
                    <li
                      key={member.user.id}
                      className="flex min-h-14 items-center gap-3 rounded-md px-2 hover:bg-muted"
                    >
                      {/* polish round-2: the member's own picture, which
                          7.4's members element carries; the tint stands in
                          where a person has none. */}
                      <PersonFace
                        id={member.user.id}
                        name={name}
                        initials={initialsOf(name)}
                        image={member.user.avatar_url}
                        className="size-8"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-foreground">{name}</p>
                          {member.is_owner ? <span className="text-xs text-muted-foreground">Owner</span> : null}
                        </div>
                        {/* "joined dates": the membership row's own timestamp.
                            The format is the design's, so the value is
                            rendered as 7.4 carries it. */}
                        <p className="text-xs text-muted-foreground">
                          Joined {formatCompactDate(member.joined_at.slice(0, 10))}
                        </p>
                      </div>
                      {mayRemove && !member.is_owner ? (
                        <Button
                          variant="outline"
                          className="h-8 px-3 text-xs"
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
            </div>

            {mayAdd ? (
            <div className="mt-7">
              <PanelHeading icon={UserPlus}>{ROSTER_PICKER}</PanelHeading>
              <div className="flex gap-2">
                <Combobox
                  aria-label={ROSTER_PICKER}
                  value={picked}
                  disabled={addMember.isPending}
                  className="min-w-0 flex-1"
                  placeholder="Choose a person"
                  options={invitable.map((entry) => ({
                    value: entry.user.id,
                    label: entry.user.display_name ?? entry.user.email,
                  }))}
                  onValueChange={setPicked}
                />
                <Button
                  variant="commit"
                  disabled={picked === '' || addMember.isPending}
                  onClick={() => {
                    const userId = picked
                    setPicked('')
                    if (userId === '') return
                    addMember.mutate({ folderId: folder.id, userId })
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
            ) : null}

            {mayInvite ? (
            <div className="mt-7">
              <PanelHeading icon={Mail}>{INVITE_BY_EMAIL}</PanelHeading>
              <div className="flex gap-2">
                <Input
                  type="email"
                  aria-label={INVITE_BY_EMAIL}
                  value={email}
                  disabled={invite.isPending}
                  placeholder="name@example.com"
                  className="h-[var(--control-height)] text-sm md:text-sm"
                  onChange={(event) => {
                    setEmail(event.target.value)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    sendInvite()
                  }}
                />
                <Button
                  variant="commit"
                  disabled={!email.includes('@') || invite.isPending}
                  onClick={sendInvite}
                >
                  Send invite
                </Button>
              </div>
            </div>
            ) : null}

            {folder.pending_invites.length === 0 ? null : (
              <div className="mt-7">
                <h3 className="mb-2 text-sm font-semibold">Pending invites</h3>
                <ul role="list" className="space-y-1">
                  {folder.pending_invites.map((row) => (
                    <li
                      key={row.id}
                      className="flex min-h-14 items-center gap-3 rounded-md px-2 hover:bg-muted"
                    >
                      <Avatar className="size-8">
                        <AvatarFallback className="text-xs">@</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        {/* "exact email": the address as it was invited, never
                            a display name, because the point of this list is
                            that a mistyped address can be seen and repaired. */}
                        <p className="truncate text-sm font-medium">{row.email}</p>
                        <p className="text-xs text-muted-foreground">
                          Sent {formatRelativeDay(row.last_sent_at, presenterToday())}
                        </p>
                      </div>
                      {/* 9.6's own word for the control, as the prototype
                          draws it; the email beside it says which invite. */}
                      <Button
                        variant="ghost"
                        className="h-8 px-2 text-xs text-muted-foreground"
                        onClick={() => {
                          cancel.mutate(row.id)
                        }}
                      >
                        Cancel
                      </Button>
                      {resendable(row.last_sent_at) ? (
                        <Button
                          variant="ghost"
                          className="h-8 px-2 text-xs"
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
                                <Button variant="ghost" className="h-8 px-2 text-xs" disabled>
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
