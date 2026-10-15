import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('../../src/client/updates/feed.json', import.meta.url))
const MARKETING = /\b(seamless(?:ly)?|effortless(?:ly)?|game.changing|empower(?:s|ing)?|revolutionary|unlock (?:the |your )?(?:power|potential))\b/i
const DATE = /^\d{4}-\d{2}-\d{2}$/
const SHA = /^[0-9a-f]{40}$/
const ID = /^pr-([1-9]\d*)$/
const TEXT = /^[^\n\r<>]+$/

function validDay(value) {
  if (!DATE.test(value)) return false
  const date = new Date(value + 'T12:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function checkUpdates(input) {
  if (!input || input.version !== 1 || !Array.isArray(input.entries)) throw new Error('Invalid updates feed version')
  const ids = new Set()
  let previousDate = '9999-99-99'
  let historicalStarted = false
  for (const item of input.entries) {
    if (!item || !ID.test(item.id) || !Number.isSafeInteger(item.pr) || item.pr < 1 ||
      item.id !== 'pr-' + String(item.pr) || ids.has(item.id)) {
      throw new Error('Invalid or duplicate update ID')
    }
    ids.add(item.id)
    if (!validDay(item.publishedAt) || item.publishedAt > previousDate || !SHA.test(item.commit)) {
      throw new Error(item.id + ': invalid date, ordering, or deployed source SHA')
    }
    if (typeof item.historical !== 'boolean' || !['feature', 'improvement', 'fix'].includes(item.kind)) {
      throw new Error(item.id + ': invalid historical flag or kind')
    }
    if (historicalStarted && !item.historical) throw new Error('New updates must appear before the historical archive')
    if (item.historical) historicalStarted = true
    if (typeof item.title !== 'string' || typeof item.summary !== 'string' ||
      item.title.length < 12 || item.title.length > 95 || item.summary.length < 40 || item.summary.length > 230 ||
      !TEXT.test(item.title) || !TEXT.test(item.summary) || MARKETING.test(item.title + ' ' + item.summary) ||
      /https?:\/\/|www\./i.test(item.title + ' ' + item.summary) ||
      /^(?:feat|fix|chore|ci|docs|test|refactor)(?:\(.+\))?:/i.test(item.title) ||
      /[.!?]$/.test(item.title)) {
      throw new Error(item.id + ': update copy does not meet Dana editorial rules')
    }
    previousDate = item.publishedAt
  }
  return input
}

export function currentUpdates() {
  return checkUpdates(JSON.parse(readFileSync(source, 'utf8')))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const feed = currentUpdates()
    console.log('Verified ' + feed.entries.length + ' public update entries.')
  } catch (error) {
    console.error(String(error))
    process.exitCode = 1
  }
}
