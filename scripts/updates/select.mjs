const RELEASE_LABELS = {
  include: new Set(['updates:include', 'release:include']),
  exclude: new Set(['updates:skip', 'release:skip']),
}

const INTERNAL_TITLE = /\b(ci|pipeline|workflow|dependency|dependencies|migration|schema|postgres|database|refactor|lint|typescript|test(?:s|ing)?|build configuration|internal|backend|github actions)\b/i
const INTERNAL_TEXT = /\b(ci|pipeline|postgres|database|migration|schema|npm|eslint|typescript|unit test|e2e|playwright|refactor|internal|backend|github action|api endpoint|commit hash|webhook)\b/i
const FILLER = /\b(seamless(?:ly)?|effortless(?:ly)?|unlock|empower|revolutionary|game.changing|powerful|robust)\b/i
const CODE = /^(?:src\/|docs\/|db\/|\.github\/|scripts\/)/

export function plainCopy(text) {
  return String(text ?? '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\x60([^\x60]+)\x60/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tidyTitle(value) {
  const title = plainCopy(value)
    .replace(/^(?:feat|fix|perf|improvement)(?:\([^)]+\))?:\s*/i, '')
    .replace(/\s*\(#\d+\)\s*$/, '')
    .replace(/[.!?]+$/, '')
  if (!title) return ''
  return title.charAt(0).toUpperCase() + title.slice(1)
}

function summaryFrom(body, title) {
  const bullets = String(body ?? '').split(/\r?\n/)
    .filter((line) => /^\s*-\s+/.test(line))
    .map((line) => plainCopy(line.replace(/^\s*-\s+/, '')))
  for (const candidate of bullets) {
    if (!candidate || CODE.test(candidate) || INTERNAL_TEXT.test(candidate) || FILLER.test(candidate)) continue
    const firstSentence = /^(.{40,225}?[.!?])(?:\s|$)/.exec(candidate)?.[1]
    const line = firstSentence ?? candidate
    if (line.length < 40 || line.length > 220 || line.toLocaleLowerCase() === title.toLocaleLowerCase()) continue
    if (/[{}<>\n]|\bTODO\b|\bFIXME\b|\bWIP\b/.test(line)) continue
    return /[.!?]$/.test(line) ? line : line + '.'
  }
  return null
}

function userFacingFiles(files) {
  return files.some((file) => {
    const path = typeof file === 'string' ? file : file.filename
    if (!path || /\.(test|spec)\.[jt]sx?$/.test(path)) return false
    return path.startsWith('src/client/') && /\.(ts|tsx|css)$/.test(path)
  })
}

export function classifyPR(pr, files) {
  const labels = (pr.labels ?? []).map((label) => String(label.name ?? label).toLowerCase())
  const forced = labels.some((label) => RELEASE_LABELS.include.has(label))
  if (labels.some((label) => RELEASE_LABELS.exclude.has(label))) return { status: 'skip', reason: 'Release label excludes this change' }

  const rawTitle = String(pr.title ?? '')
  const conventional = /^(feat|fix|perf|docs|chore|test|ci|build|refactor)(?:\([^)]+\))?:/i.exec(rawTitle)?.[1]?.toLowerCase()
  if (!forced && ['docs', 'chore', 'test', 'ci', 'build', 'refactor'].includes(conventional ?? '')) {
    return { status: 'skip', reason: 'Internal change type' }
  }
  if (!forced && (INTERNAL_TITLE.test(rawTitle) || !userFacingFiles(files))) {
    return { status: 'skip', reason: 'No identified user-facing product change' }
  }
  const title = tidyTitle(rawTitle)
  if (title.length < 12 || title.length > 95 || FILLER.test(title) || /[<>]/.test(title)) {
    return { status: 'review', reason: 'The change title is unclear to users' }
  }
  const summary = summaryFrom(pr.body, title)
  if (!summary) return { status: 'review', reason: 'The PR does not explain a specific user-facing effect clearly enough' }
  return {
    status: 'include',
    kind: conventional === 'fix' ? 'fix' : conventional === 'feat' ? 'feature' : 'improvement',
    title,
    summary,
  }
}
