/* One live Dana Link treatment for editable canvases and read-only posts.
 * Kept separate from the BlockNote inline spec so post lists do not load the editor. */
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'

import { OfflineError } from '../../api/http.js'
import { queryKeys } from '../../api/keys.js'
import { Link2 } from '../../lib/icons.js'
import { danaLinkOf, referenceDisplayLabel, resolveReference } from './dana-link.js'
import { DanaLinkKindIcon } from './kind-icon.js'
import './connected-work.css'

const CHIP = 'dana-link-chip mx-px inline-flex max-w-full items-baseline gap-1 rounded-sm border border-border bg-muted px-1.5 align-baseline text-[length:inherit] leading-[inherit] font-section text-foreground! no-underline!'
const FACET = 'border-primary/30 bg-primary/10'
const ARRIVED = 'ring-2 ring-primary/30 ring-offset-1 ring-offset-background'
const SOURCE_WIDTH_DEFAULT = 200
const SOURCE_WIDTH_MIN = 160
const SOURCE_WIDTH_MAX = 420

function splitterStorageKey(blockId: string): string {
  return `dana:connected-source-width:${blockId}`
}

export function clampConnectedSourceWidth(value: number, available: number): number {
  const max = Math.max(SOURCE_WIDTH_MIN, Math.min(SOURCE_WIDTH_MAX, available - 280))
  return Math.max(SOURCE_WIDTH_MIN, Math.min(max, Math.round(value)))
}

function markedConnectedPlacement(href: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return new URL(href, window.location.origin).searchParams.has('connected-work')
  } catch {
    return false
  }
}

/**
 * Install the source/mirror divider on the actual placement block. The Dana
 * Link can mount before Connected work marks the block and portals its detail
 * lane, so watch that host instead of requiring everything to exist on the
 * first effect pass.
 */
export function installConnectedSourceSplitter(source: HTMLAnchorElement): () => void {
  const placement = source.closest<HTMLElement>('.bn-block-content')
  if (placement === null) return () => undefined
  let cleanupHandle: (() => void) | null = null

  const ensure = (): void => {
    if (placement.dataset.connectedWorkPlacement !== 'true') return
    const detail = placement.querySelector<HTMLElement>(':scope > [data-connected-work-detail]')
    if (detail === null) return
    const blockId = detail.dataset.connectedWorkDetail ?? ''
    if (blockId === '') return
    const stored = Number.parseFloat(window.localStorage.getItem(splitterStorageKey(blockId)) ?? '')
    const available = placement.getBoundingClientRect().width || placement.parentElement?.getBoundingClientRect().width || 900
    const width = clampConnectedSourceWidth(Number.isFinite(stored) ? stored : SOURCE_WIDTH_DEFAULT, available)
    placement.style.setProperty('--dana-connected-source-width', `${width}px`)

    let handle = detail.querySelector<HTMLElement>(':scope > [data-connected-work-splitter]')
    if (handle !== null) return
    cleanupHandle?.()
    handle = document.createElement('div')
    handle.dataset.connectedWorkSplitter = ''
    handle.setAttribute('role', 'separator')
    handle.setAttribute('aria-orientation', 'vertical')
    handle.setAttribute('aria-label', 'Resize connected source column')
    handle.tabIndex = 0
    detail.append(handle)

    const setWidth = (raw: number, remember: boolean): void => {
      const box = placement.getBoundingClientRect()
      const next = clampConnectedSourceWidth(raw, box.width || available)
      placement.style.setProperty('--dana-connected-source-width', `${next}px`)
      handle!.setAttribute('aria-valuenow', String(next))
      handle!.setAttribute('aria-valuemin', String(SOURCE_WIDTH_MIN))
      handle!.setAttribute('aria-valuemax', String(clampConnectedSourceWidth(SOURCE_WIDTH_MAX, box.width || available)))
      if (remember) window.localStorage.setItem(splitterStorageKey(blockId), String(next))
    }
    setWidth(width, false)

    const stopDrag = (): void => {
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', cancel, true)
      document.documentElement.classList.remove('dana-resizing-connected-source')
    }
    const move = (next: PointerEvent): void => {
      next.preventDefault()
      const box = placement.getBoundingClientRect()
      setWidth(next.clientX - box.left, false)
    }
    const up = (next: PointerEvent): void => {
      stopDrag()
      const box = placement.getBoundingClientRect()
      setWidth(next.clientX - box.left, true)
    }
    const cancel = (): void => { stopDrag() }
    const down = (event: PointerEvent): void => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      document.documentElement.classList.add('dana-resizing-connected-source')
      window.addEventListener('pointermove', move, true)
      window.addEventListener('pointerup', up, true)
      window.addEventListener('pointercancel', cancel, true)
    }
    const keydown = (event: KeyboardEvent): void => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home') return
      event.preventDefault()
      const current = Number.parseFloat(placement.style.getPropertyValue('--dana-connected-source-width')) || SOURCE_WIDTH_DEFAULT
      setWidth(event.key === 'Home' ? SOURCE_WIDTH_DEFAULT : current + (event.key === 'ArrowLeft' ? -20 : 20), true)
    }
    handle.addEventListener('pointerdown', down)
    handle.addEventListener('keydown', keydown)
    cleanupHandle = () => {
      stopDrag()
      handle?.removeEventListener('pointerdown', down)
      handle?.removeEventListener('keydown', keydown)
    }
  }

  ensure()
  const observer = new MutationObserver(ensure)
  observer.observe(placement, {
    childList: true,
    subtree: false,
    attributes: true,
    attributeFilter: ['data-connected-work-placement'],
  })
  return () => {
    observer.disconnect()
    cleanupHandle?.()
  }
}

/** The placement's source Dana Link already owns navigation, so it also owns
 * the one source-lane interaction: the adjustable divider. */
function useConnectedSourceSplitter(
  anchor: React.RefObject<HTMLAnchorElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return
    const source = anchor.current
    if (source === null) return
    return installConnectedSourceSplitter(source)
  }, [anchor, enabled])
}

export function DanaLinkChip({ href, stored }: { readonly href: string; readonly stored: string }): React.JSX.Element {
  const target = danaLinkOf(href)
  const navigate = useNavigate()
  const anchor = useRef<HTMLAnchorElement>(null)
  const [arrived, setArrived] = useState(false)
  const query = useQuery({
    queryKey: queryKeys.reference(target?.kind ?? '', target?.id ?? ''),
    queryFn: () => resolveReference(target!.kind, target!.id),
    enabled: target !== null,
    retry: false,
    staleTime: 30_000,
  })

  useConnectedSourceSplitter(anchor, markedConnectedPlacement(href))

  /* #488 exact-source arrival. The link itself knows which BlockNote block it
     sits in, so it can honour `#block-<id>` without a second global navigation
     registry. Discussion posts already own `#post-<id>` in ThreadPosts. */
  useEffect(() => {
    let timer: number | undefined
    const reveal = (): void => {
      const block = anchor.current?.closest<HTMLElement>('.bn-block[data-id]')
      const id = block?.getAttribute('data-id')
      if (block === undefined || block === null || id === null || window.location.hash !== `#block-${id}`) return
      block.scrollIntoView({ block: 'center' })
      setArrived(true)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => { setArrived(false) }, 1600)
    }
    reveal()
    window.addEventListener('hashchange', reveal)
    return () => {
      window.removeEventListener('hashchange', reveal)
      window.clearTimeout(timer)
    }
  }, [])

  const offline = query.error instanceof OfflineError
  if (target === null || (query.isError && !offline)) {
    return (
      <span className={`${CHIP} text-muted-foreground!`} contentEditable={false} data-dana-link="unavailable" title="This link's target is unavailable" aria-disabled="true">
        <Link2 size={12} aria-hidden="true" className="shrink-0 self-center" />Unavailable
      </span>
    )
  }
  // Offline, the document's own words are the best we have; they are the
  // author's text, which this reader can already read in the page.
  const resolved = query.data?.label ?? (offline ? stored : '')
  const label = referenceDisplayLabel(target.kind, resolved)
  const classes = `${target.kind === 'facet' ? `${CHIP} ${FACET}` : CHIP}${arrived ? ` ${ARRIVED}` : ''}`
  return (
    <a
      ref={anchor}
      href={target.path}
      className={`${classes} cursor-pointer hover:bg-accent hover:text-accent-foreground! focus-visible:outline-2 focus-visible:outline-ring`}
      contentEditable={false}
      data-dana-link={target.kind}
      data-facet-reference={target.kind === 'facet' ? '' : undefined}
      title={target.kind === 'facet' ? 'Facet reference' : undefined}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
        event.preventDefault()
        void navigate(target.path)
      }}
    >
      <DanaLinkKindIcon kind={target.kind} />
      <span className="truncate">{query.isPending ? '…' : label === '' ? 'Untitled' : label}</span>
    </a>
  )
}
