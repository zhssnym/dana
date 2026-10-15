import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { TOPICS } from './topics.mjs'

const ARTICLES = fileURLToPath(new URL('../../src/client/help/articles/', import.meta.url))
const CATEGORIES = new Set([
  'Getting started', 'Tasks and planning', 'Pages and writing',
  'Collaboration', 'Navigation', 'Account and settings', 'Troubleshooting',
])
const SLOP = /\b(seamless(?:ly)?|effortless(?:ly)?|game.changing|empower(?:s|ing)?|unlock (?:the |your )?(?:power|potential)|revolutionary)\b/i

export function parseHelp(file, content) {
  const front = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(content)
  if (!front) throw new Error(file + ': missing Markdown frontmatter')
  const meta = new Map()
  for (const row of front[1].split(/\r?\n/)) {
    const index = row.indexOf(':')
    if (index < 1) throw new Error(file + ': invalid frontmatter row')
    const key = row.slice(0, index).trim()
    if (!['title', 'summary', 'section', 'related'].includes(key) || meta.has(key)) throw new Error(file + ': invalid/duplicate key ' + key)
    meta.set(key, row.slice(index + 1).trim())
  }
  const title = meta.get('title')
  const summary = meta.get('summary')
  const section = meta.get('section')
  const body = content.slice(front[0].length).trim()
  if (!title || title.length > 90 || !summary || summary.length > 190 || !CATEGORIES.has(section)) {
    throw new Error(file + ': invalid title, summary or section')
  }
  if (body.length < 60 || content.length > 12_000) throw new Error(file + ': article body is empty or too long')
  if (SLOP.test(content)) throw new Error(file + ': marketing filler is not allowed')
  if (/<\/?[a-z][\s\S]*?>/i.test(body)) throw new Error(file + ': raw HTML is not allowed')
  if (/!\[[^\]]*\]\(/.test(body)) throw new Error(file + ': image Markdown is not supported')
  if (/\]\((?!\/help\/|https:\/\/)[^)]+\)/.test(body)) throw new Error(file + ': unsupported link URL')
  return {
    title, summary, section, body,
    related: (meta.get('related') ?? '').split(',').map((part) => part.trim()).filter(Boolean),
    links: [...body.matchAll(/\]\(\/help\/([a-z]+(?:-[a-z]+)*)\)/g)].map((m) => m[1]),
  }
}

export function checkArticles(entries) {
  const slugs = new Set(entries.keys())
  const metadata = new Map()
  for (const [slug, content] of entries) {
    if (!/^[a-z]+(?:-[a-z]+)*$/.test(slug)) throw new Error('Invalid article slug ' + slug)
    const item = parseHelp(slug, content)
    metadata.set(slug, item)
  }
  for (const [slug, item] of metadata) {
    for (const link of [...item.links, ...item.related]) {
      if (!slugs.has(link)) throw new Error(slug + ': broken help link to ' + link)
    }
  }
  return metadata
}

export function currentArticles() {
  const entries = new Map()
  for (const name of readdirSync(ARTICLES)) {
    if (!name.endsWith('.md')) continue
    entries.set(name.slice(0, -3), readFileSync(join(ARTICLES, name), 'utf8'))
  }
  return entries
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const docs = checkArticles(currentArticles())
    for (const topic of TOPICS) {
      if (!docs.has(topic.slug)) throw new Error('Missing registered help topic ' + topic.slug)
    }
    console.log('Verified ' + docs.size + ' Help Center articles and topic mappings.')
  } catch (error) {
    console.error(String(error))
    process.exitCode = 1
  }
}
