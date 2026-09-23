import { useMemo, useState, type ReactNode } from 'react'

import type { Facet, FacetKind } from '../../shared/facets.js'
import { isHideableFacetKind, isRenameableFacetKind } from '../../shared/facets.js'
import type { PageView } from '../../shared/pages.js'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Compass,
  Eye,
  EyeOff,
  FileText,
  Heading1,
  Layers3,
  ListPlus,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Share2,
  Trash2,
} from '../lib/icons.js'
import { moved, swallowNextClick, useSortableList } from '../lib/use-sortable-list.js'
import { Button } from './ui/button.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js'
import { Input } from './ui/input.js'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.js'
import { Switch } from './ui/switch.js'
import { cn } from './ui/utils.js'

export interface FacetCapabilities {
  readonly createShared: boolean
  readonly createPrivate: boolean
  readonly reorderShared: boolean
  readonly reorderPrivate: boolean
  readonly rename: boolean
  readonly hide: boolean
  readonly delete: boolean
  readonly share: boolean
}

export interface CreateFacetInput {
  readonly kind: Extract<FacetKind, 'work' | 'shared_blank' | 'private_blank'>
  readonly name?: string
  readonly h1BlockId?: string
}

export function FolderFacetNavigator({
  facets,
  activeId,
  capabilities,
  page,
  controls,
  onSelect,
  onCreate,
  onCreateWorkSection,
  onReorder,
  onRename,
  onHide,
  onDelete,
  onShare,
}: {
  readonly facets: readonly Facet[]
  readonly activeId: string
  readonly capabilities: (facet: Facet | null) => FacetCapabilities
  readonly page: PageView | undefined
  readonly controls?: ReactNode
  readonly onSelect: (facet: Facet) => void
  readonly onCreate: (input: CreateFacetInput) => void
  readonly onCreateWorkSection: (name: string) => void
  readonly onReorder: (dragged: Facet, orderedVisible: readonly Facet[]) => void
  readonly onRename: (facet: Facet, name: string | null) => void
  readonly onHide: (facet: Facet, hidden: boolean) => void
  readonly onDelete: (facet: Facet) => void
  readonly onShare: (facet: Facet) => void
}): React.JSX.Element {
  const active = facets.find((facet) => facet.id === activeId) ?? facets[0] ?? null
  const visible = facets.filter((facet) => !facet.hidden)
  const main = visible.find((facet) => facet.kind === 'main') ?? null
  const movableFacets = visible.filter((facet) => facet.kind !== 'main')
  const general = capabilities(null)
  const [stripVisible, setStripVisible] = useState(true)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const sortable = useSortableList({
    count: movableFacets.length,
    axis: 'x',
    onLift: swallowNextClick,
    describe: (index) => movableFacets[index]?.name ?? 'Facet',
    onReorder: (from, to) => {
      const dragged = movableFacets[from]
      if (dragged === undefined) return
      const allowed = dragged.private
        ? capabilities(dragged).reorderPrivate
        : capabilities(dragged).reorderShared
      if (!allowed) return
      onReorder(dragged, [...(main ? [main] : []), ...moved(movableFacets, from, to)])
    },
  })

  function moveFocus(facet: Facet, direction: -1 | 1): void {
    const index = visible.findIndex((candidate) => candidate.id === facet.id)
    const next = visible[(index + direction + visible.length) % visible.length]
    if (next === undefined) return
    onSelect(next)
    globalThis.requestAnimationFrame(() => {
      globalThis.document.getElementById(`facet-tab-${next.id}`)?.focus()
    })
  }

  function beginRename(facet: Facet): void {
    if (!isRenameableFacet(facet) || !capabilities(facet).rename) return
    setRenameDraft(facet.name)
    setRenamingId(facet.id)
  }

  function finishRename(facet: Facet, cancel = false): void {
    const name = renameDraft.trim()
    setRenamingId(null)
    if (!cancel && name !== '' && name !== facet.name) onRename(facet, name)
  }

  return (
    <section aria-label="Folder facets" className="flex w-full min-w-0 items-center gap-1.5">
      {stripVisible ? (
        <>
          <div
            role="tablist"
            aria-label="Folder facets"
            className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto overflow-y-hidden py-0.5 [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none' }}
          >
            {visible.map((facet) => {
              const current = facet.id === active?.id
              const sortIndex = movableFacets.findIndex((candidate) => candidate.id === facet.id)
              const movable = sortIndex >= 0 && (facet.private
                ? capabilities(facet).reorderPrivate
                : capabilities(facet).reorderShared)
              const state = sortIndex >= 0 ? sortable.itemState(sortIndex) : null
              const sortProps = movable && sortIndex >= 0 ? sortable.surfaceProps(sortIndex) : {}
              const Icon = facetIcon(facet)
              return (
                <button
                  key={facet.id}
                  ref={sortIndex >= 0 ? sortable.setItemRef(sortIndex) : undefined}
                  id={`facet-tab-${facet.id}`}
                  type="button"
                  role="tab"
                  aria-selected={current}
                  aria-label={facet.private ? `${facet.name} — Private, only you` : facet.name}
                  title={facet.private ? 'Private — only you can see this facet' : facet.name}
                  tabIndex={current ? 0 : -1}
                  {...sortProps}
                  {...(movable ? { 'data-sort-handle': true, 'data-drag-through': true } : {})}
                  onClick={() => onSelect(facet)}
                  onDoubleClick={() => beginRename(facet)}
                  onKeyDown={(event) => {
                    if (movable && sortIndex >= 0) {
                      sortable.handleProps(sortIndex).onKeyDown(event)
                      if (event.defaultPrevented) return
                    }
                    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                    event.preventDefault()
                    moveFocus(facet, event.key === 'ArrowLeft' ? -1 : 1)
                  }}
                  className={cn(
                    'relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs outline-none transition-[background-color,color,box-shadow,transform] duration-[var(--duration-fast)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    current
                      ? 'bg-accent font-semibold text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    state?.isActive ? 'z-10 shadow-[var(--elevation-1)]' : '',
                  )}
                  style={{
                    touchAction: movable ? 'none' : undefined,
                    transform: state && state.offset !== 0 ? `translateX(${String(state.offset)}px)` : undefined,
                    transitionDuration: state?.isSettling ? '220ms' : undefined,
                  }}
                >
                  <Icon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  {renamingId === facet.id ? (
                    <input
                      value={renameDraft}
                      autoFocus
                      maxLength={120}
                      aria-label="Facet name"
                      className="h-5 w-28 rounded-sm border-0 bg-transparent p-0 text-xs font-semibold outline-none ring-0"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onBlur={() => finishRename(facet)}
                      onKeyDown={(event) => {
                        event.stopPropagation()
                        if (event.key === 'Enter') event.currentTarget.blur()
                        if (event.key === 'Escape') finishRename(facet, true)
                      }}
                    />
                  ) : (
                    <span className="max-w-40 truncate">{facet.name}</span>
                  )}
                </button>
              )
            })}
            <AddFacetPopover
              canCreateShared={general.createShared}
              canCreatePrivate={general.createPrivate}
              page={page}
              facets={facets}
              onCreate={onCreate}
              onCreateWorkSection={onCreateWorkSection}
              onHide={onHide}
              capabilities={capabilities}
            />
          </div>

          {active && hasFacetActions(active) ? (
            <FacetActions
              facet={active}
              capabilities={capabilities(active)}
              onReset={() => onRename(active, null)}
              onDelete={() => onDelete(active)}
              onShare={() => onShare(active)}
            />
          ) : null}
        </>
      ) : <span className="min-w-0 flex-1" />}

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={stripVisible ? 'Hide facet row' : 'Show facet row'}
        title={stripVisible ? 'Hide facets' : 'Show facets'}
        aria-pressed={!stripVisible}
        className={cn(
          'size-8 shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          !stripVisible ? 'bg-accent text-accent-foreground' : '',
        )}
        onClick={() => setStripVisible((value) => !value)}
      >
        {stripVisible ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
      </Button>

      {stripVisible && controls ? <div className="flex shrink-0 items-center gap-1">{controls}</div> : null}
      <span className="sr-only" aria-live="polite">{sortable.announcement}</span>
    </section>
  )
}

function facetIcon(facet: Facet): typeof FileText {
  if (facet.private) return Lock
  switch (facet.kind) {
    case 'main': return Layers3
    case 'purpose': return Compass
    case 'consultation': return MessageSquare
    case 'results': return CheckCircle2
    case 'work': return Heading1
    default: return FileText
  }
}

function isRenameableFacet(facet: Facet): boolean {
  return isRenameableFacetKind(facet.kind) || facet.kind.endsWith('_blank')
}

function hasFacetActions(facet: Facet): boolean {
  return facet.private || facet.kind === 'work' || facet.kind.endsWith('_blank')
}

function FacetActions({ facet, capabilities, onReset, onDelete, onShare }: {
  readonly facet: Facet
  readonly capabilities: FacetCapabilities
  readonly onReset: () => void
  readonly onDelete: () => void
  readonly onShare: () => void
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${facet.name}`} title="Facet actions" />}
      >
        <MoreHorizontal className="size-3.5" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {facet.private ? (
          <DropdownMenuItem disabled={!capabilities.share} onClick={onShare}>
            <Share2 /> Share facet…
          </DropdownMenuItem>
        ) : null}
        {isRenameableFacetKind(facet.kind) && facet.display_name !== null ? (
          <DropdownMenuItem disabled={!capabilities.rename} onClick={onReset}>Reset name</DropdownMenuItem>
        ) : null}
        {facet.private || (isRenameableFacetKind(facet.kind) && facet.display_name !== null)
          ? <DropdownMenuSeparator />
          : null}
        <DropdownMenuItem variant="destructive" disabled={!capabilities.delete} onClick={onDelete}>
          <Trash2 /> Move to Trash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type AddMode = 'root' | 'shared' | 'private' | 'work' | 'new-work'

function AddFacetPopover({
  canCreateShared,
  canCreatePrivate,
  page,
  facets,
  onCreate,
  onCreateWorkSection,
  onHide,
  capabilities,
}: {
  readonly canCreateShared: boolean
  readonly canCreatePrivate: boolean
  readonly page: PageView | undefined
  readonly facets: readonly Facet[]
  readonly onCreate: (input: CreateFacetInput) => void
  readonly onCreateWorkSection: (name: string) => void
  readonly onHide: (facet: Facet, hidden: boolean) => void
  readonly capabilities: (facet: Facet | null) => FacetCapabilities
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<AddMode>('root')
  const [name, setName] = useState('')
  const linked = new Set(facets.flatMap((facet) => facet.h1_block_id ? [facet.h1_block_id] : []))
  const headings = useMemo(
    () => page?.blocks.filter((block) => block.kind === 'section' && block.section_block_id === null && !linked.has(block.id)) ?? [],
    [page, facets],
  )
  const rootVisible = mode === 'root' || mode === 'work' || mode === 'new-work'

  function changeOpen(next: boolean): void {
    setOpen(next)
    if (!next) {
      setMode('root')
      setName('')
    }
  }

  function createNamed(kind: 'shared_blank' | 'private_blank'): void {
    const trimmed = name.trim()
    if (trimmed === '') return
    onCreate({ kind, name: trimmed })
    changeOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Add or manage facets"
            title="Add or manage facets"
            disabled={!canCreatePrivate && !canCreateShared}
            className="ml-0.5 shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          />
        }
      >
        <Plus className="size-3.5" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="relative w-72 overflow-visible p-1.5">
        {rootVisible ? (
          <>
            <PopoverRow disabled={!canCreateShared} onMouseEnter={() => setMode('root')} onClick={() => setMode('shared')}>
              <ListPlus className="size-4 text-muted-foreground" aria-hidden="true" />
              <span>New facet</span>
            </PopoverRow>
            <PopoverRow disabled={!canCreatePrivate} onMouseEnter={() => setMode('root')} onClick={() => setMode('private')}>
              <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
              <span>Private facet</span>
            </PopoverRow>
            <PopoverRow disabled={!canCreateShared} onMouseEnter={() => setMode('work')} onClick={() => setMode('work')}>
              <Heading1 className="size-4 text-muted-foreground" aria-hidden="true" />
              <span>Work section</span>
              <ChevronRight className="ml-auto size-3.5 text-muted-foreground" aria-hidden="true" />
            </PopoverRow>

            {facets.length > 0 ? (
              <div className="mt-1.5 border-t border-border pt-1.5">
                <p className="px-2 py-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Facet library</p>
                <div className="max-h-52 overflow-y-auto">
                {facets.map((facet) => {
                  const Icon = facetIcon(facet)
                  const hideable = isHideableFacetKind(facet.kind)
                  const lockedReason = facet.kind === 'main'
                    ? 'Main always stays visible.'
                    : !hideable
                      ? 'Custom facets stay visible until moved to Trash.'
                      : undefined
                  return (
                  <div key={facet.id} title={lockedReason} className="flex h-8 items-center gap-2 rounded-md px-2 text-xs text-foreground">
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{facet.name}</span>
                    <Switch
                      aria-label={`Show ${facet.name}`}
                      checked={!facet.hidden}
                      disabled={!hideable || !capabilities(facet).hide}
                      onCheckedChange={(checked) => onHide(facet, !checked)}
                      className="h-4 w-7 p-px [&_[data-slot=switch-thumb]]:size-3.5 [&_[data-slot=switch-thumb]][data-checked]:translate-x-3"
                    />
                  </div>
                  )
                })}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {mode === 'shared' || mode === 'private' ? (
          <NamedFacetForm
            title={mode === 'private' ? 'Private facet' : 'New facet'}
            placeholder={mode === 'private' ? 'Private notes' : 'Facet name'}
            value={name}
            onChange={setName}
            onBack={() => setMode('root')}
            onCreate={() => createNamed(mode === 'private' ? 'private_blank' : 'shared_blank')}
          />
        ) : null}

        {mode === 'work' || mode === 'new-work' ? (
          <div className="absolute left-[calc(100%+8px)] top-0 w-72 rounded-[10px] bg-popover p-1.5 text-popover-foreground shadow-[var(--elevation-1)] ring-1 ring-border">
            {mode === 'work' ? (
              <>
                <p className="border-b border-border px-2 py-2 text-xs font-semibold text-foreground">Work section</p>
                <div className="mt-1 max-h-56 overflow-y-auto">
              {headings.map((block) => (
                <PopoverRow key={block.id} onClick={() => {
                  onCreate({ kind: 'work', h1BlockId: block.id })
                  changeOpen(false)
                }}>
                  <span className="truncate">{block.text || 'Untitled section'}</span>
                </PopoverRow>
              ))}
              <PopoverRow onClick={() => setMode('new-work')}>
                <Plus className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span>Create new work section</span>
              </PopoverRow>
                </div>
              </>
            ) : (
              <NamedFacetForm
                title="New work section"
                placeholder="Section name"
                value={name}
                onChange={setName}
                onBack={() => setMode('work')}
                onCreate={() => {
                  const trimmed = name.trim()
                  if (trimmed === '') return
                  onCreateWorkSection(trimmed)
                  changeOpen(false)
                }}
              />
            )}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function PopoverRow({ children, disabled, onClick, onMouseEnter }: {
  readonly children: ReactNode
  readonly disabled?: boolean
  readonly onClick: () => void
  readonly onMouseEnter?: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-medium text-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function PopoverBack({ title, onBack }: { readonly title: string; readonly onBack: () => void }): React.JSX.Element {
  return (
    <div className="flex h-8 items-center border-b border-border pb-1">
      <Button variant="ghost" size="icon-sm" aria-label="Back" onClick={onBack}>
        <ArrowLeft className="size-3.5" aria-hidden="true" />
      </Button>
      <span className="text-xs font-semibold text-foreground">{title}</span>
    </div>
  )
}

function NamedFacetForm({ title, placeholder, value, onChange, onBack, onCreate }: {
  readonly title: string
  readonly placeholder: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly onBack: () => void
  readonly onCreate: () => void
}): React.JSX.Element {
  return (
    <div>
      <PopoverBack title={title} onBack={onBack} />
      <div className="space-y-2 p-2 pt-3">
        <Input
          className="h-8 text-xs"
          aria-label={title}
          placeholder={placeholder}
          value={value}
          maxLength={120}
          autoFocus
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') onCreate() }}
        />
        <Button className="w-full" size="sm" variant="commit" disabled={value.trim() === ''} onClick={onCreate}>Create</Button>
      </div>
    </div>
  )
}
