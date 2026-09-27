/*
A Focus list the viewer added, at /app/lists/<key> (round 8): Important,
Overdue, No date or All open. Each is a saved filter over the open tasks of
every page (GET /views/focus), drawn with the place-page parts every list uses:
the same rows and keyboard path. Its head carries the list's own identity,
mark and cover (#353, #355). No View menu (M4): no board, grouping, sort or
"Show completed". No "New task" row: a filter such as Overdue has no value a
new task could carry to land in it.
*/
import { Navigate, useParams } from 'react-router'

import { useFocusView, useMultiMemberFolderIds } from '../api/queries.js'
import { PageBody } from '../components/page/PageStates.js'
import { useRowKeys } from '../components/row-keys.js'
import { useRowActions } from '../parts/useRowActions.js'
import { paths } from '../routes.js'
import {
  FOCUS_ASKS,
  FOCUS_EMPTY,
  focusIdentityKey,
  focusList,
  isFocusKey,
  useNoStoredLabel,
} from '../shell/focus-lists.js'
import type { FocusListKey } from '../shell/focus-lists.js'
import type { FocusAsk } from '../api/queries.js'
import { PLACES } from '../views/place-pages.js'
import { PlaceGroup, PlaceHead, usePlace } from '../views/usePlace.js'
import { ConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'

export function FocusListPage(): React.JSX.Element {
  const { list } = useParams()
  /* The defaults have their own pages; an unknown key is an old address. */
  const ask = isFocusKey(list) ? FOCUS_ASKS[list] : undefined
  if (!isFocusKey(list) || ask === undefined) {
    return <Navigate to={paths.today} replace />
  }
  return <FocusList key={list} listKey={list} ask={ask} />
}

function FocusList({
  listKey,
  ask,
}: {
  readonly listKey: FocusListKey
  readonly ask: FocusAsk
}): React.JSX.Element {
  const list = focusList(listKey)
  const spine = { ...PLACES.focus, name: list.name, path: list.path, icon: list.icon }
  const view = useFocusView(ask)
  const actions = useRowActions()
  const confirm = useConfirm()
  const basis = useRowBasis()
  const keys = useRowKeys<HTMLDivElement>()
  const multiMemberFolderIds = useMultiMemberFolderIds()

  const data = view.data
  const rows = (data?.groups ?? []).flatMap((group) => group.rows)
  const place = usePlace(spine, rows, { filterKey: `focus-${listKey}` })
  useNoStoredLabel(place)
  const context = { ...basis, multiMemberFolderIds }

  return (
    <div ref={keys} className="space-y-6">
      <PlaceHead
        place={place}
        controls={null}
        identityKey={focusIdentityKey(listKey)}
        focusKey={listKey}
      />
      <div className="-mx-1.5">
        <PageBody
          query={view}
          isEmpty={rows.length === 0}
          emptyCopy={FOCUS_EMPTY[listKey] ?? ''}
          emptyIcon={list.icon}
          truncated={data?.truncated ?? false}
        >
          <PlaceGroup name={list.name}>
            <TaskRows tasks={rows} context={context} actions={actions} onAsk={confirm.ask} />
          </PlaceGroup>
        </PageBody>
      </div>
      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </div>
  )
}
