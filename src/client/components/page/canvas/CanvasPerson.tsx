import { useContext, useState } from 'react'
import { createReactBlockSpec } from '@blocknote/react'
import { Link } from 'react-router'

import { FOLDER_ACCESS_LABELS } from '../../../../shared/folder-access.js'
import { useFolder, useFolderMember } from '../../../api/queries.js'
import { documentToText } from '../../../lib/responsibility-text.js'
import { Check, ChevronDown, UserRound } from '../../../lib/icons.js'
import { paths } from '../../../routes.js'
import { useTeamPanelState } from '../../../state/collaboration.js'
import { PersonFace } from '../../person-face.js'
import { Button } from '../../ui/button.js'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '../../ui/popover.js'
import { PersonBlockContext } from './person-context.js'

function MemberReference({ folderId, userId, picker, onOpen }: { readonly folderId: string; readonly userId: string; readonly picker: React.ReactNode; readonly onOpen: () => void }): React.JSX.Element {
  const details = useFolderMember(folderId, userId)
  if (details.data === undefined) {
    return <p className="text-sm text-muted-foreground">{details.isPending ? 'Loading teammate…' : 'Teammate is no longer available on this Team.'}</p>
  }
  const member = details.data
  const name = member.user.display_name ?? 'Someone'
  const responsibility = documentToText(member.responsibility.content).trim()
  return <div className="inline-flex max-w-full items-center gap-[var(--space-inline)] py-[var(--space-row)]">
    <Link to={`${paths.folder(folderId)}?team=full&member=${encodeURIComponent(userId)}`} onClick={onOpen} className="inline-flex min-w-0 items-center gap-[var(--space-inline)] rounded-sm text-foreground no-underline outline-none hover:underline focus-visible:outline focus-visible:outline-ring">
      <PersonFace id={userId} name={name} image={member.user.avatar_url} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{name}</span>
        {responsibility === '' ? null : <span className="block truncate text-xs text-muted-foreground">{responsibility}</span>}
      </span>
    </Link>
    {picker}
  </div>
}

function PersonBlock({ userId, editable, onChoose }: {
  readonly userId: string
  readonly editable: boolean
  readonly onChoose: (userId: string) => void
}): React.JSX.Element {
  const folderId = useContext(PersonBlockContext)
  const [, openTeam] = useTeamPanelState(folderId ?? '')
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
    <PopoverTrigger render={<Button variant="ghost" size={present ? 'icon-sm' : 'sm'} aria-label={present ? 'Change teammate' : 'Choose teammate'} title={present ? 'Change teammate' : undefined} className="text-muted-foreground hover:text-foreground" />}>
      {present ? <ChevronDown strokeWidth={1.75} aria-hidden="true" /> : <><UserRound strokeWidth={1.75} aria-hidden="true" /> Choose teammate</>}
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
  return <div contentEditable={false} className="w-full min-w-0" data-canvas-person="">
    {folderId === null ? <p className="text-sm text-muted-foreground">Teammate is unavailable here.</p>
      : folder.isPending ? <p className="text-sm text-muted-foreground">Loading Team…</p>
        : folder.isError ? <p className="text-sm text-muted-foreground">Team is unavailable.</p>
          : present ? <MemberReference folderId={folderId} userId={userId} picker={picker} onOpen={() => openTeam(true)} />
            : <div className="inline-flex min-h-[var(--row-height)] max-w-full items-center gap-[var(--space-inline)]">
              {userId === '' ? (
                editable ? null : <p className="text-sm text-muted-foreground">No teammate selected.</p>
              ) : (
                <>
                  <UserRound className="size-[var(--icon-size-compact)] shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                  <p className="min-w-0 text-sm text-muted-foreground">Teammate is no longer on this Team.</p>
                </>
              )}
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
    toExternalHTML: () => <p>Teammate</p>,
  },
)
