/*
 * One member of a page, opened from the sharing panel: Access, Responsibilities, and their history. Controls
 * follow the server's `viewer_may_*` answers; the routes check again on every write.
 */
import { lazy, Suspense, useState } from 'react'

import { FOLDER_ACCESS_LABELS, FOLDER_ACCESS_PRESETS } from '../../shared/folder-access.js'
import type { FolderAccessPreset } from '../../shared/folder-access.js'
import type { RichContent } from '../../shared/rich-content.js'
import type { ResponsibilityDocument } from '../../shared/responsibility.js'
import { ApiError } from '../api/http.js'
import {
  useChangeMemberAccess,
  useSaveMemberBio,
  useSaveResponsibility,
  useSetSelfEditGrant,
} from '../api/mutations.js'
import { useFolderMember, useFolderMemberHistory } from '../api/queries.js'
import type { MemberHistoryEntry } from '../api/queries.js'
import { PersonFace } from '../components/person-face.js'
import { DirectMessageButton } from '../components/direct-message/DirectMessageButton.js'
import { Button } from '../components/ui/button.js'
import { Checkbox } from '../components/ui/checkbox.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.js'
import { cn } from '../components/ui/utils.js'
import { ChevronDown, History, MoreHorizontal, Pencil, Maximize2 } from '../lib/icons.js'
import { ProfileContentArea } from './ProfileContentArea.js'
import { documentToText } from '../lib/responsibility-text.js'
import { formatRelativeDay } from '../parts/format-dates.js'
import { initialsOf, presenterToday } from '../parts/presenters.js'
import type { ConfirmLabels } from './task-rows.js'

/** The panel's one confirm, shared so the panel knows not to close under it. */
export type AskConfirm = (message: string, run: () => void, labels?: ConfirmLabels) => void

const HEADING = 'text-sm font-section text-foreground'
const ProfileOverviewEditor = lazy(() => import('./ProfileOverviewEditor.js'))
const ProfileResponsibilitiesEditor = lazy(() => import('./ProfileResponsibilitiesEditor.js'))
const ACCESS_SCOPE: Record<FolderAccessPreset, string> = {
  full_control: 'Manage people, access, and all project work',
  can_edit: 'Edit shared work and project pages',
  can_contribute: 'Create tasks and edit assigned work',
  assigned_work: 'Update assigned tasks',
  can_comment: 'Comment and start discussions',
  can_view: 'View project work',
}

export function MemberDetails({
  folderId,
  userId,
  viewerId,
  fullPage = false,
  onOpenFullPage,
  ask,
  onRemove,
}: {
  readonly folderId: string
  readonly userId: string
  /** Who is looking, so their own row confirms before lowering itself. */
  readonly viewerId: string | null
  readonly fullPage?: boolean
  readonly onOpenFullPage?: () => void
  readonly ask: AskConfirm
  /** Remove this member, the list row's own act; absent where not offered. */
  readonly onRemove?: ((name: string) => void) | undefined
}): React.JSX.Element {
  const details = useFolderMember(folderId, userId)
  const [showHistory, setShowHistory] = useState(false)
  const [copyError, setCopyError] = useState('')
  const history = useFolderMemberHistory(folderId, userId, showHistory)
  const grant = useSetSelfEditGrant()
  const saveBio = useSaveMemberBio()
  const [editingOverview, setEditingOverview] = useState(false)

  const member = details.data
  if (member === undefined) {
    return (
      <div>
        {/* Only a 404 means they left; any other failure is the toast's. */}
        {details.error instanceof ApiError && details.error.status === 404 ? (
          <p className="px-2 text-sm text-muted-foreground">This member is no longer on the page.</p>
        ) : null}
      </div>
    )
  }
  const name = member.user.display_name ?? 'Someone'
  const Heading = fullPage ? 'h1' : 'h3'
  const hasBio = (member.bio?.trim().length ?? 0) > 0

  const canRemove = onRemove !== undefined && !member.is_owner
  function copyProfileLink(): void {
    const url = new URL(window.location.href)
    url.searchParams.set('member', userId)
    url.searchParams.set('team', 'full')
    void navigator.clipboard.writeText(url.toString())
      .then(() => setCopyError(''))
      .catch(() => setCopyError('Could not copy the profile link.'))
  }

  return (
    <div className={cn('flex w-full flex-col gap-[var(--space-group)]', fullPage && 'mx-auto max-w-4xl')}>
      <header className="flex flex-wrap items-center gap-[var(--person-card-padding)]">
        <PersonFace id={member.user.id} name={name} initials={initialsOf(name)}
          image={member.user.avatar_url}
          className={fullPage ? 'size-[var(--team-profile-avatar-size)] data-[size=sm]:size-[var(--team-profile-avatar-size)]' : undefined}/>
        <div className="min-w-0 flex-1">
          <Heading className={cn('font-title text-foreground', fullPage
            ? 'break-words text-[length:var(--text-title-size)] leading-[var(--text-title-line)]'
            : 'truncate text-sm')}>{name}</Heading>
          {fullPage ? <p className="mt-0.5 text-xs text-muted-foreground">Project teammate</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1" aria-label="Profile actions">
          <DirectMessageButton folderId={folderId} memberId={userId} memberName={name} memberImage={member.user.avatar_url}/>
          {onOpenFullPage ? (
            <Button variant="ghost" size="icon" aria-label="Open in full page" title="Open in full page"
              className="text-muted-foreground" onClick={onOpenFullPage}>
              <Maximize2 className="size-[var(--icon-size-compact)]" strokeWidth={1.75} aria-hidden="true"/>
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="More teammate actions"
              className="text-muted-foreground"/>}>
              <MoreHorizontal className="size-[var(--icon-size-compact)]" strokeWidth={1.75} aria-hidden="true"/>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem onClick={copyProfileLink}>Copy profile link</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowHistory(true)}>View history</DropdownMenuItem>
              {canRemove ? <DropdownMenuSeparator/> : null}
              {canRemove ? (
                <DropdownMenuItem variant="destructive" onClick={() => onRemove(name)}>
                  Remove from project
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {copyError ? <p role="alert" className="text-xs text-destructive">{copyError}</p> : null}

      {showHistory ? (
        <section aria-label="Profile history" className="space-y-[var(--space-inline)] border-t border-border/70 pt-[var(--space-group)]">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>Back to profile</Button>
            <History className="size-[var(--icon-size-compact)] text-muted-foreground" aria-hidden="true"/>
            <h2 className={HEADING}>History</h2>
          </div>
          {history.isPending ? <p className="text-sm text-muted-foreground">Loading history…</p> : null}
          {history.isError ? <p role="alert" className="text-sm text-destructive">Could not load history.</p> : null}
          {history.data?.length === 0 ? <p className="text-sm text-muted-foreground">No recorded changes.</p> : null}
          <ul role="list" className="divide-y divide-border/60">
            {history.data?.map((item) => (
              <li key={`${item.kind}-${item.entry.id}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 text-sm">
                <span className="min-w-0 flex-1 text-foreground">{historySentence(item)}</span>
                <time dateTime={item.entry.effective_at} className="shrink-0 text-xs text-muted-foreground">
                  {formatRelativeDay(item.entry.effective_at, presenterToday())}
                </time>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <>
          <section aria-label="In this project" className="space-y-[var(--space-group)]">
            <h2 className={HEADING}>In this project</h2>
            <div className="space-y-[var(--space-group)] border-t border-border/70 pt-[var(--space-inline)]">
              <div className="space-y-1">
                <div className="flex min-h-[var(--row-height)] items-center gap-2">
                  <span className="min-w-0 flex-1 text-sm text-muted-foreground">Authorities</span>
                  <AccessMenu folderId={folderId} userId={userId} access={member.access}
                    mayChange={member.viewer_may_change_access} self={userId === viewerId} ask={ask}/>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{ACCESS_SCOPE[member.access]}</p>
                {member.viewer_may_change_self_edit_grant ? (
                  <label className="flex cursor-pointer items-center gap-2 py-1 text-xs text-muted-foreground">
                    <Checkbox checked={member.can_edit_own_responsibilities} disabled={grant.isPending}
                      onCheckedChange={(checked) => grant.mutate({folderId,userId,enabled:checked})}/>
                    Can edit their own responsibilities
                  </label>
                ) : member.can_edit_own_responsibilities ? (
                  <p className="text-xs text-muted-foreground">Can edit their own responsibilities</p>
                ) : null}
                <div className="flex min-h-[var(--row-height)] items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 text-muted-foreground">Joined</span>
                  <span className="text-foreground">{formatRelativeDay(member.joined_at, presenterToday())}</span>
                </div>
              </div>
              <Responsibilities folderId={folderId} userId={userId}
                content={member.responsibility.content} revision={member.responsibility.revision}
                mayEdit={member.viewer_may_edit_responsibility}
                onStale={() => {void details.refetch()}}/>
              <ProfileContentArea folderId={folderId} userId={userId} area="project"
                standing={member.profile_project} names={member.profile_file_names}
                onSaved={() => details.refetch()}/>
            </div>
          </section>
          <section aria-label="About the person" className="space-y-[var(--space-group)]">
            <h2 className={HEADING}>About the person</h2>
            <div className="space-y-[var(--space-group)] border-t border-border/70 pt-[var(--space-inline)]">
              <section aria-label="Bio" className="space-y-[var(--space-inline)]">
                <div className="flex min-h-[var(--row-height)] items-center gap-2">
                  <h3 className={`${HEADING} flex-1`}>Bio</h3>
                  {member.viewer_may_edit_bio && hasBio && !editingOverview ? (
                    <Button variant="ghost" size="sm" className="text-muted-foreground"
                      onClick={() => setEditingOverview(true)}>
                      <Pencil aria-hidden="true" strokeWidth={1.75}/> Edit
                    </Button>
                  ) : null}
                </div>
                {editingOverview ? (
                  <Suspense fallback={<p className="text-sm text-muted-foreground">Loading editor…</p>}>
                    <ProfileOverviewEditor key={member.bio_updated_at ?? member.bio ?? 'empty'}
                      initial={member.bio_content} text={member.bio}
                      onCancel={() => setEditingOverview(false)}
                      onSave={async (content) => {
                        await saveBio.mutateAsync({folderId,userId,content,baseUpdatedAt:member.bio_updated_at})
                        await details.refetch()
                        setEditingOverview(false)
                      }}/>
                  </Suspense>
                ) : hasBio ? (
                  <>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                      {member.bio_content === null ? member.bio : <Runs content={member.bio_content}/>}
                    </p>
                    {member.bio_author || member.bio_last_editor ? (
                      <p className="text-xs text-muted-foreground">
                        {member.bio_author ? `Written by ${member.bio_author.display_name ?? 'Someone'}` : null}
                        {member.bio_last_editor && member.bio_last_editor.id !== member.bio_author?.id
                          ? `${member.bio_author ? ' · ' : ''}Edited by ${member.bio_last_editor.display_name ?? 'Someone'}` : null}
                      </p>
                    ) : null}
                  </>
                ) : member.viewer_may_edit_bio ? (
                  <Button variant="ghost" size="sm" className="text-muted-foreground"
                    onClick={() => setEditingOverview(true)}>
                    <Pencil aria-hidden="true" strokeWidth={1.75}/> Add bio
                  </Button>
                ) : <p className="text-sm text-muted-foreground">No bio yet.</p>}
              </section>
              <ProfileContentArea folderId={folderId} userId={userId} area="shared"
                standing={member.profile_shared} names={member.profile_file_names}
                onSaved={() => details.refetch()}/>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

/*
 * A member's Access as a picker, used by the list and the details. Without the right to change it, a label. On
 * the viewer's own row any change drops them below Full control for good, so it asks first.
 */
export function AccessMenu({
  folderId,
  userId,
  access,
  mayChange,
  self = false,
  ask,
  onRemove,
  size = 'default',
}: {
  readonly folderId: string
  readonly userId: string
  readonly access: FolderAccessPreset
  readonly mayChange: boolean
  readonly self?: boolean
  readonly ask?: AskConfirm | undefined
  readonly onRemove?: (() => void) | undefined
  readonly size?: 'default' | 'sm'
}): React.JSX.Element {
  const changeAccess = useChangeMemberAccess()
  const label = FOLDER_ACCESS_LABELS[access]
  if (!mayChange && onRemove === undefined) {
    return (
      <span className={cn('shrink-0 text-muted-foreground', size === 'sm' ? 'px-1.5 text-xs' : 'text-sm')}>
        {label}
      </span>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size={size}
            className={cn('shrink-0 text-muted-foreground', size === 'sm' ? 'font-normal' : 'pr-1.5')}
            aria-label={`Access: ${label}`}
          />
        }
      >
        {label}
        <ChevronDown strokeWidth={1.75} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {mayChange ? (
          <DropdownMenuRadioGroup
            value={access}
            onValueChange={(next: unknown) => {
              const picked = FOLDER_ACCESS_PRESETS.find((preset) => preset === next)
              if (picked === undefined || picked === access) return
              const run = (): void => {
                changeAccess.mutate({ folderId, userId, access: picked, expected: access })
              }
              if (!self) {
                run()
                return
              }
              const to = FOLDER_ACCESS_LABELS[picked]
              if (ask === undefined) return
              ask(`Lower your own Access to ${to}? You can't raise it back yourself.`, run, {
                confirmLabel: `Change to ${to}`,
                cancelLabel: 'Cancel',
              })
            }}
          >
            {FOLDER_ACCESS_PRESETS.map((preset: FolderAccessPreset) => (
              <DropdownMenuRadioItem key={preset} value={preset} className="text-sm" closeOnClick>
                {FOLDER_ACCESS_LABELS[preset]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        ) : null}
        {mayChange && onRemove !== undefined ? <DropdownMenuSeparator /> : null}
        {onRemove === undefined ? null : (
          <DropdownMenuItem variant="destructive" onClick={onRemove}>
            Remove from page
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* Presets only; nothing is sent until Invite. */
export function InviteAccessPicker({
  value,
  onChange,
  disabled,
}: {
  readonly value: FolderAccessPreset
  readonly onChange: (next: FolderAccessPreset) => void
  readonly disabled?: boolean
}): React.JSX.Element {
  const label = FOLDER_ACCESS_LABELS[value]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            disabled={disabled}
            className="shrink-0 pr-1.5 text-muted-foreground"
            aria-label={`Invite with Access: ${label}`}
          />
        }
      >
        {label}
        <ChevronDown strokeWidth={1.75} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next: unknown) => {
            const picked = FOLDER_ACCESS_PRESETS.find((preset) => preset === next)
            if (picked !== undefined) onChange(picked)
          }}
        >
          {FOLDER_ACCESS_PRESETS.map((preset: FolderAccessPreset) => (
            <DropdownMenuRadioItem key={preset} value={preset} className="text-sm" closeOnClick>
              {FOLDER_ACCESS_LABELS[preset]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Responsibilities({
  folderId, userId, content, revision, mayEdit, onStale,
}: {
  readonly folderId: string
  readonly userId: string
  readonly content: ResponsibilityDocument | null
  readonly revision: string
  readonly mayEdit: boolean
  readonly onStale: () => void
}): React.JSX.Element {
  const save = useSaveResponsibility()
  const [editing, setEditing] = useState(false)
  const empty = content === null || content.blocks.length === 0

  return (
    <section aria-label="Responsibilities" className="space-y-[var(--space-inline)]">
      <div className="flex min-h-[var(--row-height)] items-center gap-2">
        <h3 className={`${HEADING} flex-1`}>Responsibilities</h3>
        {mayEdit && !empty && !editing ? (
          <Button variant="ghost" size="sm" className="text-muted-foreground"
            onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" strokeWidth={1.75}/> Edit
          </Button>
        ) : null}
      </div>
      {editing ? (
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading editor…</p>}>
          <ProfileResponsibilitiesEditor key={revision} initial={content}
            onCancel={() => setEditing(false)}
            onSave={async (next) => {
              try {
                await save.mutateAsync({folderId,userId,content:next,baseRevision:revision})
                onStale()
                setEditing(false)
              } catch (failure) {
                if (failure instanceof ApiError && failure.status === 409) onStale()
                throw failure
              }
            }}/>
        </Suspense>
      ) : empty && mayEdit ? (
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setEditing(true)}>
          <Pencil aria-hidden="true" strokeWidth={1.75}/> Add responsibilities
        </Button>
      ) : empty ? (
        <p className="text-sm text-muted-foreground">No responsibilities yet.</p>
      ) : (
        <div className="space-y-1 text-sm leading-relaxed text-foreground">
          {content.blocks.map((block, index) =>
            block.kind === 'heading' ? (
              <p key={index} className="pt-1 font-medium"><Runs content={block.content}/></p>
            ) : block.kind === 'bullet' ? (
              <p key={index} className="flex gap-2 break-words"
                style={{paddingLeft:`calc(${String(block.depth)} * var(--space-group))`}}>
                <span aria-hidden="true" className="text-muted-foreground">•</span>
                <span className="min-w-0"><Runs content={block.content}/></span>
              </p>
            ) : <p key={index} className="break-words"><Runs content={block.content}/></p>
          )}
        </div>
      )}
    </section>
  )
}

function Runs({ content }: { readonly content: RichContent }): React.JSX.Element {
  return (
    <>
      {content.runs.map((run, index) => {
        let node: React.ReactNode = run.text
        if (run.href !== undefined) {
          const external = /^(https?:|mailto:)/i.test(run.href)
          node = (
            <a
              href={run.href}
              className="underline underline-offset-2"
              {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
            >
              {node}
            </a>
          )
        }
        if (run.italic === true) node = <em>{node}</em>
        if (run.bold === true) node = <strong className="font-medium">{node}</strong>
        return <span key={index}>{node}</span>
      })}
    </>
  )
}

/* Built from who acted, on whom and what changed, never from the generic activity text. */
function historySentence(item: MemberHistoryEntry): string {
  if (item.kind === 'access') {
    const e = item.entry
    const actor = e.actor?.display_name ?? 'Someone'
    const to = e.new_access === null ? '' : FOLDER_ACCESS_LABELS[e.new_access]
    const from = e.previous_access === null ? '' : FOLDER_ACCESS_LABELS[e.previous_access]
    switch (e.transition) {
      case 'created_owner':
        return `Created the page with ${to}`
      case 'member_added':
        return `Added by ${actor} with ${to}`
      case 'invite_accepted':
        return `Joined with ${to}`
      case 'access_changed':
        return `${actor} changed Access from ${from} to ${to}`
      case 'self_demoted':
        return `Lowered their own Access to ${to}`
      case 'owner_recovered_full_control':
        return 'Took back Full control as owner'
      case 'member_left':
        return 'Left the page'
      case 'member_removed':
        return `Removed by ${actor}`
      case 'migration_initialized':
        return `Had ${to} when Access levels began`
    }
  }
  const e = item.entry
  const own = e.actor.id === e.member_id
  const actor = own ? 'They' : (e.actor.display_name ?? 'Someone')
  switch (e.transition) {
    case 'responsibility_created':
      return own ? 'Wrote their own responsibilities' : `${actor} wrote their responsibilities`
    case 'responsibility_updated':
      return own ? 'Changed their own responsibilities' : `${actor} changed their responsibilities`
    case 'responsibility_ended':
      return 'Responsibilities ended with their membership'
    case 'self_edit_granted':
      return `${actor} let them edit their own responsibilities`
    case 'self_edit_revoked':
      return `${actor} stopped them editing their own responsibilities`
  }
}
