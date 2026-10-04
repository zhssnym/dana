/*
Team collaboration surface for the project header (#554).

Team has two presentations over the same membership, invite and access data:
a resizable sidebar that leaves the Work visible, and a full-page presentation
for focused management. Switching presentation never remounts a second Team
model, so member details, invite input and permissions stay in the same state.
The presentation itself belongs to the active workspace tab (#569), while the
selected member remains canonical URL state (`?member=`), which workspace tabs
already preserve as part of their exact path.

The field suggests connections who are not yet members. Invite always sends a
page invite by address, picked connection or typed address alike: the server
turns an invite to a connected address into an instant share (7.5), and the
invite names its Access, which `POST /folders/:id/members` requires and
`useAddFolderMember` does not send.

Every gate here (`mayAdd`, `mayInvite`, `mayRemove`, from `lib/folder-authority`)
only hides a control the server would refuse anyway (5.3, 5.4, 7.11). A member's
Access is a picker on their row, and Remove sits under its presets rather than
as a button on every row; the owner's row has neither. A member's line says what they may do (their
Access), which is what an owner needs, not when they joined. Resend is shown
only once it is allowed (24 hours after the last send); the server's 429 is the
rule (r7: a disabled Resend was a dead control most of the time it was seen). The folder detail and
the roster arrive as props from `FolderPage`. A member's name opens their details
in the same surface (`MemberDetails`, #209), which reads that one member itself.

The region keeps 9.1's "Sharing panel" accessible name for its existing shell
contract; the visible surface is Team. Full-page Team uses a small route marker
so the browser-history arrows can move between the Work+sidebar state and Team
focus without creating a second workspace tab.
*/
import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'

import type { GetConnectionsResponse } from '../../shared/connections.js'
import { FOLDER_ACCESS_LABELS } from '../../shared/folder-access.js'
import type { FolderAccessPreset } from '../../shared/folder-access.js'
import type { GetFolderResponse } from '../../shared/folders.js'
import { DEFAULT_INVITE_ACCESS, folderInviteBody } from '../api/folder-invite.js'
import {
  useCancelInvite,
  useCreateInvite,
  useRemoveFolderMember,
  useResendInvite,
} from '../api/mutations.js'
import { Avatar, AvatarFallback } from '../components/ui/avatar.js'
import { ContextPageHeader } from '../components/context-page-header.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet.js'
import { cn } from '../components/ui/utils.js'
import { useReserveRightEdge } from '../components/right-edge.js'
import { mayDraw } from '../lib/folder-authority.js'
import type { FolderViewerFacts } from '../lib/folder-authority.js'
import { ChevronDown, Maximize2, PanelRight, UsersRound } from '../lib/icons.js'
import { formatRelativeDay } from '../parts/format-dates.js'
import { initialsOf, presenterToday } from '../parts/presenters.js'
import {
  DOCK_DEFAULT_WIDTH,
  dockWidthBounds,
  setChatDockWidth,
  useChatDockWidth,
} from '../state/chat-dock.js'
import { useTeamPresentation } from '../state/collaboration.js'
import { PersonFace } from '../components/person-face.js'
import { AccessMenu, InviteAccessPicker, MemberDetails } from './MemberDetails.js'
import { ConfirmDialog, useConfirm } from './task-rows.js'

/** 9.1's sections table for this page. */
const SHARING_PANEL = 'Sharing panel'

/** 9.6: the one field's label and placeholder. */
const NAME_OR_EMAIL = 'Name or email'

const DAY_MS = 24 * 60 * 60 * 1000
const TEAM_VIEW_PARAM = 'team'
const TEAM_FULL_VALUE = 'full'

/** Whether 5.2's resend window has passed, read off the invite itself. */
function resendable(lastSentAt: string): boolean {
  return Date.now() - Date.parse(lastSentAt) >= DAY_MS
}

/**
 * The confirm before removing a member, 9.6's own sentence, in one element:
 * AC-183 asserts it as a single text run.
 */
function removeMemberConfirm(who: string, folder: string): string {
  return (
    `Remove ${who} from ${folder}? They lose access, and anything in this ` +
    'page assigned to them becomes unassigned.'
  )
}

/** The address parameter naming the member whose details are open. */
export const MEMBER_PARAM = 'member'

/** Whether a dismissing event came from the top bar's back arrow: a press
 * on it, or focus moving to it (the sheet closes on focus-out). */
function pressedHistoryBack(event: Event): boolean {
  const target = event instanceof FocusEvent ? event.relatedTarget : event.target
  return target instanceof Element && target.closest('[data-history-back]') !== null
}

/**
 * Workspace-tab controls live outside this non-modal Sheet. They must switch
 * which tab is active without first dismissing and mutating the Team state on
 * the tab being left. History arrows are the same kind of workspace navigation:
 * Back/Forward changes the Team presentation route and must not dismiss Team
 * before the router gets to apply that history entry. The open-tab picker is
 * portaled, so its trigger, search input and result list are named explicitly.
 */
function workspaceTabInteraction(event: Event): boolean {
  const target = event instanceof FocusEvent ? event.relatedTarget : event.target
  return (
    target instanceof Element &&
    target.closest(
      '[role="tab"], [aria-label="Open tab"], [aria-label="Search Dana to open a tab"], [aria-label="Go back"], [aria-label="Go forward"], #dana-open-tab-results',
    ) !== null
  )
}

function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = (): void => { setWidth(window.innerWidth) }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize) }
  }, [])
  return width
}

interface WorkspaceRect {
  readonly top: number
  readonly left: number
  readonly width: number
  readonly height: number
}

/**
 * A full Team surface is portaled to `body`, so it cannot inherit the sidebar
 * wrapper's width custom property. Measure the actual workspace instead: this
 * follows a resized/collapsed app sidebar and the shell's own responsive layout
 * without duplicating any of those widths here.
 */
function useWorkspaceRect(): WorkspaceRect | null {
  const [rect, setRect] = useState<WorkspaceRect | null>(null)
  useEffect(() => {
    const node = document.getElementById('dana-content')
    if (node === null) return undefined
    let frame = 0
    const measure = (): void => {
      const box = node.getBoundingClientRect()
      setRect({ top: box.top, left: box.left, width: box.width, height: box.height })
    }
    const schedule = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    observer?.observe(node)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [])
  return rect
}

const ROW =
  'flex min-h-[var(--row-height)] items-center gap-[var(--space-inline)] rounded-md px-2 py-1'

export function FolderSharingPanel({
  folder,
  projectName,
  connections,
  viewer,
  viewerId,
  onClose,
  onTransfer,
}: {
  readonly folder: GetFolderResponse
  /** Step 8: people belong to the project, so the panel is the project's,
   * whichever page opened it. Absent means `folder` is the project. */
  readonly projectName?: string
  /** 7.3's roster, which the suggestions are built from. Absent while it loads. */
  readonly connections: GetConnectionsResponse | undefined
  /** The viewer's own Access facts (issue #228). Null while unknown, which
   * withholds the administrative controls rather than flashing them. */
  readonly viewer: FolderViewerFacts | null
  /** Who is looking: their own row is marked, and never offers Remove
   * (leaving is the page menu's Leave project…). */
  readonly viewerId: string | null
  readonly onClose: () => void
  /** The owner's hand-on, offered only where the viewer may (M4: from the "…"). */
  readonly onTransfer?: () => void
}): React.JSX.Element {
  const mayRemove = viewer !== null && mayDraw(viewer, 'member.remove')
  /* The server's own rule for its viewer_may_change_access, minus the owner
     row, which never draws the picker. */
  const mayChange = viewer !== null && mayDraw(viewer, 'member.access.change')
  const mayAdd = viewer !== null && mayDraw(viewer, 'member.add')
  const mayInvite = viewer !== null && mayDraw(viewer, 'invite.create')
  const removeMember = useRemoveFolderMember()
  const invite = useCreateInvite()
  const cancel = useCancelInvite()
  const resend = useResendInvite()
  const confirm = useConfirm()
  const listId = useId()
  const [text, setText] = useState('')
  const [inviteAccess, setInviteAccess] = useState<FolderAccessPreset>(DEFAULT_INVITE_ACCESS)
  const [pickedEmail, setPickedEmail] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [view, setView] = useTeamPresentation(folder.id)
  const surface = useRef<HTMLElement | null>(null)
  /* The member whose details replace the lists (#209), or null for the lists.
     It lives in the address (?member=) and opening one pushes an entry, so
     the top bar's back arrow returns to the lists rather than leaving the page. */
  const [search, setSearch] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const openMember = search.get(MEMBER_PARAM)
  const memberPushed = (location.state as { memberPushed?: boolean } | null)?.memberPushed === true
  const routeFullPage = search.get(TEAM_VIEW_PARAM) === TEAM_FULL_VALUE
  const windowWidth = useWindowWidth()
  const workspaceRect = useWorkspaceRect()
  const chosenWidth = useChatDockWidth()
  const bounds = dockWidthBounds(windowWidth)
  const teamMinWidth = Math.min(bounds.max, Math.max(bounds.min, DOCK_DEFAULT_WIDTH))
  const sidebarWidth = Math.min(bounds.max, Math.max(teamMinWidth, chosenWidth))
  const fullPage = view === 'full'
  const SectionHeading = fullPage ? 'h2' : 'h3'

  useReserveRightEdge(sidebarWidth, !fullPage)

  const setOpenMember = (id: string | null): void => {
    if (id !== null) {
      setSearch(
        (current) => {
          const next = new URLSearchParams(current)
          next.set(MEMBER_PARAM, id)
          return next
        },
        { state: { memberPushed: true } },
      )
    } else if (memberPushed) {
      void navigate(-1)
    } else {
      setSearch(
        (current) => {
          const next = new URLSearchParams(current)
          next.delete(MEMBER_PARAM)
          return next
        },
        { replace: true },
      )
    }
  }

  /* Browser Back/Forward is a first-class presentation control. Expanding
     pushes `?team=full`; a POP back to the Work route restores the sidebar and
     Forward returns to full page, all inside the same workspace tab. The route
     is canonical for the presentation so a click only changes the URL; this
     effect is the one place that applies that URL to tab-local Team state. */
  useEffect(() => {
    if (routeFullPage === fullPage) return
    setView(routeFullPage ? 'full' : 'sidebar')
  }, [routeFullPage, fullPage, setView])

  /* Moving between Team presentations keeps the same component and state;
     focus follows the surface so keyboard interaction never stays behind it. */
  useEffect(() => {
    surface.current?.focus({ preventScroll: true })
  }, [view])

  /* Leaving a member's details puts focus back on that member's row. */
  const lastMember = useRef<string | null>(null)
  useEffect(() => {
    if (openMember !== null) {
      lastMember.current = openMember
      return
    }
    const id = lastMember.current
    lastMember.current = null
    if (id === null) return
    document.querySelector<HTMLElement>(`[data-member-row="${CSS.escape(id)}"]`)?.focus()
  }, [openMember])

  const memberIds = new Set(folder.members.map((member) => member.user.id))
  const invitable = (connections ?? []).filter((entry) => !memberIds.has(entry.user.id))

  const query = text.trim().toLowerCase()
  const suggestions =
    mayAdd && pickedEmail === null && query !== ''
      ? invitable.filter(
          (entry) =>
            (entry.user.display_name ?? '').toLowerCase().includes(query) ||
            entry.user.email.toLowerCase().includes(query),
        )
      : []
  const showList = open && suggestions.length > 0

  /* What pressing Invite does right now, or null for nothing. */
  const exact = invitable.find((entry) => entry.user.email.toLowerCase() === query)
  const target: string | null =
    mayAdd && pickedEmail !== null
      ? pickedEmail
      : mayAdd && exact !== undefined
        ? exact.user.email
        : mayInvite && query.includes('@')
          ? text.trim()
          : null
  const pending = invite.isPending

  function pick(index: number): void {
    const entry = suggestions[index]
    if (entry === undefined) return
    setText(entry.user.display_name ?? entry.user.email)
    setPickedEmail(entry.user.email)
    setOpen(false)
    setActive(-1)
  }

  function submit(): void {
    if (target === null || pending) return
    setText('')
    setPickedEmail(null)
    setOpen(false)
    setActive(-1)
    // A page invite must name its Access; folderInviteBody says which.
    invite.mutate(folderInviteBody(target, folder.id, inviteAccess))
    // Each invite starts from the default again, so a Full control pick
    // never carries over to the next person unasked.
    setInviteAccess(DEFAULT_INVITE_ACCESS)
  }

  /* Remove someone else, after 9.6's confirm; `after` runs once confirmed. */
  function askRemove(userId: string, name: string, after?: () => void): void {
    confirm.ask(
      removeMemberConfirm(name, projectName ?? folder.name),
      () => {
        removeMember.mutate({ folderId: folder.id, userId })
        after?.()
      },
      { confirmLabel: 'Remove', cancelLabel: 'Cancel' },
    )
  }
  const mayShare = mayAdd || mayInvite
  const shared = projectName ?? folder.name
  const openMemberName =
    openMember === null
      ? null
      : folder.members.find((member) => member.user.id === openMember)?.user.display_name ?? 'Someone'
  const viewLabel = fullPage ? 'Open in side panel' : 'Open full page'

  const changePresentation = (): void => {
    if (fullPage) {
      setSearch((current) => {
        const next = new URLSearchParams(current)
        next.delete(TEAM_VIEW_PARAM)
        return next
      }, { replace: true })
      return
    }
    setSearch((current) => {
      const next = new URLSearchParams(current)
      next.set(TEAM_VIEW_PARAM, TEAM_FULL_VALUE)
      return next
    })
  }

  const clearTeamRoute = (): void => {
    if (!search.has(TEAM_VIEW_PARAM)) return
    setSearch((current) => {
      const next = new URLSearchParams(current)
      next.delete(TEAM_VIEW_PARAM)
      return next
    }, { replace: true })
  }

  const desktopFull = fullPage && windowWidth >= 768
  const fullPageStyle: React.CSSProperties = desktopFull
    ? workspaceRect === null
      ? {
          top: 0,
          left: 0,
          width: '100vw',
          maxWidth: 'none',
          height: '100dvh',
          visibility: 'hidden',
        }
      : {
          top: `${String(workspaceRect.top)}px`,
          bottom: 'auto',
          left: `${String(workspaceRect.left)}px`,
          right: 'auto',
          width: `${String(workspaceRect.width)}px`,
          maxWidth: 'none',
          height: `${String(workspaceRect.height)}px`,
        }
    : {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: '100vw',
        maxWidth: '100vw',
        height: '100dvh',
      }

  return (
    <>
    <Sheet
      open
      onOpenChange={(next, details) => {
        /* Workspace-tab/history navigation hides or retargets Team through the
           owning tab. Do not dismiss and mutate Team before that navigation. */
        if (!next && workspaceTabInteraction(details.event)) {
          details.cancel()
          return
        }
        /* A press inside the confirm reads as outside this non-modal sheet;
           Team stays open under it, whichever the answer. */
        /* The top bar's back arrow, pressed with a member open, pops that
           member's entry: the sheet stays, showing the lists again. */
        if (
          !next &&
          openMember !== null &&
          pressedHistoryBack(details.event)
        ) {
          details.cancel()
          return
        }
        if (!next && confirm.pending === null) {
          if (openMember !== null) setOpenMember(null)
          clearTeamRoute()
          onClose()
        }
      }}
      /* Non-modal: Work remains usable beside the sidebar. Full page still uses
         the same root/state, but is sized to the current workspace content
         below the desktop tab strip instead of becoming a second tab. */
      modal={false}
    >
      <SheetContent
        side="right"
        showCloseButton={!fullPage}
        className={cn(
          'sm:max-w-none transition-[width,max-width,left,top,height] motion-reduce:transition-none',
          fullPage ? 'border-l-0 shadow-none' : 'w-[var(--sharing-panel-width)]',
        )}
        style={fullPage ? { ...fullPageStyle, backgroundColor: 'var(--background)' } : {
          width: `${String(sidebarWidth)}px`,
          maxWidth: `${String(sidebarWidth)}px`,
        }}
        overlayClassName="hidden"
      >
        {fullPage ? null : (
          <TeamResizeEdge width={sidebarWidth} min={teamMinWidth} max={bounds.max} />
        )}
        <section
          ref={surface}
          aria-label={SHARING_PANEL}
          tabIndex={-1}
          className="flex min-h-0 flex-1 flex-col outline-none"
        >
          {fullPage ? (
            <div className="shrink-0 pt-5 md:pt-6">
              <div className="mx-auto w-full max-w-[var(--shell-content-max)] px-4 md:px-10">
                <ContextPageHeader
                  parent={shared}
                  title="Team"
                  icon={UsersRound}
                  heading={(
                    <SheetTitle render={<h1 />} className="truncate text-[length:var(--text-title-size)] leading-[var(--text-title-line)] font-title">Team</SheetTitle>
                  )}
                  onBack={changePresentation}
                  actions={(
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Open in side panel"
                      title="Open in side panel"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={changePresentation}
                    >
                      <PanelRight className="size-4" strokeWidth={1.75} aria-hidden="true" />
                    </Button>
                  )}
                />
              </div>
            </div>
          ) : (
          <SheetHeader className="h-12 shrink-0 flex-row items-center gap-2 border-b border-border px-3 py-0 pr-14">
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-foreground"
            >
              <UsersRound className="size-4" strokeWidth={1.75} />
            </span>
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <SheetTitle className="shrink-0 text-sm font-title">Team</SheetTitle>
              {openMember === null ? (
                <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={shared}>
                  {shared}
                </p>
              ) : (
                <>
                  <span aria-hidden="true" className="shrink-0 text-quiet-foreground">/</span>
                  <button
                    type="button"
                    className="shrink-0 rounded-sm text-sm text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setOpenMember(null)
                    }}
                  >
                    Members
                  </button>
                  <span aria-hidden="true" className="shrink-0 text-quiet-foreground">/</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {openMemberName}
                  </span>
                </>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={viewLabel}
              title={viewLabel}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={changePresentation}
            >
              {fullPage ? (
                <PanelRight className="size-4" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <Maximize2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
              )}
            </Button>
          </SheetHeader>
          )}

          <div
            className={cn(
              'min-h-0 flex-1 overflow-y-auto',
              fullPage ? 'py-[var(--space-group)]' : 'px-3 py-4',
            )}
          >
            <div className={cn('w-full', fullPage ? 'mx-auto max-w-[var(--shell-content-max)] px-4 md:px-10' : null)}>
            {openMember !== null ? (
              <MemberDetails
                folderId={folder.id}
                userId={openMember}
                viewerId={viewerId}
                fullPage={fullPage}
                ask={confirm.ask}
                onRemove={
                  mayRemove && openMember !== viewerId
                    ? (name) => {
                        askRemove(openMember, name, () => {
                          setOpenMember(null)
                        })
                      }
                    : undefined
                }
              />
            ) : (
            <>
            {mayShare ? (
              <section
                aria-label="Invite people"
                className={cn('mb-[var(--space-group)]', fullPage && 'border-b border-border pb-[var(--space-group)]')}
              >
              {fullPage ? <h2 className="mb-3 text-sm font-section text-foreground">Invite people</h2> : null}
              <div className="flex flex-wrap gap-[var(--space-inline)] sm:flex-nowrap">
                <div className="relative min-w-0 basis-full sm:flex-1 sm:basis-auto">
                  <Input
                    role="combobox"
                    aria-label={NAME_OR_EMAIL}
                    aria-autocomplete="list"
                    aria-expanded={showList}
                    aria-controls={listId}
                    {...(showList && active >= 0
                      ? { 'aria-activedescendant': `${listId}-${String(active)}` }
                      : {})}
                    autoComplete="off"
                    spellCheck={false}
                    value={text}
                    disabled={pending}
                    placeholder={mayAdd ? NAME_OR_EMAIL : 'Email'}
                    onChange={(event) => {
                      setText(event.target.value)
                      setPickedEmail(null)
                      setOpen(true)
                      setActive(-1)
                    }}
                    onFocus={() => {
                      setOpen(true)
                    }}
                    onBlur={() => {
                      setOpen(false)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowDown' && suggestions.length > 0) {
                        event.preventDefault()
                        setOpen(true)
                        setActive((at) => (at + 1) % suggestions.length)
                      } else if (event.key === 'ArrowUp' && suggestions.length > 0) {
                        event.preventDefault()
                        setOpen(true)
                        setActive((at) => (at <= 0 ? suggestions.length - 1 : at - 1))
                      } else if (event.key === 'Escape' && showList) {
                        event.preventDefault()
                        event.stopPropagation()
                        setOpen(false)
                        setActive(-1)
                      } else if (event.key === 'Enter') {
                        event.preventDefault()
                        if (showList && active >= 0) pick(active)
                        else submit()
                      }
                    }}
                  />
                  {showList ? (
                    <ul
                      id={listId}
                      role="listbox"
                      aria-label={NAME_OR_EMAIL}
                      className="absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
                    >
                      {suggestions.map((entry, index) => (
                        <li
                          key={entry.user.id}
                          id={`${listId}-${String(index)}`}
                          role="option"
                          aria-selected={index === active}
                          onMouseMove={() => {
                            setActive(index)
                          }}
                          onMouseDown={(event) => {
                            event.preventDefault()
                          }}
                          onClick={() => {
                            pick(index)
                          }}
                          className={cn(
                            'flex h-[var(--control-height)] cursor-pointer items-center gap-[var(--space-inline)] rounded-md px-2 text-sm',
                            index === active ? 'bg-accent' : null,
                          )}
                        >
                          <span className="min-w-0 truncate text-foreground">
                            {entry.user.display_name ?? entry.user.email}
                          </span>
                          {entry.user.display_name === null ? null : (
                            <span className="min-w-0 truncate text-xs text-muted-foreground">
                              {entry.user.email}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <InviteAccessPicker
                  value={inviteAccess}
                  onChange={setInviteAccess}
                  disabled={pending}
                />
                <Button disabled={target === null || pending} onClick={submit}>
                  Invite
                </Button>
              </div>
              </section>
            ) : null}

            <SectionHeading className={cn('text-sm font-section text-foreground', fullPage ? 'mb-3' : 'px-2 pb-1')}>Members</SectionHeading>
            <ul role="list" className={cn('flex flex-col', fullPage ? 'divide-y divide-border overflow-hidden rounded-md border border-border' : 'gap-[var(--space-row)]')}>
              {[...folder.members]
                .sort((a, b) => Number(b.is_owner) - Number(a.is_owner))
                .map((member) => {
                const name = member.user.display_name ?? 'Someone'
                const isSelf = member.user.id === viewerId
                return (
                  <li key={member.user.id} className={cn(ROW, fullPage && 'rounded-none px-3 py-2')}>
                    <PersonFace
                      id={member.user.id}
                      name={name}
                      initials={initialsOf(name)}
                      image={member.user.avatar_url}
                    />
                    <button
                      type="button"
                      data-member-row={member.user.id}
                      className="min-w-0 flex-1 truncate rounded-sm text-left text-sm text-foreground hover:underline underline-offset-2"
                      onClick={() => {
                        setOpenMember(member.user.id)
                      }}
                    >
                      {name}
                      {isSelf ? <span className="text-muted-foreground"> (you)</span> : null}
                    </button>
                    {member.is_owner ? (
                      <span className="inline-flex shrink-0 items-center gap-1 px-1.5 text-xs text-muted-foreground">
                        Owner
                        {mayChange ? (
                          <ChevronDown aria-hidden="true" className="invisible size-3.5" />
                        ) : null}
                      </span>
                    ) : (
                      <AccessMenu
                        size="sm"
                        folderId={folder.id}
                        userId={member.user.id}
                        access={member.access}
                        mayChange={mayChange}
                        self={isSelf}
                        ask={confirm.ask}
                        onRemove={
                          mayRemove && !isSelf
                            ? () => {
                                askRemove(member.user.id, name)
                              }
                            : undefined
                        }
                      />
                    )}
                  </li>
                )
              })}
            </ul>

            {folder.pending_invites.length === 0 ? null : (
              <div className="mt-[var(--space-group)]">
                <SectionHeading className={cn('text-sm font-section text-foreground', fullPage ? 'mb-3' : 'px-2 pb-1')}>Pending invites</SectionHeading>
                <ul role="list" className={cn('flex flex-col', fullPage ? 'divide-y divide-border overflow-hidden rounded-md border border-border' : 'gap-[var(--space-row)]')}>
                  {folder.pending_invites.map((row) => (
                    <li key={row.id} className={cn(ROW, fullPage && 'rounded-none px-3 py-2')}>
                      <Avatar size="sm">
                        <AvatarFallback className="text-xs">@</AvatarFallback>
                      </Avatar>
                      <p className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm text-foreground">{row.email}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {row.access === null ? 'Sent' : `${FOLDER_ACCESS_LABELS[row.access]}, sent`}{' '}
                          {formatRelativeDay(row.last_sent_at, presenterToday())}
                        </span>
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="font-normal text-muted-foreground"
                        onClick={() => {
                          cancel.mutate(row.id)
                        }}
                      >
                        Cancel
                      </Button>
                      {resendable(row.last_sent_at) ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="font-normal text-muted-foreground"
                          onClick={() => {
                            resend.mutate(row.id)
                          }}
                        >
                          Resend
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {onTransfer === undefined ? null : (
              <div className={cn('mt-[var(--space-group)] flex flex-col items-start', fullPage && 'border-t border-border pt-3')}>
                <Button variant="ghost" size="sm" className="font-normal text-muted-foreground" onClick={onTransfer}>
                  Transfer ownership…
                </Button>
              </div>
            )}
            </>
            )}
            </div>
          </div>
        </section>
      </SheetContent>
    </Sheet>
    <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </>
  )
}

function TeamResizeEdge({
  width,
  min,
  max,
}: {
  readonly width: number
  readonly min: number
  readonly max: number
}): React.JSX.Element {
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
  const clamp = (next: number): number => Math.min(max, Math.max(min, next))

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.focus()
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const current = drag.current
    if (current === null || current.pointerId !== event.pointerId) return
    setChatDockWidth(clamp(current.startWidth + current.startX - event.clientX))
  }
  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 48 : 16
    const next =
      event.key === 'ArrowLeft' ? width + step
        : event.key === 'ArrowRight' ? width - step
          : event.key === 'Home' ? max
            : event.key === 'End' ? min
              : null
    if (next === null) return
    event.preventDefault()
    setChatDockWidth(clamp(next))
  }

  return (
    <div
      role="separator"
      aria-label="Resize Team"
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      aria-valuetext={`${String(width)} pixels`}
      tabIndex={0}
      title="Resize Team"
      className="absolute inset-y-0 -left-1 z-10 hidden w-2 cursor-col-resize touch-none outline-none md:block after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent hover:after:bg-border focus-visible:after:bg-ring"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onDoubleClick={() => { setChatDockWidth(clamp(DOCK_DEFAULT_WIDTH)) }}
      onKeyDown={onKeyDown}
    />
  )
}
