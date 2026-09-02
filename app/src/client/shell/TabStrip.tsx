/*
The tab strip of 9.1: a row of tabs above the window bar.

**Roles come from 9.1's table**: a tab in the strip is a tab, current when
active, which means a `tablist` holding `tab`s with `aria-selected`. That is
what AC-216 addresses and it is not decoration: a strip built from buttons
tells a screen reader there are six buttons, where this one says there are six
tabs and which is current.

**The close control is named "Close tab" exactly.** The prototype interpolates
the title into it, and the correction is the one `components/README.md`
records against four other controls: a name in 9.1's table is a fixed string,
and a control that appears once per tab is separated from its siblings by the
region it sits in, which is the tab its title names, never by folding that
title into the control's own name. The names table says so in the same words:
"Close tab", addressed within the tab its title names.

**The plus is named "New tab"**, also from that table, and it offers what the
section says it offers: any shelf or folder as a tab, and then the acts of
making. New folder and New shelf are 9.1's own two and landed at the polish
round of 2026-08-30, the surfaces that make them having existed since S17b;
New task joins them at the same round and is recorded in 9.1 with it, and
Import closes the set later the same day through `overlays.ts`'s seam: the
strip asks, the sidebar presses the one file input it owns. The menu grows
those entries rather than the strip growing a second control.

**The row's geometry is the prototype's, measured rather than recalled.**
Serving `docs/design/prototype-v2` and reading the boxes back gives tabs of
128px flush against one another in a strip of 24px, no gap between them and
no inset at the sidebar's edge. The port had none of that: `gap-1` on the
row, `px-2` on the strip and no minimum width at all, so tabs were pills
sized to their own words, about 80px for "Desk", separated by a gutter. That
is what "they feel separated from each other" and "too condensed" name, and
the floor is what fixes both. The comments at the two class strings carry the
arithmetic.

**The drag runs on the one engine, since S11.** 9.1 says tabs are "reorderable
by drag", and this file answered that at S9 with a pointer drag of its own:
about thirty lines holding a press origin, a threshold, and a rule that the
tab under the pointer at release is where the carried one lands. It worked and
it was still the wrong shape, because RFC 0004 gives S11 "one drag engine
total" and 11.15's task-row hazard is what a second implementation of one
gesture becomes. The S9 close recorded "no drag code in `app/`" and this was
it; the record was not wrong about the *engine*, which did not exist, and was
wrong about the strip.

So the gesture is `lib/use-sortable-list.ts` now, on its `x` axis, and three
things a person can see changed with it. The strip makes space as a tab
travels rather than only fading the carried one, because the space is the
answer and an opacity is a hint. The exchange happens when the two tabs have
half-passed each other, the engine proposing by midpoint, where before it
happened wherever the pointer happened to be at release. And a tab reorders
from the keyboard, the engine's arrow keys on a focused tab, which a strip
that only answered a mouse never did.

**Selection stays a click and the drag swallows one.** The engine listens on
the window rather than capturing the pointer, so a release still delivers a
click onto whichever tab is under the cursor, which in a strip means selecting
a tab somebody was only moving. `swallowNextClick` is the sidebar's fix and
the same one here.
*/
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.js'
import { FolderPlus, Folders, ListPlus, Plus, Workflow, X } from '../lib/icons.js'
import type { LucideIcon } from '../lib/icons.js'
import { swallowNextClick, useSortableList } from '../lib/use-sortable-list.js'
import { folderMark, shelfMark } from '../parts/presenters.js'

import { openNewFolder, openTaskForm, requestWorkflowImport } from './overlays.js'
import { closeTab, openInNewTab, reorderTabs, selectTab, useTabs } from './tabs.js'
import { paths } from '../routes.js'
import type { Folder } from '../../shared/folders.js'
import type { Shelf } from '../../shared/shelves.js'

/** 9.1's names table, transcribed. */
const NEW_TAB = 'New tab'
const CLOSE_TAB = 'Close tab'

/*
The three acts the menu offers under its list of places.

**Two of them are 9.1's own words**, taken from the footer row of that
section's names table rather than from the prototype's "New folder…" and
"New shelf…": the same section rules that an ellipsis in a label is normative
and enumerates the acts that carry one, and neither of these is among them.
The footer and this menu are one act reached through two doors, so they are
one string.

**"New task" is neither the prototype's nor the section's**, and is recorded
in 9.1 with this round rather than left as a control nobody wrote down. It is
not one of 9.3's entry points and so carries none of its defaults: the strip
belongs to the window and not to the page under it, so a task made from here
is a plain one, which is also what keeps AC-093's entry table addressing the
same six captures it always did.
*/
const NEW_FOLDER = 'New folder'
const NEW_SHELF = 'New shelf'
const NEW_TASK = 'New task'

export interface TabFace {
  readonly title: string
  readonly icon: LucideIcon | undefined
  readonly iconColor: string | undefined
}

export function TabStrip({
  face,
  folders,
  shelves,
  onNewShelf,
  onNavigate,
}: {
  /** What a path looks like as a tab, which the shell already computes. */
  readonly face: (path: string) => TabFace
  readonly folders: readonly Folder[]
  /**
   * The viewer's shelves (7.16), so the menu offers 9.1's whole sentence.
   *
   * That section gives the plus "any shelf or folder", and this menu mapped
   * the folder list alone: half a sentence with no control behind it, which
   * is the audit's shelf-reachability row. The read reaches the shell
   * unconditionally since S17b, so this costs no request of its own.
   */
  readonly shelves: readonly Shelf[]
  /**
   * 9.1's second act of making, which is not a module seam like the other two.
   *
   * A shelf is made by the dialog `useFolderGroupActions` owns, and that hook
   * is mounted once by the shell with its dialogs beside it; a second call
   * here would be a second copy of the same surface. So this arrives as the
   * sidebar's `onNewShelf` does, from the one place that holds it. New folder
   * and New task need no prop: both already have a subscribable seam in
   * `overlays.ts`, which exists so that chrome can ask for a surface it does
   * not import.
   */
  readonly onNewShelf: () => void
  readonly onNavigate: (path: string) => void
}): React.JSX.Element {
  const { tabs, activeId } = useTabs()

  const drag = useSortableList({
    count: tabs.length,
    // 9.1's one horizontal list.
    axis: 'x',
    onReorder: reorderTabs,
    onLift: swallowNextClick,
    describe: (index) => {
      const tab = tabs[index]
      return tab === undefined ? 'Tab' : face(tab.path).title
    },
  })

  /* polish: tabstrip F9. Middle-click closes, as every strip does; a
     focused tab closes on Delete or Backspace. Ctrl+W is the browser's own
     and is not intercepted: a keydown handler cannot stop Chrome closing the
     window's tab, so wiring it would work only sometimes. */
  const close = (id: string): void => {
    const to = closeTab(id)
    if (to !== null) onNavigate(to)
  }

  return (
    /* polish: tabstrip F3, F10. The strip's ground is the sidebar's tint, so
       the active tab's card colour lifts off it; the plus docks after the
       last tab rather than at the far edge of the window. */
    <div className="flex h-[var(--shell-pagebar-height)] shrink-0 items-stretch bg-sidebar">
      {/*
      polish: tabstrip F13. The row is the prototype's geometry now, measured
      off it rather than guessed: tabs flush against one another with no gap
      and no inset from the sidebar's edge, each stretching the strip's full
      height. The port had given them `gap-1` and the strip `px-2`, which
      turned a tab strip into a row of separate pills, and pills are what
      "they feel separated from each other" describes.

      **The scrollbar is hidden rather than absent.** Tabs stop shrinking at
      the floor below, so enough of them overflow and the row scrolls; a
      scrollbar drawn inside a 24px strip would take a third of the tab's
      height to say so. Its buttons are hidden explicitly too, because
      Chromium on Windows can leave them visible after hiding the track.
      Every browser's own strip scrolls without one.
      */}
      <div
        role="tablist"
        aria-label="Open tabs"
        className="flex min-w-0 shrink items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar-button]:hidden [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab, index) => {
          const { title, icon: Icon, iconColor } = face(tab.path)
          const active = tab.id === activeId
          const state = drag.itemState(index)
          /* polish: tabstrip F11. The only tab, pointing at Desk, cannot be
             closed to anything but itself, so the control that would say
             otherwise is not drawn. */
          const closable = !(tabs.length === 1 && tab.path === paths.desk)
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              ref={drag.setItemRef(index)}
              /*
              The whole tab is the drag's surface, which is what a strip
              wants: the thing you move is the thing you grabbed. The engine's
              own guard is what keeps the close control a close control, a
              press landing on a `button` belonging to that button, so nothing
              here has to say so a second time.

              Only the primary button starts a drag; a middle click is a close
              on every strip a person has used and is not this package's to
              invent. The engine checks that too.
              */
              {...drag.surfaceProps(index)}
              // The engine's own marker, so that a keyboard reorder can put
              // focus back on the tab it just moved. In a sidebar row the
              // marker sits on a grip inside the row; here the tab is the
              // focusable thing, and the engine tries the item before looking
              // inside it.
              data-sort-handle
              onClick={() => onNavigate(selectTab(tab.id))}
              onAuxClick={(event) => {
                if (event.button !== 1) return
                event.preventDefault()
                close(tab.id)
              }}
              onKeyDown={(event) => {
                // The engine reads the two arrows that mean "along this list",
                // which on its `x` axis are Left and Right. It ignores every
                // other key, so this runs first and falls through.
                drag.handleProps(index).onKeyDown(event)
                if (event.defaultPrevented) return
                if ((event.key === 'Delete' || event.key === 'Backspace') && closable) {
                  event.preventDefault()
                  close(tab.id)
                  return
                }
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                onNavigate(selectTab(tab.id))
              }}
              style={{
                // The browser's own panning must not compete with the drag,
                // or a touch gesture scrolls the strip instead of moving the
                // tab. Always set, because it is a property of the surface
                // rather than of any drag in progress.
                touchAction: 'none',
                ...(state.offset === 0 && !state.isActive
                  ? {}
                  : {
                      // A translateX where a row uses translateY: the engine
                      // returns the shift along the axis and the caller knows
                      // which one that is.
                      transform: `translateX(${String(state.offset)}px)`,
                      transition:
                        state.isActive && !state.isSettling
                          ? 'none'
                          : 'transform 180ms cubic-bezier(0.2, 0, 0, 1)',
                      zIndex: state.isActive ? 30 : undefined,
                    }),
              }}
              /*
              polish: tabstrip F13. The tab's floor and ceiling are the
              prototype's two numbers, read off it by serving it and
              measuring: `min-w-32` and `max-w-56`, 128px and 224px, in a
              strip the tab stretches to fill.

              **Where a tab starts is the ceiling, not the floor, and that is
              the one place this leaves the prototype.** There every tab sits
              at 128px whatever the room, because nothing grows: eight tabs
              and one tab are drawn identically and a strip with three in it
              is mostly empty ground. Here the tab's basis is the ceiling and
              its shrink does the rest, which is the browser's own behaviour
              and what the round asked for in as many words: one to three
              tabs are wide, a filling strip narrows all of them evenly
              toward the floor rather than pushing the last one off the end,
              and past the floor the row scrolls. The prototype's two numbers
              are untouched; what changed is that the space between them is
              now used.

              **What it replaces was neither.** The port had `min-w-0
              shrink-0`, so a tab was as wide as the words inside it, about
              80px for "Desk": no floor, no ceiling and nothing shared, which
              is the "too condensed" of the round and reads as a chip rather
              than as a tab.

              **`pl-3` and `pr-6` are asymmetric on purpose**: the close
              control is positioned rather than laid out, so the padding
              holds its room and the title neither slides nor reflows as the
              control appears. A tab with no close control gets the same
              padding on both ends, there being nothing to keep clear.
              */
              className={`group/tab relative flex w-56 min-w-32 max-w-56 cursor-pointer items-center gap-2 self-stretch rounded-t-lg py-1 pl-3 ${
                closable ? 'pr-6' : 'pr-3'
              } text-left outline-none transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-inset ${
                active
                  ? 'bg-card'
                  : 'hover:bg-[color-mix(in_oklab,var(--color-graphite-0)_60%,var(--color-graphite-50))]'
              } ${state.isActive ? 'opacity-60 shadow-md' : ''}`}
            >
              {/* The mark fades rather than greys on an inactive tab, the
                  prototype's own arithmetic: the colour is the thing's
                  identity and has to survive being out of focus. */}
              {Icon === undefined ? null : (
                <span
                  className={`flex size-3.5 shrink-0 items-center justify-center transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-standard)] ${
                    active ? 'opacity-100' : 'opacity-[0.62] group-hover/tab:opacity-100'
                  }`}
                >
                  <Icon
                    className="size-3.5"
                    strokeWidth={1.75}
                    style={iconColor === undefined ? undefined : { color: iconColor }}
                    aria-hidden="true"
                  />
                </span>
              )}
              <span
                className={`min-w-0 flex-1 truncate text-xs leading-4 font-medium transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] ${
                  active
                    ? 'text-[var(--color-graphite-800)]'
                    : 'text-[var(--color-graphite-500)] group-hover/tab:text-[var(--color-graphite-700)]'
                }`}
              >
                {title}
              </span>
              {closable ? (
                /*
                Drawn at rest, where the prototype reveals it on hover, and
                the deviation is this round's own ruling rather than a
                preference: 9.11 settled that "a row whose only controls
                appear on hover is a row with nothing to press", and the same
                round's view-strip finding says the identical thing about a
                touchscreen, which has no hover to give. So the control keeps
                its position and its reserved room from the prototype and
                loses only the reveal.
                */
                <button
                  type="button"
                  aria-label={CLOSE_TAB}
                  title={CLOSE_TAB}
                  className="absolute right-1 flex size-4 items-center justify-center rounded text-[var(--color-graphite-400)] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-700)]"
                  onClick={(event) => {
                    event.stopPropagation()
                    close(tab.id)
                  }}
                >
                  <X className="size-3" strokeWidth={1.75} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          )
        })}
      </div>

      <DropdownMenu>
        {/* The trigger is the prototype's own markup since S24, a plain
            button rather than the primitive: its resting colour, its
            open-popup state and the wash it takes on hover are written into
            the class, and the primitive's own ghost variant was answering for
            them. The name is still 9.1's "New tab". */}
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={NEW_TAB}
              title={NEW_TAB}
              className="ml-1 flex size-6 shrink-0 items-center justify-center self-center rounded-md text-[var(--color-graphite-500)] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] outline-none hover:bg-[color-mix(in_oklab,var(--color-graphite-0)_60%,var(--color-graphite-50))] hover:text-[var(--color-graphite-800)] focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] data-popup-open:bg-[color-mix(in_oklab,var(--color-graphite-0)_60%,var(--color-graphite-50))]"
            />
          }
        >
          <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </DropdownMenuTrigger>
        {/* The alignment and the scroll cap are the prototype's: the menu
            lists every folder and every shelf, so it needs a ceiling and a
            width, and it hangs from the control's left where the strip
            runs. */}
        <DropdownMenuContent align="start" className="max-h-96 w-56 overflow-y-auto">
          {/* Each entry wears its folder's own mark since S17a (DES-130,
              AC-243). It drew one literal folder in a personal colour for
              every entry, so the one control whose job is choosing between
              folders was the one place they all looked alike. */}
          {folders.map((folder) => {
            const mark = folderMark(folder)
            return (
              <DropdownMenuItem
                key={folder.id}
                onClick={() => onNavigate(openInNewTab(`/app/folders/${folder.id}`))}
              >
                <mark.icon
                  className="size-4"
                  strokeWidth={1.75}
                  style={{ color: mark.color }}
                  aria-hidden="true"
                />
                {folder.name}
              </DropdownMenuItem>
            )
          })}
          {/* The other half of 9.1's "any shelf or folder", since S17b. The
              shelves follow the folders rather than interleaving with them,
              which is the Library's own arrangement read across: a shelf
              holds folders, so offering it beside them and not among them is
              what says which is which. Each wears its own mark through the
              same resolver, DES-130 applied to the second kind. */}
          {shelves.length === 0 ? null : <DropdownMenuSeparator />}
          {shelves.map((shelf) => {
            const mark = shelfMark(shelf)
            return (
              <DropdownMenuItem
                key={shelf.id}
                onClick={() => onNavigate(openInNewTab(`/app/shelves/${shelf.id}`))}
              >
                <mark.icon
                  className="size-4"
                  strokeWidth={1.75}
                  style={{ color: mark.color }}
                  aria-hidden="true"
                />
                {shelf.name}
              </DropdownMenuItem>
            )
          })}
          {/*
          The other half of 9.1's plus sentence: it "opens any shelf or
          folder as a tab, **or begins New folder, New shelf, or Import**".
          Until this round the menu was the first half alone, and the file's
          own header said the rest would arrive "with the surfaces that make
          them" and then never came back for them. They exist now, both of
          them, so the menu grows the entries the section always gave it
          rather than the strip growing a second control.

          A separator, because a list of places you can go and a list of
          things you can make are two kinds of answer to one press, and the
          only thing that says which is which is the line between them.

          Import goes through `requestWorkflowImport` rather than an input
          of its own: the one file input the application has belongs to the
          sidebar, and a second input in this menu would be a second answer
          to one selector, which is the fault the prototype's own comment
          records against exactly this control.
          */}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              openNewFolder(null)
            }}
          >
            <FolderPlus className="size-4" strokeWidth={1.75} aria-hidden="true" />
            {NEW_FOLDER}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onNewShelf}>
            <Folders className="size-4" strokeWidth={1.75} aria-hidden="true" />
            {NEW_SHELF}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              openTaskForm({})
            }}
          >
            <ListPlus className="size-4" strokeWidth={1.75} aria-hidden="true" />
            {NEW_TASK}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={requestWorkflowImport}>
            <Workflow className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Import
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="min-w-0 flex-1" aria-hidden="true" />
    </div>
  )
}
