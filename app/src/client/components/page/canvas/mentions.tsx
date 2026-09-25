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
import { useEffect, useRef } from 'react'
import { createReactInlineContentSpec, SuggestionMenuController, useComponentsContext } from '@blocknote/react'
import type { DefaultReactSuggestionItem, SuggestionMenuProps } from '@blocknote/react'

import { useConnections, useFolder, useFolders, useMe } from '../../../api/queries.js'
import { PersonFace } from '../../person-face.js'
import { MentionChip } from './mention-chip.js'
import { atWordStart, hint, insertDanaLink, pageSuggestionItems, TRIGGER } from '../../links/dana-link-picker.js'
import { DanaLinkKindIcon } from '../../links/kind-icon.js'
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
  /** Known only for the viewer and their connections (a folder roster carries none). */
  readonly email?: string
}

/** A menu row: `key` is its identity (a person's id), since two people may share a name. */
type Row = DefaultReactSuggestionItem & { readonly key?: string; readonly detail?: string }

/** Up to this many of the viewer's pages before anything is typed. */
const QUIET_PAGES = 5

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
  const me = useMe()
  const connections = useConnections()
  const folders = useFolders()
  const emails = new Map<string, string>((connections.data ?? []).map((connection) => [connection.user.id, connection.user.email]))
  if (me.data?.user.email) emails.set(me.data.user.id, me.data.user.email)
  const people = useRef<readonly Person[]>([])
  people.current = (folder.data?.members ?? []).flatMap((member) =>
    member.user.display_name === null
      ? []
      : [{ id: member.user.id, name: member.user.display_name, image: member.user.avatar_url, email: emails.get(member.user.id) }],
  )
  /* Pages before two characters are typed (the search needs two): the
     viewer's own, from the list the sidebar already holds. */
  const pages = useRef<readonly { id: string; name: string }[]>([])
  pages.current = (folders.data ?? []).filter((item) => item.id !== folderId).map((item) => ({ id: item.id, name: item.name }))

  return (
    <SuggestionMenuController
      triggerCharacter={TRIGGER}
      shouldOpen={atWordStart}
      suggestionMenuComponent={MentionList}
      getItems={async (query): Promise<Row[]> => {
        const q = query.trim().toLowerCase()
        const matches = people.current
          .filter((person) => q === '' || person.name.toLowerCase().split(/\s+/).some((word) => word.startsWith(q)) || person.name.toLowerCase().startsWith(q))
          .slice(0, 6)
        // Two people with one name are told apart by their address, where it is known.
        const named = new Map<string, number>()
        for (const person of matches) named.set(person.name, (named.get(person.name) ?? 0) + 1)
        const personRows: Row[] = matches.map((person) => ({
          key: `person:${person.id}`,
          title: person.name,
          detail: (named.get(person.name) ?? 0) > 1 ? person.email ?? (person.id === me.data?.user.id ? 'You' : undefined) : undefined,
          icon: <PersonFace id={person.id} name={person.name} image={person.image} dense />,
          size: 'small' as const,
          onItemClick: () => { insertMention(editor, person) },
        }))
        let pageRows: Row[]
        if (q.length < 2) {
          pageRows = pages.current
            .filter((page) => q === '' || page.name.toLowerCase().split(/\s+/).some((word) => word.startsWith(q)))
            .slice(0, QUIET_PAGES)
            .map((page) => ({
              key: `folder:${page.id}`,
              title: page.name,
              icon: <DanaLinkKindIcon kind="folder" />,
              size: 'small' as const,
              onItemClick: () => { insertDanaLink(editor, { kind: 'folder', id: page.id, label: page.name, path: `/app/folders/${page.id}` }) },
            }))
        } else {
          pageRows = (await pageSuggestionItems(editor, query, personRows.length > 0, folderId ?? undefined)).map((row, index) => ({ ...row, key: `page:${index}:${row.title}`, subtext: undefined }))
        }
        const rows = [...personRows, ...pageRows]
        // Never []: BlockNote closes the menu on an empty answer.
        return rows.length > 0 ? rows : [{ ...hint('Type a name or a page'), key: 'hint' }]
      }}
    />
  )
}

/** The `@` list: people, then pages, each row keyed by what it is (never its
 * words, which two people can share), with a muted second line when needed. */
function MentionList({ items, selectedIndex, onItemClick }: SuggestionMenuProps<Row>): React.JSX.Element {
  const Components = useComponentsContext()!
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (selectedIndex === undefined) return
    root.current?.querySelector(`#bn-suggestion-menu-item-${String(selectedIndex)}`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])
  return <Components.SuggestionMenu.Root id="bn-suggestion-menu" className="bn-suggestion-menu dana-slash-menu">
    <div ref={root} className="contents">
      {items.map((item, index) => (
        <div
          key={item.key ?? `${String(index)}:${item.title}`}
          id={`bn-suggestion-menu-item-${String(index)}`}
          role="option"
          aria-selected={index === selectedIndex || undefined}
          className="bn-suggestion-menu-item bn-suggestion-menu-item-small flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-accent aria-selected:bg-accent"
          onMouseDown={(event) => { event.preventDefault() }}
          onClick={() => onItemClick?.(item)}
        >
          {item.icon === undefined ? null : <span className="flex shrink-0 items-center text-muted-foreground">{item.icon}</span>}
          <span className="min-w-0 flex-1">
            <span className="block truncate">{item.title}</span>
            {item.detail === undefined ? null : <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>}
          </span>
        </div>
      ))}
    </div>
  </Components.SuggestionMenu.Root>
}
