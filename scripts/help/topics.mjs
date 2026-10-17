// Match current code areas to reader-facing guides. A match flags an article for inspection;
// it does not prove that a PR changed the documented behavior.
export const TOPICS = [
  { slug: 'how-dana-works', paths: ['src/client/pages/LandingPage.tsx', 'src/server/auth/', 'src/client/pages/FolderPage.tsx', 'src/client/shell/page-tree.ts', 'src/server/domain/page-tree.ts', 'src/shared/folders.ts', 'src/client/components/page/facet', 'src/server/domain/facet'] },
  { slug: 'tasks-and-dates', paths: ['src/client/components/task-', 'src/client/pages/TaskPage.tsx', 'src/server/domain/tasks.ts', 'src/server/routes/tasks.ts', 'src/shared/tasks.ts', 'src/server/time/', 'src/client/pages/TodayPage.tsx', 'src/client/pages/ScheduledPage.tsx', 'src/client/pages/AssignmentsPage.tsx', 'src/server/views/cards.ts'] },
  { slug: 'views', paths: ['src/client/views/', 'src/client/pages/folder-page/', 'src/client/components/board-', 'src/client/components/calendar-', 'src/server/views/calendar.ts'] },
  { slug: 'writing', paths: ['src/client/components/page/canvas/', 'src/shared/page-document.ts', 'src/server/domain/page-document.ts', 'src/server/domain/synced-block', 'src/server/routes/synced-block'] },
  { slug: 'working-together', paths: ['src/client/components/settings/people.tsx', 'src/client/pages/FolderSharingPanel.tsx', 'src/shared/folder-actions.ts', 'src/server/routes/invites.ts', 'src/client/components/team-', 'src/client/components/teammate-', 'src/client/components/person-', 'src/server/domain/teammate-', 'src/client/components/discussion-', 'src/client/components/direct-message', 'src/server/routes/consultation', 'src/server/routes/direct-messages', 'src/shared/consultation.ts'] },
  { slug: 'find-and-shortcuts', paths: ['src/client/routes.ts', 'src/client/components/search-overlay.tsx', 'src/client/lib/search-items.ts', 'src/client/shell/sidebar/', 'src/client/help/shortcuts.ts', 'src/client/components/help-sheet.tsx', 'src/client/shell/overlays.ts'] },
  { slug: 'account-and-data', paths: ['src/client/components/settings-page-content.tsx', 'src/client/pages/SettingsPage.tsx', 'src/server/routes/export.ts', 'src/server/auth/router.ts', 'src/client/pages/ArchivedWorkPage.tsx', 'src/client/api/archive.ts', 'src/server/domain/archive.ts', 'src/client/pwa/', 'src/client/components/state-patterns.tsx', 'src/client/pages/NotFoundPage.tsx', 'src/client/components/feedback/', 'src/server/routes/feedback.ts'] },
]

const SOURCE_AREAS = ['src/client/', 'src/shared/', 'src/server/domain/', 'src/server/views/', 'src/server/routes/']

export function impactedHelp(changedPaths) {
  const codePaths = changedPaths.filter((p) => /\.[jt]sx?$/.test(p) && SOURCE_AREAS.some((prefix) => p.startsWith(prefix)) && !/\.test\.[jt]sx?$/.test(p))
  const slugs = TOPICS.filter((topic) => topic.paths.some((prefix) => codePaths.some((path) => path === prefix || path.startsWith(prefix)))).map((topic) => topic.slug)
  const matched = codePaths.filter((path) => TOPICS.some((topic) => topic.paths.some((prefix) => path === prefix || path.startsWith(prefix))))
  return {
    slugs,
    unmatched: codePaths.filter((path) => !matched.includes(path)),
    changedTests: changedPaths.filter((p) => p.startsWith('tests/') || /\.test\.[jt]sx?$/.test(p)),
    codePaths,
  }
}
