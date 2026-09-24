/*
The Dana Link picker (#223, spec 07.24): `@` in the canvas, or "Link to…" in
the `/` menu, searches `GET /references/search` and inserts a chip pointing
at the target's canonical `/app/<kind>s/<id>` path — never a copied title as
the thing that matters.
*/
import { SuggestionMenuController } from '@blocknote/react'
import type { ComponentProps } from 'react'
import type { DefaultReactSuggestionItem } from '@blocknote/react'
import { SuggestionMenu } from '@blocknote/core/extensions'

import { Link2 } from '../../lib/icons.js'
import type { CanvasEditor } from '../page/canvas/schema.js'
import { danaLinkOf, kindNoun, searchReferences } from './dana-link.js'
import type { LooseSummary } from './dana-link.js'
import { DanaLinkKindIcon } from './kind-icon.js'

export const TRIGGER = '@'
type Transaction = Parameters<NonNullable<ComponentProps<typeof SuggestionMenuController>['shouldOpen']>>[0]

export function insertDanaLink(editor: CanvasEditor, summary: LooseSummary): void {
  const target = danaLinkOf(summary.path)
  const label = summary.label === '' ? kindNoun(summary.kind) : summary.label
  editor.insertInlineContent([
    // A kind this client cannot resolve yet still links, as a plain link.
    target === null
      ? { type: 'link', href: summary.path, content: label }
      : { type: 'danaLink', props: { href: target.path, label } },
    ' ',
  ])
}

/** `@` opens only at a word boundary, so an email address typed in prose
 * does not pop a menu. */
export function atWordStart(tr: Transaction): boolean {
  const { $from } = tr.selection
  const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset, undefined, '￼')
  return before === '' || /\s/.test(before)
}

export function hint(title: string): DefaultReactSuggestionItem & { size: 'small' } {
  return { title, onItemClick: () => {}, size: 'small' }
}

let latest = 0

/**
 * The page half of the `@` menu, shared with the person mention menu
 * (canvas/mentions.tsx, Wave 2): hint rows until two characters, then the
 * pages the viewer can open. `quiet` drops the hint rows, for a caller that
 * already has rows of its own to show.
 */
export async function pageSuggestionItems(editor: CanvasEditor, query: string, quiet = false): Promise<DefaultReactSuggestionItem[]> {
  const q = query.trim()
  if (q.length < 2) return quiet ? [] : [hint('Type to link a Task, Page, Collection, Purpose, Results or Discussion')]
  const mine = ++latest
  await new Promise((resolve) => setTimeout(resolve, 150))
  // Never [] here: BlockNote closes the menu on an empty answer.
  if (mine !== latest) return quiet ? [] : [hint('Searching…')]
  let results: LooseSummary[]
  try {
    results = await searchReferences(q.slice(0, 100))
  } catch {
    return quiet ? [] : [hint('Search is unavailable right now')]
  }
  if (results.length === 0) return quiet ? [] : [hint(`Nothing you can open matches “${q}”`)]
  // BlockNote keys menu rows by title, and a Folder and a Shelf can share
  // a name, so a repeated title says which kind it is.
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

/** The `/` menu's "Link to…": opens the same picker at the cursor. */
export function linkSlashItem(editor: CanvasEditor): DefaultReactSuggestionItem {
  return {
    title: 'Link to…',
    subtext: 'A Task, Page, Collection or Discussion',
    icon: <Link2 size={16} />,
    aliases: ['link', 'mention', 'reference', '@'],
    group: 'Basic blocks',
    // Wrapped: BlockNote calls this with the editor as its argument.
    onItemClick: () => {
      editor.getExtension(SuggestionMenu)?.openSuggestionMenu(TRIGGER, { deleteTriggerCharacter: true, ignoreQueryLength: true })
    },
  }
}
