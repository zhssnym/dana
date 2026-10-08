import { useContext, useState } from 'react'
import { createReactBlockSpec } from '@blocknote/react'

import { FOLDER_ACCESS_LABELS } from '../../../../shared/folder-access.js'
import { useFolder, useFolderMember } from '../../../api/queries.js'
import { documentToText } from '../../../lib/responsibility-text.js'
import { Check, ChevronDown, UserRound } from '../../../lib/icons.js'
import { PersonFace } from '../../person-face.js'
import { DirectMessageButton } from '../../direct-message/DirectMessageButton.js'
import { Button } from '../../ui/button.js'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '../../ui/popover.js'
import { PersonBlockContext } from './person-context.js'

function MemberCard({ folderId, userId, picker }: { readonly folderId: string; readonly userId: string; readonly picker: React.ReactNode }): React.JSX.Element {
  const details = useFolderMember(folderId, userId)
  if (details.data === undefined) {
    return <p className="text-sm text-muted-foreground">{details.isPending ? 'Loading person…' : 'Person is no longer available on this Team.'}</p>
  }
  const member = details.data
  const name = member.user.display_name ?? 'Someone'
  const role = member.is_owner ? 'Owner' : FOLDER_ACCESS_LABELS[member.access]
  const responsibility = documentToText(member.responsibility.content).trim()
  return <div className="flex min-w-0 items-start gap-[var(--person-card-padding)]">
    <PersonFace id={userId} name={name} image={member.user.avatar_url} className="size-[var(--row-height)] data-[size=sm]:size-[var(--row-height)]" />
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-title text-foreground">{name}</p>
      <p className="text-xs text-muted-foreground">{role}</p>
      {responsibility === '' ? null : <p className="mt-[var(--space-inline)] line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">{responsibility}</p>}
    </div>
    <div className="flex shrink-0 items-center gap-[var(--space-row)]">
      <DirectMessageButton folderId={folderId} memberId={userId} memberName={name} memberImage={member.user.avatar_url} />
      {picker}
    </div>
  </div>
}

function PersonBlock({ userId, editable, onChoose }: {
  readonly userId: string
  readonly editable: boolean
  readonly onChoose: (userId: string) => void
}): React.JSX.Element {
  const folderId = useContext(PersonBlockContext)
  const [choosing, setChoosing] = useState(false)
  const folder = useFolder(folderId ?? '', folderId !== null)
  const members = folder.data?.members ?? []
  const present = members.some((member) => member.user.id === userId)
  const names = new Map<string, number>()
  for (const member of members) {
    const name = member.user.display_name ?? 'Someone'
    names.set(name, (names.get(name) ?? 0) + 1)
  }
  const picker = editable && folderId !== null && folder.data !== undefined ? <Popover open={choosing} onOpenChange={setChoosing}>
    <PopoverTrigger render={<Button variant="ghost" size={present ? 'icon-sm' : 'sm'} aria-label={present ? 'Change person' : 'Choose person'} title={present ? 'Change person' : undefined} className="text-muted-foreground hover:text-foreground" />}>
      {present ? <ChevronDown strokeWidth={1.75} aria-hidden="true" /> : <><UserRound strokeWidth={1.75} aria-hidden="true" /> Choose person</>}
    </PopoverTrigger>
    <PopoverContent className="max-w-[var(--person-picker-max-width)] p-[var(--space-inline)]" onKeyDown={(event) => event.stopPropagation()}>
      <PopoverTitle className="px-[var(--space-inline)] pb-[var(--space-inline)]">Team members</PopoverTitle>
      <div className="max-h-[var(--person-picker-max-height)] overflow-y-auto">
        {members.map((member) => {
          const name = member.user.display_name ?? 'Someone'
          const duplicate = (names.get(name) ?? 0) > 1
          const role = member.is_owner ? 'Owner' : FOLDER_ACCESS_LABELS[member.access]
          return <button key={member.user.id} type="button"
            className="flex w-full items-center gap-[var(--space-inline)] rounded-md px-[var(--space-inline)] py-[var(--space-inline)] text-left outline-none hover:bg-accent focus-visible:bg-accent"
            onClick={() => { onChoose(member.user.id); setChoosing(false) }}>
            <PersonFace id={member.user.id} name={name} image={member.user.avatar_url} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-foreground">{name}</span>
              <span className="block text-xs text-muted-foreground">{role}{duplicate ? ` · ${member.user.id.slice(0, 8)}` : ''}</span>
            </span>
            {member.user.id === userId ? <Check className="size-[var(--icon-size-compact)] text-muted-foreground" strokeWidth={1.75} aria-hidden="true" /> : null}
          </button>
        })}
      </div>
    </PopoverContent>
  </Popover> : null
  return <div contentEditable={false} className="w-full min-w-0 rounded-[var(--radius-card)] border border-border bg-card p-[var(--person-card-padding)]" data-canvas-person="">
    {folderId === null ? <p className="text-sm text-muted-foreground">Person is unavailable here.</p>
      : folder.isPending ? <p className="text-sm text-muted-foreground">Loading Team…</p>
        : folder.isError ? <p className="text-sm text-muted-foreground">Team is unavailable.</p>
          : present ? <MemberCard folderId={folderId} userId={userId} picker={picker} />
            : <div className="flex items-center gap-[var(--person-card-padding)]">
              <span className="flex size-[var(--row-height)] shrink-0 items-center justify-center rounded-md bg-accent text-muted-foreground"><UserRound className="size-[var(--icon-size-compact)]" strokeWidth={1.75} aria-hidden="true" /></span>
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">{userId === '' ? 'Add a person from this Team.' : 'Person is no longer on this Team.'}</p>
              {picker}
            </div>}
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
