import { defaultBlockSpecs } from '@blocknote/core'
import { createReactBlockSpec } from '@blocknote/react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, MapPin } from 'lucide-react'
import { Link } from 'react-router'
import { z } from 'zod'
import { getFolderResponse } from '../../../../shared/folders.js'
import { getTaskResponse } from '../../../../shared/tasks.js'
import { ApiError, getPlain } from '../../../api/http.js'
import { googleMapsTarget, linksIn, videoTarget } from './links.js'
import type { GoogleMapsTarget } from './links.js'

function Reference({ href, kind, id }: { readonly href: string; readonly kind: 'folders' | 'tasks'; readonly id: string }): React.JSX.Element | null {
  const query = useQuery({
    queryKey: ['canvas-reference', kind, id],
    queryFn: async () => {
      try {
        if (kind === 'folders') return (await getPlain(getFolderResponse, `/folders/${id}`)).name
        return (await getPlain(getTaskResponse, `/tasks/${id}`)).title
      } catch (error) {
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return null
        throw error
      }
    },
  })
  if (!query.data) return null
  return <Link to={href} className="mt-1 inline-flex max-w-full items-center gap-2 rounded-md bg-muted px-2 py-1 text-sm text-foreground"><span className="text-xs text-muted-foreground">{kind === 'folders' ? 'Page' : 'Task'}</span><span className="truncate">{query.data}</span></Link>
}

function GoogleMapsCard({ href, label }: { readonly href: string; readonly label: string }): React.JSX.Element {
  return (
    <a href={href} target="_blank" rel="noreferrer" aria-label={`Open ${label} in Google Maps`} className="mt-2 flex max-w-full items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-foreground no-underline transition-colors hover:bg-muted/50">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground" aria-hidden="true"><MapPin className="size-4" /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{label}</span><span className="block text-xs text-muted-foreground">Google Maps</span></span>
      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </a>
  )
}

function GoogleMapsImage({ target }: { readonly target: GoogleMapsTarget }): React.JSX.Element {
  if (target.previewSrc === null) return <GoogleMapsCard href={target.href} label={target.label} />
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-border bg-muted">
      <img src={target.previewSrc} alt={`Map preview for ${target.label}`} loading="lazy" className="h-56 w-full bg-muted object-cover" />
      <a href={target.href} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 bg-background px-2.5 py-2 text-sm text-foreground no-underline hover:bg-muted/50">
        <MapPin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-medium">{target.label}</span>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">Open in Google Maps <ExternalLink className="size-3" aria-hidden="true" /></span>
      </a>
    </div>
  )
}

const resolvedMapResponse = z.object({ url: z.url() })

function ResolvedGoogleMapsPreview({ target }: { readonly target: GoogleMapsTarget }): React.JSX.Element {
  const query = useQuery({
    queryKey: ['google-maps-preview', target.href],
    queryFn: () => getPlain(resolvedMapResponse, '/link-previews/google-maps', { url: target.href }),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  })
  if (query.data !== undefined) {
    const resolved = googleMapsTarget(query.data.url)
    if (resolved !== null && resolved.previewSrc !== null && !resolved.needsResolve) return <GoogleMapsImage target={{ ...resolved, href: target.href }} />
  }
  return <GoogleMapsCard href={target.href} label={target.label} />
}

function GoogleMapsPreview({ target }: { readonly target: GoogleMapsTarget }): React.JSX.Element {
  if (target.needsResolve) return <ResolvedGoogleMapsPreview target={target} />
  return <GoogleMapsImage target={target} />
}

function LinkPreview({ href }: { readonly href: string }): React.JSX.Element | null {
  let url: URL
  try { url = new URL(href, window.location.origin) } catch { return null }
  const internal = url.origin === window.location.origin ? /^\/app\/(folders|tasks)\/([0-9a-f-]{36})$/i.exec(url.pathname) : null
  if (internal) return <Reference href={url.pathname} kind={internal[1] as 'folders' | 'tasks'} id={internal[2]!} />
  const map = googleMapsTarget(href)
  if (map !== null) return <GoogleMapsPreview target={map} />
  const video = videoTarget(href)
  if (!video || video.kind === 'direct') return null
  return <iframe src={video.src} title={video.kind === 'youtube' ? 'YouTube video' : 'Vimeo video'} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="mt-3 aspect-video w-full rounded-lg bg-muted" />
}

const base = defaultBlockSpecs.paragraph
type InlineText = { type: 'text'; text: string }
type Inline = InlineText | { type: 'link'; href: string; content: InlineText[] } | { type: 'danaLink' }

/** Supported inline custom block; all text/selection/history remain BlockNote's. */
export const createCanvasParagraph = createReactBlockSpec(base.config, {
  meta: base.implementation.meta,
  parse: base.implementation.parse,
  render: ({ block, contentRef }) => {
    const content = Array.isArray(block.content) ? block.content as Inline[] : []
    const text = content.map((inline) => inline.type === 'text' ? inline.text : inline.type === 'link' ? inline.content.map((run) => run.text).join('') : '').join('')
    const links = [...new Set([...linksIn(text), ...content.flatMap((inline) => inline.type === 'link' ? [inline.href] : [])])]
    return <div className="min-w-0 w-full"><p ref={contentRef} />{links.length ? <div contentEditable={false}>{links.slice(0, 3).map((href) => <LinkPreview key={href} href={href} />)}</div> : null}</div>
  },
  toExternalHTML: ({ contentRef }) => <p ref={contentRef} />,
}, base.extensions)

/**
 * TaskComposer still takes BlockNote's paragraph slot while sharing the rest
 * of the canvas vocabulary. schema.ts imports this module before TaskComposer
 * constructs its schema, so install the same renderer in that slot once. This
 * keeps page and Task link previews one treatment rather than two copies.
 */
export const sharedCanvasParagraph = createCanvasParagraph()
Object.assign(defaultBlockSpecs, { paragraph: sharedCanvasParagraph })
