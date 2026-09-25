/*
One member of a page, opened from the sharing panel's member list (#209): their
Access, what they are responsible for, whether they may write that themselves,
and the history of all three.

Access and Responsibilities are two different things and stay two things here
(#209 R5): Access is what the member may do, one of the six presets;
Responsibilities are a document saying what they look after, and grant nothing.

Every control is drawn from the server's own `viewer_may_*` answer for this
viewer and this member, which only decides what is worth drawing. The routes
decide again on every write.
*/
import { useState } from 'react'

import { FOLDER_ACCESS_LABELS, FOLDER_ACCESS_PRESETS } from '../../shared/folder-access.js'
import type { FolderAccessPreset } from '../../shared/folder-access.js'
import type { RichContent } from '../../shared/rich-content.js'
import type { ResponsibilityDocument } from '../../shared/responsibility.js'
import { ApiError } from '../api/http.js'
import {
  useChangeMemberAccess,
  useSaveResponsibility,
  useSetSelfEditGrant,
} from '../api/mutations.js'
import { useFolderMember, useFolderMemberHistory } from '../api/queries.js'
import type { MemberHistoryEntry } from '../api/queries.js'
import { PersonFace } from '../components/person-face.js'
import { Button } from '../components/ui/button.js'
import { Checkbox } from '../components/ui/checkbox.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.js'
import { documentToText, textToDocument } from '../lib/responsibility-text.js'
import { formatRelativeDay } from '../parts/format-dates.js'
import { initialsOf, presenterToday } from '../parts/presenters.js'

const HEADING = 'px-2 pb-1 text-sm font-medium text-foreground'

export function MemberDetails({
  folderId,
  userId,
  onBack,
}: {
  readonly folderId: string
  readonly userId: string
  readonly onBack: () => void
}): React.JSX.Element {
  const details = useFolderMember(folderId, userId)
  const [showHistory, setShowHistory] = useState(false)
  const history = useFolderMemberHistory(folderId, userId, showHistory)
  const changeAccess = useChangeMemberAccess()
  const grant = useSetSelfEditGrant()

  const back = (
    <Button variant="ghost" className="mb-[var(--space-inline)] text-muted-foreground" onClick={onBack}>
      All members
    </Button>
  )
  const member = details.data
  if (member === undefined) {
    return (
      <div>
        {back}
        {details.isError ? (
          <p className="px-2 text-sm text-muted-foreground">This member is no longer on the page.</p>
        ) : null}
      </div>
    )
  }
  const name = member.user.display_name ?? 'Someone'

  return (
    <div className="flex flex-col gap-[var(--space-group)]">
      <div>
        {back}
        <div className="flex items-center gap-[var(--space-inline)] px-2">
          <PersonFace
            id={member.user.id}
            name={name}
            initials={initialsOf(name)}
            image={member.user.avatar_url}
          />
          <h3 className="min-w-0 flex-1 truncate text-base font-medium text-foreground">{name}</h3>
          {member.is_owner ? <span className="text-xs text-muted-foreground">Owner</span> : null}
        </div>
      </div>

      <section aria-label="Access">
        <div className="flex min-h-[var(--row-height)] items-center gap-[var(--space-inline)] px-2">
          <span className="flex-1 text-sm text-foreground">Access</span>
          {member.viewer_may_change_access ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" aria-label={`Access: ${FOLDER_ACCESS_LABELS[member.access]}`} />}
              >
                {FOLDER_ACCESS_LABELS[member.access]}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuRadioGroup
                  value={member.access}
                  onValueChange={(next: unknown) => {
                    const picked = FOLDER_ACCESS_PRESETS.find((preset) => preset === next)
                    if (picked === undefined || picked === member.access) return
                    changeAccess.mutate({
                      folderId,
                      userId,
                      access: picked,
                      expected: member.access,
                    })
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
          ) : (
            <span className="text-sm text-muted-foreground">{FOLDER_ACCESS_LABELS[member.access]}</span>
          )}
        </div>
        {member.viewer_may_change_self_edit_grant ? (
          <label className="flex min-h-[var(--row-height)] cursor-pointer items-center gap-[var(--space-inline)] px-2 text-sm text-foreground">
            <Checkbox
              checked={member.can_edit_own_responsibilities}
              disabled={grant.isPending}
              onCheckedChange={(checked) => {
                grant.mutate({ folderId, userId, enabled: checked })
              }}
            />
            Can edit their own responsibilities
          </label>
        ) : member.can_edit_own_responsibilities ? (
          <p className="px-2 text-sm text-muted-foreground">Can edit their own responsibilities</p>
        ) : null}
      </section>

      {/* Not keyed by revision: a refetch after someone else's save must not
          throw away the draft being written. */}
      <Responsibilities
        folderId={folderId}
        userId={userId}
        content={member.responsibility.content}
        revision={member.responsibility.revision}
        mayEdit={member.viewer_may_edit_responsibility}
        onStale={() => {
          void details.refetch()
        }}
      />

      <section aria-label="History">
        <Button
          variant="ghost"
          className="text-muted-foreground"
          aria-expanded={showHistory}
          onClick={() => {
            setShowHistory((open) => !open)
          }}
        >
          {showHistory ? 'Hide history' : 'Show history'}
        </Button>
        {showHistory && history.data !== undefined ? (
          <ul role="list" className="mt-1 flex flex-col gap-[var(--space-row)] px-2">
            {history.data.map((item) => (
              <li key={`${item.kind}-${item.entry.id}`} className="flex gap-[var(--space-inline)] text-sm">
                <span className="min-w-0 flex-1 text-foreground">{historySentence(item)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatRelativeDay(item.entry.effective_at, presenterToday())}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  )
}

function Responsibilities({
  folderId,
  userId,
  content,
  revision,
  mayEdit,
  onStale,
}: {
  readonly folderId: string
  readonly userId: string
  readonly content: ResponsibilityDocument | null
  readonly revision: string
  readonly mayEdit: boolean
  readonly onStale: () => void
}): React.JSX.Element {
  const save = useSaveResponsibility()
  const [draft, setDraft] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const empty = content === null || content.blocks.length === 0

  function commit(): void {
    if (draft === null) return
    setProblem(null)
    save.mutate(
      { folderId, userId, content: textToDocument(draft), baseRevision: revision },
      {
        onSuccess: () => {
          setDraft(null)
        },
        onError: (error) => {
          if (error instanceof ApiError && error.status === 422) setProblem(error.message)
          // Someone saved first: the toast says so, the draft stays, and the
          // next Save is made against what they saved.
          if (error instanceof ApiError && error.status === 409) onStale()
        },
      },
    )
  }

  return (
    <section aria-label="Responsibilities">
      <div className="flex items-center gap-[var(--space-inline)]">
        <h3 className={`${HEADING} flex-1`}>Responsibilities</h3>
        {mayEdit && draft === null ? (
          <Button
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => {
              setDraft(documentToText(content))
            }}
          >
            Edit
          </Button>
        ) : null}
      </div>
      {draft !== null ? (
        <div className="flex flex-col gap-[var(--space-inline)] px-2">
          <textarea
            aria-label="Responsibilities"
            autoFocus
            rows={8}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
            }}
            placeholder="What they look after"
            className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-quiet-foreground focus-visible:border-ring"
          />
          <p className="text-xs text-muted-foreground">
            # heading, - bullet, **bold**, _italic_, [text](link)
          </p>
          {problem === null ? null : <p className="text-xs text-destructive">{problem}</p>}
          <div className="flex justify-end gap-[var(--space-inline)]">
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(null)
                setProblem(null)
              }}
            >
              Cancel
            </Button>
            <Button disabled={save.isPending} onClick={commit}>
              Save
            </Button>
          </div>
        </div>
      ) : empty ? (
        <p className="px-2 text-sm text-muted-foreground">Nothing written yet.</p>
      ) : (
        <div className="flex flex-col gap-1 px-2 text-sm text-foreground">
          {content.blocks.map((block, index) =>
            block.kind === 'heading' ? (
              <p key={index} className="pt-1 font-medium">
                <Runs content={block.content} />
              </p>
            ) : block.kind === 'bullet' ? (
              <p
                key={index}
                className="flex gap-2"
                style={{ paddingLeft: `calc(${String(block.depth)} * var(--space-group))` }}
              >
                <span aria-hidden="true" className="text-muted-foreground">•</span>
                <span className="min-w-0">
                  <Runs content={block.content} />
                </span>
              </p>
            ) : (
              <p key={index}>
                <Runs content={block.content} />
              </p>
            ),
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

/* The sentence for one history entry, built from who acted, on whom, and what
   changed (#230: never from the generic activity text). */
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
