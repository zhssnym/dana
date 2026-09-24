/*
@mentions in the editor (Wave 2, unit W-D).

**One `@` menu.** People with access to this page come first, then pages
(FE08's Dana Link search, `links/dana-link-picker.tsx`, unchanged in what it
finds). Picking a person inserts a mention; picking a page inserts a Dana
Link, exactly as before.

**A mention is a quiet chip**: the person's face and name, the page's own
text colour on the muted surface a Dana Link chip uses. On the wire it is a
rich-text run `{ text: "@Name", mention: { user_id } }` (`adapters.ts`), so
plain-text readers and the export still read a name. The server tells the
person once, and only when they are a member of the page
(`server/domain/mentions.ts`).

The chip draws the name the author saw when they wrote it. It never looks a
person up, so a chip in a page shared later names nobody new.
*/
import { useRef } from 'react'
import { createReactInlineContentSpec, SuggestionMenuController } from '@blocknote/react'
import type { DefaultReactSuggestionItem } from '@blocknote/react'

import { useFolder } from '../../../api/queries.js'
import { PersonFace } from '../../person-face.js'
import { MentionChip } from './mention-chip.js'
import { atWordStart, hint, pageSuggestionItems, TRIGGER } from '../../links/dana-link-picker.js'
import type { CanvasEditor } from './schema.js'

export { MentionChip, mentionName } from './mention-chip.js'

export const mentionInlineSpec = createReactInlineContentSpec(
  {
    type: 'mention',
    propSchema: { userId: { default: '' }, label: { default: '' } },
    content: 'none',
  } as const,
  {
    render: ({ inlineContent }) => <MentionChip label={inlineContent.props.label} />,
    toExternalHTML: ({ inlineContent }) => <span>{inlineContent.props.label}</span>,
  },
)

interface Person {
  readonly id: string
  readonly name: string
  readonly image: string | null
}

export function insertMention(editor: CanvasEditor, person: Person): void {
  editor.insertInlineContent([
    { type: 'mention', props: { userId: person.id, label: `@${person.name}` } },
    ' ',
  ] as Parameters<CanvasEditor['insertInlineContent']>[0])
}

/**
 * The `@` menu. `folderId` is the page whose members are offered; without
 * one (a Shelf, which is nobody else's) the menu offers pages only.
 */
export function MentionSuggestions({
  editor,
  folderId,
}: {
  readonly editor: CanvasEditor
  readonly folderId?: string | null
}): React.JSX.Element {
  const folder = useFolder(folderId ?? '', folderId !== undefined && folderId !== null)
  const people = useRef<readonly Person[]>([])
  people.current = (folder.data?.members ?? []).flatMap((member) =>
    member.user.display_name === null
      ? []
      : [{ id: member.user.id, name: member.user.display_name, image: member.user.avatar_url }],
  )

  return (
    <SuggestionMenuController
      triggerCharacter={TRIGGER}
      shouldOpen={atWordStart}
      getItems={async (query): Promise<DefaultReactSuggestionItem[]> => {
        const q = query.trim().toLowerCase()
        const matches = people.current
          .filter((person) => q === '' || person.name.toLowerCase().split(/\s+/).some((word) => word.startsWith(q)) || person.name.toLowerCase().startsWith(q))
          .slice(0, 6)
        const personRows: DefaultReactSuggestionItem[] = matches.map((person) => ({
          title: person.name,
          subtext: 'Person',
          icon: <PersonFace name={person.name} image={person.image} dense />,
          size: 'small' as const,
          onItemClick: () => { insertMention(editor, person) },
        }))
        const pageRows = await pageSuggestionItems(editor, query, personRows.length > 0)
        // BlockNote keys rows by title, so a page that shares a person's name
        // says it is a page.
        const taken = new Set(personRows.map((row) => row.title))
        const rows = [
          ...personRows,
          ...pageRows.map((row) => (taken.has(row.title) ? { ...row, title: `${row.title} · Page` } : row)),
        ]
        // Never []: BlockNote closes the menu on an empty answer.
        return rows.length > 0 ? rows : [hint('Type a name or a page')]
      }}
    />
  )
}
