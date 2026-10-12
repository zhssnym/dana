import { describe, expect, it } from 'vitest'
import { resolveBreadcrumbLocation } from './breadcrumb-location.js'

const root = { id: 'project', project_id: 'project', kind: 'work' as const, tab_position: 'a' }
const tab = { id: 'announcement', project_id: 'project', kind: 'doc' as const, tab_position: 'b' }
const nested = { id: 'nested', project_id: 'project', kind: 'doc' as const, tab_position: null }

describe('primary screen breadcrumb location (#622)', () => {
  it('includes the project root and its virtual Work tab label', () => {
    expect(resolveBreadcrumbLocation({ pathname: '/app/folders/project', search: '', page: root })).toEqual({
      folderId: 'project', current: 'Work',
    })
  })

  it('uses the selected stored tab, not its project, for a horizontal page tab', () => {
    expect(resolveBreadcrumbLocation({ pathname: '/app/folders/announcement', search: '', page: tab })).toEqual({
      folderId: 'announcement',
    })
    expect(resolveBreadcrumbLocation({ pathname: '/app/folders/nested', search: '', page: nested })).toEqual({
      folderId: 'nested',
    })
  })

  it('does not guess private or missing page ancestry', () => {
    expect(resolveBreadcrumbLocation({ pathname: '/app/folders/hidden', search: '' })).toBeNull()
  })

  it('keeps Work as the location when Team is merely a side panel', () => {
    expect(resolveBreadcrumbLocation({
      pathname: '/app/folders/project', search: '?member=teammate', page: root,
    })).toEqual({ folderId: 'project', current: 'Work' })
  })

  it('uses the project, Team, and teammate in full-screen mode', () => {
    expect(resolveBreadcrumbLocation({
      pathname: '/app/folders/announcement',
      search: '?team=full&member=teammate',
      page: tab,
      team: { members: [{ user: { id: 'teammate', display_name: 'Hassan' } }] },
    })).toEqual({
      folderId: 'project',
      extra: [
        { name: 'Team', to: '/app/folders/announcement?team=full' },
        { name: 'Hassan' },
      ],
    })
  })

  it('uses a canonical Discussion hierarchy for the list and open thread', () => {
    const page = { ...tab, kind: 'discussion' as const }
    expect(resolveBreadcrumbLocation({
      pathname: '/app/folders/announcement', search: '', page,
    })).toEqual({ folderId: 'project', extra: [{ name: 'Discussion' }], mobileThread: false })
    expect(resolveBreadcrumbLocation({
      pathname: '/app/folders/announcement', search: '?discussion=thread', page,
      discussion: { title: 'Research updates' },
    })).toEqual({
      folderId: 'project',
      extra: [
        { name: 'Discussion', to: '/app/folders/announcement' },
        { name: 'Research updates' },
      ],
      mobileThread: true,
    })
  })

  it('shows the owning page for a Task, regardless of where it was opened', () => {
    expect(resolveBreadcrumbLocation({
      pathname: '/app/tasks/task', search: '',
      task: { title: 'Send notes', folder: { id: 'announcement' } },
    })).toEqual({ folderId: 'announcement', current: 'Send notes' })
  })

  it('supports standalone places, collections, and Settings subpages', () => {
    expect(resolveBreadcrumbLocation({ pathname: '/app/today', search: '' })).toEqual({
      folderId: null, current: 'Today',
    })
    expect(resolveBreadcrumbLocation({ pathname: '/app/lists/important', search: '' })).toEqual({
      folderId: null, current: 'Important',
    })
    expect(resolveBreadcrumbLocation({
      pathname: '/app/shelves/shelf', search: '', shelf: { name: 'Reference materials' },
    })).toEqual({ folderId: null, current: 'Reference materials' })
    expect(resolveBreadcrumbLocation({ pathname: '/app/settings/archived-work', search: '' })).toEqual({
      folderId: null,
      extra: [{ name: 'Settings', to: '/app/settings' }, { name: 'Archived work' }],
    })
    expect(resolveBreadcrumbLocation({ pathname: '/app/unknown', search: '' })).toEqual({
      folderId: null, current: 'Not found',
    })
  })
})
