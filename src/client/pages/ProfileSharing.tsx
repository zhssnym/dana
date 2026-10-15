import { useEffect, useState } from 'react'

import type { ProfileDocAudience, ProfileDocGrant, ProfileDocRoot } from '../../shared/profile-docs.js'
import { useChangeProfileDocAudience, useProfileDocSharing } from '../api/profile-docs.js'
import { useConnections, useFolder } from '../api/queries.js'
import { Button } from '../components/ui/button.js'
import { Checkbox } from '../components/ui/checkbox.js'
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover.js'
import { Lock, UsersRound } from '../lib/icons.js'

const labels: Record<ProfileDocAudience, string> = {
  only_me: 'Only me',
  project_members: 'Project members',
  selected_people: 'Selected people',
}

export function ProfileSharing({ folderId, userId, root }: {
  readonly folderId: string
  readonly userId: string
  readonly root: ProfileDocRoot | undefined
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  if (root === undefined) return <div className="flex items-center gap-1 text-xs text-muted-foreground">
    <UsersRound className="size-[var(--icon-size-compact)]" aria-hidden="true"/> Project members
  </div>
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger render={<Button variant="ghost" size="sm" className="text-muted-foreground"/>}
      aria-label={`Doc visibility: ${labels[root.audience]}`}>
      {root.audience === 'only_me' ? <Lock aria-hidden="true"/> : <UsersRound aria-hidden="true"/>}
      {labels[root.audience]}
    </PopoverTrigger>
    <PopoverContent align="start" className="max-h-[min(70vh,32rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto">
      <p className="font-section text-foreground">Doc visibility</p>
      {root.may_manage ? <SharingEditor key={root.id} folderId={folderId} userId={userId}
        root={root} close={() => setOpen(false)}/> :
        <p className="mt-2 text-sm text-muted-foreground">You can {root.may_edit ? 'edit' : 'view'} this Doc.</p>}
    </PopoverContent>
  </Popover>
}

function SharingEditor({ folderId, userId, root, close }: {
  readonly folderId: string
  readonly userId: string
  readonly root: ProfileDocRoot
  readonly close: () => void
}): React.JSX.Element {
  const sharing = useProfileDocSharing(folderId, userId, root.id, true)
  const folder = useFolder(folderId)
  const connections = useConnections()
  const change = useChangeProfileDocAudience(folderId, userId, root.id)
  const [audience, setAudience] = useState<ProfileDocAudience>(root.audience)
  const [grants, setGrants] = useState<ProfileDocGrant[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (sharing.data) setGrants(sharing.data.grants.map(({ user_id, may_edit }) => ({ user_id, may_edit })))
  }, [sharing.data])
  const people = new Map<string, string>()
  for (const member of folder.data?.members ?? []) {
    people.set(member.user.id, member.user.display_name ?? 'Someone')
  }
  for (const connection of connections.data ?? []) {
    people.set(connection.user.id, connection.user.display_name ?? connection.user.email)
  }
  for (const grant of sharing.data?.grants ?? []) {
    if (!people.has(grant.user_id)) people.set(grant.user_id, grant.display_name ?? 'Someone')
  }
  people.delete(userId)
  const setGrant = (id: string, mayEdit: boolean | null): void => {
    setGrants((current) => mayEdit === null
      ? current.filter((grant) => grant.user_id !== id)
      : [...current.filter((grant) => grant.user_id !== id), { user_id: id, may_edit: mayEdit }])
  }
  const options: ProfileDocAudience[] = root.custody === 'person'
    ? ['only_me', 'project_members', 'selected_people']
    : ['project_members', 'selected_people']
  return <div className="mt-2 space-y-[var(--space-inline)]">
    <fieldset className="space-y-1">
      <legend className="sr-only">Audience</legend>
      {options.map((option) => <label key={option} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
        <input type="radio" name={`profile-audience-${root.id}`} checked={audience === option}
          onChange={() => setAudience(option)}/>{labels[option]}
      </label>)}
    </fieldset>
    {audience !== 'only_me' ? <div className="border-t border-border pt-[var(--space-inline)]">
      <p className="text-xs text-muted-foreground">Choose people who can view or edit.</p>
      {sharing.isPending ? <p className="text-xs text-muted-foreground">Loading people…</p> : null}
      {sharing.isError ? <p role="alert" className="text-xs text-destructive">Could not load sharing.</p> : null}
      {[...people].map(([id, name]) => {
        const grant = grants.find((item) => item.user_id === id)
        return <div key={id} className="flex items-center gap-2 py-1 text-sm">
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <Checkbox checked={grant !== undefined} onCheckedChange={(checked) =>
              setGrant(id, checked ? false : null)}/>
            <span className="truncate">{name}</span>
          </label>
          {grant ? <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <Checkbox checked={grant.may_edit} onCheckedChange={(checked) => setGrant(id, checked)}/>
            Edit
          </label> : null}
        </div>
      })}
    </div> : null}
    {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    <div className="flex justify-end gap-2">
      <Button variant="ghost" size="sm" onClick={close}>Cancel</Button>
      <Button size="sm" disabled={sharing.isPending || sharing.isError || change.isPending ||
        (audience === 'selected_people' && grants.length === 0)}
        onClick={() => {
          setError('')
          void change.mutateAsync({ audience, grants: audience === 'only_me' ? [] : grants })
            .then(close).catch(() => setError('Could not save visibility.'))
        }}>Save</Button>
    </div>
  </div>
}
