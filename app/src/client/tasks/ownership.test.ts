/*
The ownership boundary of issue #86's task-module slice.

The browser criteria prove the actions and editor path. These source-level
checks prove the path-only refactor itself: the task model, mapping, writer,
shared acts and expanded-detail read live together; their former `lib/`
addresses cannot return; the move adds no runtime cycle; and the browser keys
visible anywhere in this client stay byte-for-byte stable.
*/
import * as ts from 'typescript'
import { describe, expect, test } from 'vitest'

const modules = import.meta.glob('/src/client/**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const sources = Object.fromEntries(
  Object.entries(modules)
    .map(([path, source]) => [path.replace('/src/client/', ''), source] as const)
    .filter(([path]) => !/\.test\.tsx?$/.test(path)),
)
const files = Object.keys(sources).sort()

interface ImportEdge {
  readonly importer: string
  readonly specifier: string
  readonly runtime: boolean
}

function isRuntimeImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause
  if (clause === undefined) return true
  if (clause.isTypeOnly) return false
  if (clause.name !== undefined) return true
  if (clause.namedBindings === undefined || ts.isNamespaceImport(clause.namedBindings)) return true
  return clause.namedBindings.elements.some((element) => !element.isTypeOnly)
}

function isRuntimeExport(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return false
  if (node.exportClause === undefined || ts.isNamespaceExport(node.exportClause)) return true
  return node.exportClause.elements.some((element) => !element.isTypeOnly)
}

function importsIn(importer: string, source: string): ImportEdge[] {
  const kind = importer.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const file = ts.createSourceFile(importer, source, ts.ScriptTarget.Latest, true, kind)
  const imports: ImportEdge[] = []
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      imports.push({
        importer,
        specifier: statement.moduleSpecifier.text,
        runtime: isRuntimeImport(statement),
      })
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      imports.push({
        importer,
        specifier: statement.moduleSpecifier.text,
        runtime: isRuntimeExport(statement),
      })
    }
  }
  return imports
}

const imports = files.flatMap((path) => importsIn(path, sources[path] ?? ''))

function normalize(path: string): string {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return parts.join('/')
}

function importTarget(importer: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null
  const directory = importer.split('/').slice(0, -1).join('/')
  const stem = normalize(`${directory}/${specifier}`).replace(/\.js$/, '')
  return [`${stem}.ts`, `${stem}.tsx`, `${stem}/index.ts`, `${stem}/index.tsx`].find(
    (candidate) => candidate in sources,
  ) ?? null
}

const runtimeGraph = Object.fromEntries(
  files.map((path) => [
    path,
    imports
      .filter((edge) => edge.importer === path && edge.runtime)
      .map((edge) => importTarget(path, edge.specifier))
      .filter((target): target is string => target !== null),
  ]),
) as Record<string, string[]>

function cycleFrom(start: string): string[] | null {
  const done = new Set<string>()
  const active = new Map<string, number>()
  const path: string[] = []

  function visit(current: string): string[] | null {
    const first = active.get(current)
    if (first !== undefined) return [...path.slice(first), current]
    if (done.has(current)) return null
    active.set(current, path.length)
    path.push(current)
    for (const dependency of runtimeGraph[current] ?? []) {
      const cycle = visit(dependency)
      if (cycle !== null) return cycle
    }
    path.pop()
    active.delete(current)
    done.add(current)
    return null
  }

  return visit(start)
}

describe('task module ownership', () => {
  const taskModules = [
    'tasks/row-detail.ts',
    'tasks/task-acts.ts',
    'tasks/task-concept.ts',
    'tasks/task-model.ts',
    'tasks/task-writer.tsx',
  ]

  test('the task feature owns the complete bounded module set', () => {
    expect(files.filter((path) => path.startsWith('tasks/'))).toEqual(taskModules)
  })

  test('no production import points to a former lib address', () => {
    const former = imports
      .map((edge) => {
        if (!edge.specifier.startsWith('.')) return null
        const directory = edge.importer.split('/').slice(0, -1).join('/')
        return normalize(`${directory}/${edge.specifier}`).replace(/\.js$/, '')
      })
      .filter((target): target is string => target !== null)
      .filter((target) => /^lib\/(?:row-detail|task-(?:acts|concept|model|writer))$/.test(target))
    expect(former).toEqual([])
  })

  test('the task-owned runtime graph is acyclic', () => {
    for (const module of taskModules) expect(cycleFrom(module)).toBeNull()
  })

  test('remaining lib modules gain no generic dependency on the task feature', () => {
    const importers = imports
      .map((edge) => {
        const target = importTarget(edge.importer, edge.specifier)
        return target?.startsWith('tasks/') === true && edge.importer.startsWith('lib/')
          ? `${edge.importer} -> ${target}`
          : null
      })
      .filter((edge): edge is string => edge !== null)
      .sort()

    /* These two pre-existing edges are task-facing adapters: the assignee
       roster maps a person for a task, while a thread supplies the comment
       types a task surface renders. Neither is a generic helper. */
    expect(importers).toEqual([
      'lib/people-library.ts -> tasks/task-concept.ts',
      'lib/people-library.ts -> tasks/task-model.ts',
      'lib/thread.ts -> tasks/task-model.ts',
    ])
  })

  test('all browser-storage key literals remain byte-for-byte unchanged', () => {
    const keys: string[] = []
    for (const path of files) {
      const source = sources[path] ?? ''
      if (!/(?:localStorage|sessionStorage)/.test(source)) continue
      const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind)
      function visit(node: ts.Node): void {
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          /(?:^KEY$|KEY(?:_PREFIX)?$)/.test(node.name.text) &&
          node.initializer !== undefined &&
          ts.isStringLiteral(node.initializer) &&
          node.initializer.text.startsWith('dana')
        ) {
          keys.push(`${path}:${node.name.text}=${node.initializer.text}`)
        }
        ts.forEachChild(node, visit)
      }
      visit(file)
    }

    expect(keys.sort()).toEqual(
      [
        'components/task-surface.tsx:DIALOG_KEY=dana.taskDialogWidth',
        'components/task-surface.tsx:PANEL_KEY=dana.taskPanelWidth',
        'lib/calendar-zoom.ts:CALENDAR_ZOOM_KEY=dana.calendarZoom',
        'lib/task-surface-preference.ts:KEY=dana.taskSurface',
        'lib/theme.ts:THEME_STORAGE_KEY=dana:theme',
        'lib/time-format.ts:KEY=dana.timeFormat',
        'onboarding/StarterOffer.tsx:DISMISSED_KEY=dana.starters.dismissed',
        'onboarding/sample.ts:KEPT_KEY=dana.sample.kept',
        'pages/FolderPage.tsx:CONVERSATION_HOME_KEY=dana.conversation.home',
        'shell/app-sidebar.tsx:MORE_OPEN_KEY=dana.sidebar.more-open',
        'shell/app-sidebar.tsx:SHELF_FOLD_KEY=dana.sidebar.shelf-collapsed:',
        'shell/preferences.ts:COLLAPSED_KEY=dana.sidebar-collapsed',
        'shell/preferences.ts:WIDTH_KEY=dana.sidebar-width',
        'views/filter-store.ts:KEY_PREFIX=dana.filter.',
        'views/view-mode.ts:MODE_KEY=dana.view-mode',
      ].sort(),
    )
  })
})
