import { useContext, useState } from 'react'
import { createReactBlockSpec } from '@blocknote/react'

import { FOLDER_ACCESS_LABELS } from '../../../../shared/folder-access.js'
import { useFolder, useFolderMember } from '../../../api/queries.js'
import { documentToText } from '../../../lib/responsibility-text.js'
import { PersonFace } from '../../person-face.js'
import { DirectMessageButton } from '../../direct-message/DirectMessageButton.js'
import { PersonBlockContext } from './person-context.js'

function MemberCard({ folderId, userId }: { readonly folderId: string; readonly userId: string }): React.JSX.Element {
  const details = useFolderMember(folderId, userId)
  if (details.data === undefined) {
    return <p className="text-sm text-muted-foreground">{details.isPending ? 'Loading person…' : 'Person is no longer available on this Team.'}</p>
  }
  const member = details.data
  const name = member.user.display_name ?? 'Someone'
  const role = member.is_owner ? 'Owner' : FOLDER_ACCESS_LABELS[member.access]
  const responsibility = documentToText(member.responsibility.content).trim()
  return <div className="flex min-w-0 items-start gap-[var(--space-inline)]">
    <PersonFace id={userId} name={name} image={member.user.avatar_url} />
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium text-foreground">{name}</p>
      <p className="text-xs text-muted-foreground">{role}</p>
      {responsibility === '' ? null : <p className="line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">{responsibility}</p>}
    </div>
    <DirectMessageButton folderId={folderId} memberId={userId} memberName={name} />
  </div>
}

function PersonBlock({ userId, editable, onChoose }: {
  readonly userId: string
  readonly editable: boolean
  readonly onChoose: (userId: string) => void
}): React.JSX.Element {
  const folderId = useContext(PersonBlockContext)
  const [choosing, setChoosing] = useState(userId === '')
  const folder = useFolder(folderId ?? '', folderId !== null)
  const members = folder.data?.members ?? []
  const present = members.some((member) => member.user.id === userId)
  const names = new Map<string, number>()
  for (const member of members) {
    const name = member.user.display_name ?? 'Someone'
    names.set(name, (names.get(name) ?? 0) + 1)
  }
  return <div contentEditable={false} className="w-full min-w-0 rounded-md border border-border bg-card p-[var(--space-inline)]" data-canvas-person="">
    {folderId === null ? <p className="text-sm text-muted-foreground">Person is unavailable here.</p>
      : folder.isPending ? <p className="text-sm text-muted-foreground">Loading Team…</p>
        : folder.isError ? <p className="text-sm text-muted-foreground">Team is unavailable.</p>
          : present ? <MemberCard folderId={folderId} userId={userId} />
            : <p className="text-sm text-muted-foreground">{userId === '' ? 'Choose a Team member.' : 'Person is no longer available on this Team.'}</p>}
    {editable && folderId !== null && folder.data !== undefined && (choosing || !present) ? <select
      aria-label="Person"
      value={present ? userId : ''}
      className="mt-[var(--space-inline)] max-w-full rounded-sm border border-input bg-background px-[var(--space-inline)] py-[var(--space-row)] text-sm text-foreground"
      onChange={(event) => { if (event.target.value !== '') { onChoose(event.target.value); setChoosing(false) } }}
      onKeyDown={(event) => { event.stopPropagation() }}
    >
      <option value="">Choose a Team member</option>
      {members.map((member) => {
        const name = member.user.display_name ?? 'Someone'
        return <option key={member.user.id} value={member.user.id}>{(names.get(name) ?? 0) > 1 ? `${name} · ${member.user.id.slice(0, 8)}` : name}</option>
      })}
    </select> : editable && present ? <button type="button" className="mt-[var(--space-inline)] text-xs text-muted-foreground hover:text-foreground" onClick={() => setChoosing(true)}>Change person</button> : null}
  </div>
}

export const createCanvasPersonSpec = createReactBlockSpec(
  { type: 'person', propSchema: { userId: { default: '' } }, content: 'none' },
  {
    render: ({ block, editor }) => <PersonBlock
      userId={block.props.userId}
      editable={editor.isEditable}
      onChoose={(userId) => editor.updateBlock(block, { props: { userId } })}
    />,
    toExternalHTML: () => <p>Person</p>,
  },
)
