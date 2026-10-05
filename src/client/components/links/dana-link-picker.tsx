// The Dana Link picker: `@` or "Link to…" inserts a chip with the target's
// canonical `/app/<kind>s/<id>` path.
import { SuggestionMenuController } from '@blocknote/react'
import type { ComponentProps } from 'react'
import type { DefaultReactSuggestionItem } from '@blocknote/react'
import { SuggestionMenu } from '@blocknote/core/extensions'

import { Link2 } from '../../lib/icons.js'
import type { CanvasEditor } from '../page/canvas/schema.js'
import { danaLinkOf, kindNoun, referenceDisplayLabel, searchReferences } from './dana-link.js'
import type { LooseSummary } from './dana-link.js'
import { DanaLinkKindIcon } from './kind-icon.js'

export const TRIGGER = '@'
type Transaction = Parameters<NonNullable<ComponentProps<typeof SuggestionMenuController>['shouldOpen']>>[0]

export function insertDanaLink(editor: CanvasEditor, summary: LooseSummary): void {
  const target = danaLinkOf(summary.path)
  const resolved = summary.label === '' ? kindNoun(summary.kind) : summary.label
  // The picker shows the full "Project · Facet" label; the chip stays compact.
  const label = referenceDisplayLabel(summary.kind, resolved)
  editor.insertInlineContent([
    // A kind this client cannot resolve still links, as a plain link.
    target === null
      ? { type: 'link', href: summary.path, content: label }
      : { type: 'danaLink', props: { href: target.path, label } },
    ' ',
  ])
}

/** `@` opens only at a word boundary, so typing an email address does not open the menu. */
export function atWordStart(tr: Transaction): boolean {
  const { $from } = tr.selection
  const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset, undefined, '￼')
  return before === '' || /\s/.test(before)
}

export function hint(title: string): DefaultReactSuggestionItem & { size: 'small' } {
  return { title, onItemClick: () => {}, size: 'small' }
}

let latest = 0

/** The page half of the `@` menu, shared with person mentions. `quiet` drops the hint rows. */
export async function pageSuggestionItems(editor: CanvasEditor, query: string, quiet = false, folderId?: string): Promise<DefaultReactSuggestionItem[]> {
  const q = query.trim()
  if (q.length < 2) return quiet ? [] : [hint('Type to link a Task, Page, Collection, Purpose, Results, Result or Discussion')]
  const mine = ++latest
  await new Promise((resolve) => setTimeout(resolve, 150))
  // Never [] here: BlockNote closes the menu on an empty answer.
  if (mine !== latest) return quiet ? [] : [hint('Searching…')]
  let results: LooseSummary[]
  try {
    // The composing page's own items come first.
    results = await searchReferences(q.slice(0, 100), folderId)
  } catch {
    return quiet ? [] : [hint('Search is unavailable right now')]
  }
  if (results.length === 0) return quiet ? [] : [hint(`Nothing you can open matches “${q}”`)]
  // BlockNote keys menu rows by title, and a folder and a shelf can share a name.
  const titleOf = (summary: LooseSummary): string => summary.label === '' ? 'Untitled' : summary.label
  const counts = new Map<string, number>()
  for (const summary of results) counts.set(titleOf(summary), (counts.get(titleOf(summary)) ?? 0) + 1)
  const seen = new Set<string>()
  return results.map((summary) => {
    let title = titleOf(summary)
    if ((counts.get(title) ?? 0) > 1) title = `${title} · ${kindNoun(summary.kind)}`
    for (let n = 2; seen.has(title); n += 1) title = `${titleOf(summary)} · ${kindNoun(summary.kind)} ${n}`
    seen.add(title)
    return {
      title,
      subtext: kindNoun(summary.kind),
      icon: <DanaLinkKindIcon kind={summary.kind} />,
      size: 'small' as const,
      onItemClick: () => { insertDanaLink(editor, summary) },
    }
  })
}

export function linkSlashItem(editor: CanvasEditor): DefaultReactSuggestionItem {
  return {
    title: 'Link to…',
    icon: <Link2 size={16} />,
    aliases: ['link', 'mention', 'reference', '@'],
    group: 'Basic blocks',
    // Wrapped: BlockNote calls this with the editor as its argument.
    onItemClick: () => {
      editor.getExtension(SuggestionMenu)?.openSuggestionMenu(TRIGGER, { deleteTriggerCharacter: true, ignoreQueryLength: true })
    },
  }
}
