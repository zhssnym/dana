import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { SHORTCUT_GROUPS, shortcutKey } from './shortcuts.js'

// A deliberately small, safe Markdown subset. No HTML rendering or dynamic scripts.
// Public article authors can use headings, paragraphs, lists, inline code, bold and links.
function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\[([^\]]+)\]\(([^)\s]+)\)|@@([^@@]+)@@|\*\*([^*]+)\*\*)/g
  // '@@' is replaced with backtick before parsing; this avoids an extra dependency.
  const normalized = text.replace(/@@/g, String.fromCharCode(96))
  const regex = new RegExp(pattern.source.replace(/@@/g, String.fromCharCode(96)), 'g')
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(normalized)) !== null) {
    if (match.index > cursor) nodes.push(normalized.slice(cursor, match.index))
    const key = String(match.index)
    if (match[2] !== undefined && match[3] !== undefined) {
      const href = match[3]
      if (href.startsWith('/help/') || href === '/help') {
        nodes.push(<Link key={key} to={href} className="text-primary underline underline-offset-2">{match[2]}</Link>)
      } else if (href.startsWith('https://')) {
        nodes.push(<a key={key} href={href} rel="noopener noreferrer" className="text-primary underline underline-offset-2">{match[2]}</a>)
      } else {
        nodes.push(match[2])
      }
    } else if (match[4] !== undefined) {
      nodes.push(<code key={key} className="rounded-sm bg-muted px-1 text-xs">{match[4]}</code>)
    } else if (match[5] !== undefined) {
      nodes.push(<strong key={key} className="font-section">{match[5]}</strong>)
    }
    cursor = regex.lastIndex
  }
  if (cursor < normalized.length) nodes.push(normalized.slice(cursor))
  return nodes
}

function ShortcutReference(): React.JSX.Element {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
  return (
    <div className="space-y-6">
      {SHORTCUT_GROUPS.map((group) => (
        <section key={group.title} aria-label={group.title}>
          <h2 className="mb-2 font-section text-foreground">{group.title}</h2>
          <div className="divide-y divide-border border-y border-border">
            {group.rows.map((row) => (
              <div key={row.what} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span>{row.what}</span>
                <span className="flex flex-wrap items-center gap-1 text-xs" aria-label={row.what + ' shortcut'}>
                  {[row.keys, ...(row.also ? [row.also] : [])].map((chord, index) => (
                    <span key={chord.join('+')} className="flex items-center gap-1">
                      {index > 0 ? <span className="mx-1 text-muted-foreground">or</span> : null}
                      {chord.map((key) => <kbd key={key} className="rounded-sm border border-border bg-muted px-1.5 py-1">{shortcutKey(key, mac)}</kbd>)}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export function helpHeadingId(title: string): string {
  return title.toLocaleLowerCase().replace(/\*\*/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function helpHeadings(body: string): readonly { readonly id: string; readonly title: string }[] {
  return body.split(/\r?\n/).filter((line) => line.startsWith('## ')).map((line) => {
    const title = line.slice(3)
    return { title, id: helpHeadingId(title) }
  })
}

export function HelpMarkdown({ body }: { readonly body: string }): React.JSX.Element {
  const lines = body.split(/\r?\n/)
  const blocks: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!.trim()
    if (line === '') { i++; continue }
    const key = String(i)
    if (line === '[[shortcuts]]') {
      blocks.push(<ShortcutReference key={key} />)
      i++
      continue
    }
    if (line.startsWith('## ')) {
      blocks.push(<h2 key={key} id={helpHeadingId(line.slice(3))} className="scroll-mt-24 mt-10 mb-4 font-title text-[length:var(--text-h2-size)] leading-[var(--text-h2-line)]">{inline(line.slice(3))}</h2>)
      i++
      continue
    }
    if (line.startsWith('### ')) {
      blocks.push(<h3 key={key} className="mt-6 mb-3 font-section text-[length:var(--text-h3-size)] leading-[var(--text-h3-line)]">{inline(line.slice(4))}</h3>)
      i++
      continue
    }
    const ordered = /^\d+\.\s/.test(line)
    const unordered = /^-\s/.test(line)
    if (ordered || unordered) {
      const entries: ReactNode[] = []
      while (i < lines.length) {
        const item = lines[i]!.trim()
        if (ordered ? !/^\d+\.\s/.test(item) : !/^-\s/.test(item)) break
        entries.push(<li key={String(i)} className="pl-1">{inline(item.replace(ordered ? /^\d+\.\s/ : /^-\s/, ''))}</li>)
        i++
      }
      const cls = 'my-4 space-y-2.5 pl-5 text-sm leading-6 text-foreground'
      blocks.push(ordered ? <ol key={key} className={'list-decimal ' + cls}>{entries}</ol> : <ul key={key} className={'list-disc ' + cls}>{entries}</ul>)
      continue
    }
    const paragraph: string[] = []
    while (i < lines.length) {
      const next = lines[i]!.trim()
      if (!next || next.startsWith('## ') || next.startsWith('### ') || next === '[[shortcuts]]' || /^-\s/.test(next) || /^\d+\.\s/.test(next)) break
      paragraph.push(next)
      i++
    }
    blocks.push(<p key={key} className="my-4 text-sm leading-7 text-foreground">{inline(paragraph.join(' '))}</p>)
  }
  return <div>{blocks}</div>
}
