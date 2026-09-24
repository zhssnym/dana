import { defaultBlockSpecs } from '@blocknote/core'
import { createReactBlockSpec } from '@blocknote/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { getFolderResponse } from '../../../../shared/folders.js'
import { getTaskResponse } from '../../../../shared/tasks.js'
import { ApiError, getPlain } from '../../../api/http.js'
import { linksIn, videoTarget } from '../../../pages/composer-research-content.js'

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
  return <Link to={href} className="mt-1 inline-flex max-w-full items-center gap-2 rounded-md bg-muted px-2 py-1 text-sm text-foreground"><span className="text-xs text-muted-foreground">{kind === 'folders' ? 'Folder' : 'Task'}</span><span className="truncate">{query.data}</span></Link>
}

function LinkPreview({ href }: { readonly href: string }): React.JSX.Element | null {
  let url: URL
  try { url = new URL(href, window.location.origin) } catch { return null }
  const internal = url.origin === window.location.origin ? /^\/app\/(folders|tasks)\/([0-9a-f-]{36})$/i.exec(url.pathname) : null
  if (internal) return <Reference href={url.pathname} kind={internal[1] as 'folders' | 'tasks'} id={internal[2]!} />
  const video = videoTarget(href)
  if (!video || video.kind === 'direct') return null
  return <iframe src={video.src} title={video.kind === 'youtube' ? 'YouTube video' : 'Vimeo video'} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="mt-3 aspect-video w-full rounded-lg bg-muted" />
}

const base = defaultBlockSpecs.paragraph
type InlineText = { type: 'text'; text: string }
type Inline = InlineText | { type: 'link'; href: string; content: InlineText[] }
/** Supported inline custom block; all text/selection/history remain BlockNote's. */
export const createCanvasParagraph = createReactBlockSpec(base.config, {
  meta: base.implementation.meta,
  parse: base.implementation.parse,
  render: ({ block, contentRef }) => {
    // BlockNote also calls render while inserting a non-text block (an image),
    // when content is not an inline array; a throw here unmounts the whole canvas.
    const content = Array.isArray(block.content) ? block.content as Inline[] : []
    const text = content.map((inline) => inline.type === 'text' ? inline.text : inline.content.map((run) => run.text).join('')).join('')
    const links = [...new Set([...linksIn(text), ...content.flatMap((inline) => inline.type === 'link' ? [inline.href] : [])])]
    return <div className="min-w-0 w-full"><p ref={contentRef} />{links.length ? <div contentEditable={false}>{links.slice(0, 3).map((href) => <LinkPreview key={href} href={href} />)}</div> : null}</div>
  },
  toExternalHTML: ({ contentRef }) => <p ref={contentRef} />,
}, base.extensions)
