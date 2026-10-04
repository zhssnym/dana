/*
One post, read-only: its content (`shared/comments.ts` `postContent`) drawn
in the page canvas's vocabulary — headings, nested lists, checklists, toggles,
quotes, callouts, code, dividers and the post's own files — without loading
the editor. A post written before posts has `content` null and its `body` is
the whole post, drawn as text with its line breaks. Files the writing does not
place (every attachment of an older comment) follow it as tiles.

Long posts fold after about eight lines behind "Show more".

A chat bubble hands in a `footer` (reactions, time): it floats at the right
end of the last line of text when there is room, else takes a line of its
own, and sits beside "Show more" while the post is folded.

A link to a task draws as a compact card: the task's state mark, its title on
one line and its state word, opening the task when pressed.

Nothing here imports BlockNote: a thread with fifty posts draws fifty of these,
and the editor is loaded only for the one composer.
*/
import { useLayoutEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'

import { walkPostBlocks } from '../../../shared/comments.js'
import type { CommentFile, PostBlock, PostContent } from '../../../shared/comments.js'
import type { RichContent } from '../../../shared/rich-content.js'
import { queryKeys } from '../../api/keys.js'
import { useTask } from '../../api/queries.js'
import { FileText } from '../../lib/icons.js'
import { fileSrc } from '../../lib/thread.js'
import { danaLinkOf, resolveReference } from '../links/dana-link.js'
import { DanaLinkChip } from '../links/dana-link-display.js'
import { MentionChip } from '../page/canvas/mention-chip.js'
import { cn } from '../ui/utils.js'
import { STATE_WORD, StateMark, taskState } from './timeline/state.js'

/* About eight lines of body text before a post folds; a post with files
   folds later, so a picture and its name and size show whole. */
const FOLD = 'max-h-40'
const FOLD_FILES = 'max-h-96'

export function PostView({
  content,
  body,
  files,
  edited = false,
  footer,
}: {
  readonly content: PostContent | null | undefined
  readonly body: string | null
  readonly files: readonly CommentFile[]
  /** Slack's "(edited)": inline after the last line when it is text, else on a line of its own. */
  readonly edited?: boolean
  /** Drawn after the text, at the right (a bubble's reactions and time). */
  readonly footer?: React.ReactNode
}): React.JSX.Element {
  const inner = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)

  useLayoutEffect(() => {
    const element = inner.current
    if (element === null) return
    const measure = (): void => {
      /* Once folded, stays folded for this content: the footer moving out
         from under the fold would otherwise unfold it again. The caller
         keys this view by the post's edit. */
      const over = element.scrollHeight > element.clientHeight + 4
      setOverflows((was) => was || over)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    for (const child of Array.from(element.children)) observer.observe(child)
    return () => {
      observer.disconnect()
    }
  }, [content, body, open])

  const byId = new Map(files.map((file) => [file.id, file]))
  const placed = new Set<string>()
  if (content) walkPostBlocks(content.blocks, (block) => { if (block.file_id !== undefined) placed.add(block.file_id) })
  const loose = files.filter((file) => !placed.has(file.id))
  const folded = overflows && !open
  const mark =
    footer !== undefined
      ? folded ? null : <span className="float-right mt-0.5 ml-2 whitespace-nowrap">{footer}</span>
      : edited ? <span className="text-xs text-muted-foreground"> (edited)</span> : null
  const lastBlock = content ? content.blocks.at(-1) : undefined
  const inline =
    content ? lastBlock?.kind === 'paragraph' && (lastBlock.children?.length ?? 0) === 0 && loose.length === 0 : loose.length === 0

  return (
    <div className="min-w-0">
      <div
        ref={inner}
        className={cn(
          'min-w-0 space-y-1.5 text-sm wrap-anywhere whitespace-pre-wrap text-foreground',
          // Each line takes its direction from its own first letter, so Arabic
          // reads right to left and English left to right in the same post.
          '[&_:is(p,li,h1,h2,h3,h4,blockquote)]:[unicode-bidi:plaintext] [&_:is(p,li,h1,h2,h3,h4,blockquote)]:text-start',
          footer !== undefined && 'flow-root',
          !open && (files.length > 0 ? FOLD_FILES : FOLD),
          !open && 'overflow-hidden',
        )}
      >
        {content ? (
          <Blocks blocks={content.blocks} files={byId} suffix={inline ? mark : null} />
        ) : body !== null && body !== '' ? (
          <p className="whitespace-pre-wrap">{body}{inline ? mark : null}</p>
        ) : null}
        {loose.length > 0 ? <Tiles files={loose} /> : null}
        {mark !== null && !inline ? <p className="leading-none">{mark}</p> : null}
      </div>
      {overflows || open ? (
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            className="rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground"
            onClick={() => {
              setOpen((value) => !value)
            }}
          >
            {open ? 'Show less' : 'Show more'}
          </button>
          {folded && footer !== undefined ? <span className="ml-auto whitespace-nowrap">{footer}</span> : null}
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------ blocks */

type Files = ReadonlyMap<string, CommentFile>

/** Siblings, with consecutive list items gathered into one list. */
function Blocks({
  blocks,
  files,
  suffix = null,
}: {
  readonly blocks: readonly PostBlock[]
  readonly files: Files
  /** Drawn at the end of the last block's text (a paragraph's). */
  readonly suffix?: React.ReactNode
}): React.JSX.Element {
  const out: React.JSX.Element[] = []
  let index = 0
  while (index < blocks.length) {
    const block = blocks[index]!
    if (block.kind === 'bullet' || block.kind === 'numbered') {
      const kind = block.kind
      const run: PostBlock[] = []
      while (index < blocks.length && blocks[index]!.kind === kind) {
        run.push(blocks[index]!)
        index += 1
      }
      const items = run.map((item, at) => (
        <li key={at} className="pl-0.5">
          <Runs rich={item.rich_content} />
          {item.children ? <div className="mt-1 space-y-1"><Blocks blocks={item.children} files={files} /></div> : null}
        </li>
      ))
      out.push(
        kind === 'bullet'
          ? <ul key={`l${String(index)}`} className="list-disc space-y-0.5 pl-5">{items}</ul>
          : <ol key={`l${String(index)}`} className="list-decimal space-y-0.5 pl-5">{items}</ol>,
      )
      continue
    }
    out.push(<Block key={index} block={block} files={files} suffix={index === blocks.length - 1 ? suffix : null} />)
    index += 1
  }
  return <>{out}</>
}

function Children({ block, files }: { readonly block: PostBlock; readonly files: Files }): React.JSX.Element | null {
  if (!block.children || block.children.length === 0) return null
  return <div className="mt-1 space-y-1.5 pl-5"><Blocks blocks={block.children} files={files} /></div>
}

function Block({
  block,
  files,
  suffix = null,
}: {
  readonly block: PostBlock
  readonly files: Files
  readonly suffix?: React.ReactNode
}): React.JSX.Element {
  switch (block.kind) {
    case 'heading1':
    case 'heading2':
    case 'heading3': {
      // The editor's own three steps (canvas.css), so a post reads as written.
      const size = block.kind === 'heading1'
        ? 'text-[length:var(--text-h1-size)] leading-[var(--text-h1-line)]'
        : block.kind === 'heading2'
          ? 'text-[length:var(--text-h2-size)] leading-[var(--text-h2-line)]'
          : 'text-[length:var(--text-h3-size)] leading-[var(--text-h3-line)]'
      return (
        <div>
          <p role="heading" aria-level={Number(block.kind.slice(-1)) + 2} className={cn('pt-1 font-semibold', size)}>
            <Runs rich={block.rich_content} />
          </p>
          <Children block={block} files={files} />
        </div>
      )
    }
    case 'checklist':
      return (
        <div>
          <div className="flex items-start gap-2">
            <input type="checkbox" checked={block.checked === true} disabled readOnly aria-label="Checklist item" className="mt-1 size-3.5 shrink-0 accent-foreground" />
            <span className={cn(block.checked === true && 'text-muted-foreground line-through')}><Runs rich={block.rich_content} /></span>
          </div>
          <Children block={block} files={files} />
        </div>
      )
    case 'toggle':
      return (
        <details open className="group/toggle">
          <summary className="cursor-pointer rounded-sm outline-none">
            <Runs rich={block.rich_content} />
          </summary>
          <Children block={block} files={files} />
        </details>
      )
    case 'quote':
      return (
        <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">
          <Runs rich={block.rich_content} />
          <Children block={block} files={files} />
        </blockquote>
      )
    case 'callout':
      return (
        <div className="rounded-md bg-muted px-3 py-2">
          <Runs rich={block.rich_content} />
          <Children block={block} files={files} />
        </div>
      )
    case 'code':
      return (
        <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs whitespace-pre">{block.text ?? ''}</pre>
      )
    case 'divider':
      return <hr className="my-2 border-border" />
    case 'image': {
      const file = files.get(block.file_id ?? '')
      return file ? (
        <ImageTile file={file} />
      ) : (
        <img
          src={fileSrc(block.file_id ?? '')}
          alt=""
          loading="lazy"
          className="max-h-96 max-w-full rounded-md border border-border object-contain"
        />
      )
    }
    case 'video':
      return <video src={fileSrc(block.file_id ?? '')} controls className="max-h-96 max-w-full rounded-md" />
    case 'audio':
      return <audio src={fileSrc(block.file_id ?? '')} controls className="max-w-full" />
    case 'file': {
      const file = files.get(block.file_id ?? '')
      return file ? <Tiles files={[file]} /> : <FileLink id={block.file_id ?? ''} name="File" meta="" />
    }
    default:
      return (
        <div>
          <p className="min-h-5"><Runs rich={block.rich_content} />{suffix}</p>
          <Children block={block} files={files} />
        </div>
      )
  }
}

/* ------------------------------------------------------------ inline */

function Runs({ rich }: { readonly rich: RichContent | undefined }): React.JSX.Element | null {
  if (!rich) return null
  return (
    <>
      {rich.runs.map((run, index) => {
        let node: React.ReactNode = run.text
        if (run.bold) node = <strong className="font-semibold">{node}</strong>
        if (run.italic) node = <em>{node}</em>
        // Wave 2 (W-D): a person mention draws the canvas's chip.
        if (run.mention !== undefined) return <MentionChip key={index} label={run.text} />
        if (run.href !== undefined && danaLinkOf(run.href)?.kind === 'task') {
          return <TaskRef key={index} href={run.href} stored={run.text} />
        }
        if (run.href !== undefined) {
          node = danaLinkOf(run.href) !== null
            ? <DanaLinkChip href={run.href} stored={run.text} />
            : <a href={run.href} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 hover:text-muted-foreground">{node}</a>
        }
        return <span key={index}>{node}</span>
      })}
    </>
  )
}

/** A task named in a post: its mark, title and state on one line, opening
 * the task. Read only once the link itself resolves (so a task the reader
 * may not see is never asked for); until then, and if the task cannot be
 * read, it is the ordinary link chip. */
function TaskRef({ href, stored }: { readonly href: string; readonly stored: string }): React.JSX.Element {
  const target = danaLinkOf(href)
  const reference = useQuery({
    queryKey: queryKeys.reference(target?.kind ?? '', target?.id ?? ''),
    queryFn: () => resolveReference(target!.kind, target!.id),
    enabled: target !== null,
    retry: false,
    staleTime: 30_000,
  })
  const task = useTask(target !== null && reference.isSuccess ? target.id : null)
  if (target === null || task.data === undefined) return <DanaLinkChip href={href} stored={stored} />
  const state = taskState(task.data)
  return (
    <Link
      to={target.path}
      data-dana-link="task"
      className="mx-px inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-sm border border-border bg-background px-1.5 align-bottom whitespace-nowrap no-underline outline-none hover:bg-accent"
    >
      <StateMark state={state} className="size-3.5" />
      <span className={cn('min-w-0 truncate font-section text-foreground', state !== 'open' && 'text-muted-foreground')}>{task.data.title}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{STATE_WORD[state]}</span>
    </Link>
  )
}

/* ------------------------------------------------------------ files */

function readableSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`
  if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Tiles({ files }: { readonly files: readonly CommentFile[] }): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {files.map((file) =>
        file.mime.startsWith('image/') ? (
          <ImageTile key={file.id} file={file} />
        ) : (
          <FileLink key={file.id} id={file.id} name={file.name} meta={`${file.mime.split('/')[1]?.toUpperCase() ?? 'FILE'} · ${readableSize(file.bytes)}`} />
        ),
      )}
    </div>
  )
}

/** A picture in a 280px card, its name and size under it in one muted line. */
function ImageTile({ file }: { readonly file: CommentFile }): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className="mt-1.5 inline-flex max-w-full min-w-0 items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs whitespace-normal">
        <FileText className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
        <span className="min-w-0 truncate text-foreground">{file.name}</span>
        <span className="ml-auto shrink-0 text-muted-foreground">Image unavailable · {readableSize(file.bytes)}</span>
      </div>
    )
  }

  return (
    <a
      href={fileSrc(file.id)}
      target="_blank"
      rel="noreferrer"
      className="mt-1.5 inline-flex w-70 max-w-full flex-col overflow-hidden rounded-md border border-border align-top whitespace-normal outline-none hover:border-quiet-foreground"
    >
      <img
        src={fileSrc(file.id)}
        alt={file.name}
        loading="lazy"
        className="h-auto max-h-64 w-full bg-muted object-contain"
        onError={() => { setFailed(true) }}
        {...(file.width !== null && file.height !== null ? { width: file.width, height: file.height } : {})}
      />
      <span className="flex gap-2 border-t border-border px-2.5 py-1.5 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{file.name}</span>
        <span className="ml-auto shrink-0 text-muted-foreground">{readableSize(file.bytes)}</span>
      </span>
    </a>
  )
}

function FileLink({ id, name, meta }: { readonly id: string; readonly name: string; readonly meta: string }): React.JSX.Element {
  return (
    <a
      href={fileSrc(id)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs outline-none hover:bg-muted"
    >
      <FileText className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      <span className="min-w-0 truncate text-foreground">{name}</span>
      {meta !== '' ? <span className="shrink-0 text-muted-foreground">{meta}</span> : null}
    </a>
  )
}