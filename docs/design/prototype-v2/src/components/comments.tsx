/*
One conversation surface, wherever a conversation happens.

Drawn for DES-129 (comments on a task) and DES-134 (a folder's conversation),
and deliberately one component for both, on DES-123's rule: a thread copied
into a second place is a thread that will one day disagree with itself. The
card renders it as a block, the folder page renders it as a block or as a side
panel, and the differences between those are layout, never behaviour.

What a comment can be: words, files riding along, or a voice note. Replies are
the same shape nested one level, and one level is a decision rather than a
limit hit — a task's conversation is a short thread between a handful of
people, and unbounded nesting is how a card grows a forum inside it.

**Everything here is Lane 2 and none of it may be ported as though it
worked.** There is no message table, no delivery, no unread state, no audio
storage and no permission rule behind any of this; DES-129 carries the four
facts. What the prototype does make real, it makes real honestly, the way the
attachment picker did (DES-115): a voice note recorded here goes through the
actual microphone and actually plays back, because judging a voice-message
design that cannot make a sound is judging a picture of one. A *fixture* voice
note sweeps its progress silently, which is as far as a drawing can go.
*/

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"

import {
  AudioLines,
  FileText,
  Film,
  Mic,
  Paperclip,
  Pause,
  Play,
  Reply as ReplyIcon,
  SendHorizontal,
  Trash2,
  X,
  Image as ImageIcon,
  type LucideIcon,
} from "@/lib/icons"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PEOPLE, type ConceptComment } from "@/lib/task-model"
import { cn } from "@/lib/utils"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-1"

const ME = PEOPLE[0]!

type Person = { initials: string; name: string; image?: string }

/* Two sizes, both already in the system (F2a, review M2): the product's
   `sm` avatar for a comment's author, and the card's 16px dense face for a
   reply. Nothing in this thread introduces a size of its own. */
function CommentFace({
  person,
  dense = false,
  className,
}: {
  person: Person
  dense?: boolean
  className?: string
}) {
  return (
    <Avatar
      size="sm"
      className={cn(
        dense ? "size-4 data-[size=sm]:size-4" : "size-6 data-[size=sm]:size-6",
        className,
      )}
    >
      {person.image ? <AvatarImage src={person.image} alt="" /> : null}
      <AvatarFallback className="text-[0.5rem] font-semibold">
        {person.initials}
      </AvatarFallback>
    </Avatar>
  )
}

/* The card's IconAction, re-stated rather than imported: this module is
   imported *by* task-card, and a shared primitive is not worth a cycle. If a
   third file ever needs it, it moves somewhere neutral. */
function ThreadAction({
  icon: Icon,
  label,
  onClick,
  tone = "neutral",
}: {
  icon: LucideIcon
  label: string
  onClick?: () => void
  tone?: "neutral" | "danger"
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            onClick={(e) => {
              e.stopPropagation()
              onClick?.()
            }}
            className={cn(
              "flex size-6 items-center justify-center rounded-md transition-[background-color,color]",
              T_FAST,
              FOCUS,
              tone === "danger"
                ? "text-[var(--color-graphite-500)] hover:bg-[var(--color-danger-100)] hover:text-[var(--color-danger-700)]"
                : "text-[var(--color-graphite-500)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)]",
            )}
          >
            <Icon className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        }
      />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

/* ------------------------------------------------------------- the voice -- */

/* A deterministic waveform, so a fixture's bars do not reshuffle on every
   render and a recording's do not depend on anything the prototype cannot
   have (a real analysis of the audio). Seeded LCG, heights 4..18. */
export function voiceBars(seed: number, count = 26): number[] {
  let state = seed || 1
  return Array.from({ length: count }, () => {
    state = (state * 48271) % 2147483647
    return 4 + (state % 15)
  })
}

/*
The bubble. Play is real when the note carries a URL (it was recorded here);
a fixture sweeps the same progress silently. Both draw progress into the
waveform itself rather than adding a second track under it — the wave is
already the picture of the sound, so it may as well be the picture of how much
of it has played.
*/
function VoiceNote({ voice }: { voice: NonNullable<ConceptComment["voice"]> }) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current)
      audioRef.current?.pause()
    }
  }, [])

  function stopTimer() {
    if (timer.current !== null) {
      window.clearInterval(timer.current)
      timer.current = null
    }
  }

  function finish() {
    stopTimer()
    setPlaying(false)
    setProgress(0)
  }

  function toggle() {
    if (playing) {
      audioRef.current?.pause()
      finish()
      return
    }
    setPlaying(true)
    if (voice.url) {
      const audio = audioRef.current ?? new Audio(voice.url)
      audioRef.current = audio
      audio.currentTime = 0
      audio.onended = finish
      void audio.play()
      timer.current = window.setInterval(() => {
        /* Duration from the element once it knows better than the label. */
        const total = Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : voice.seconds
        setProgress(Math.min(1, audio.currentTime / total))
      }, 100)
    } else {
      /* A fixture: sweep the bars over the stated duration, silently. */
      const startedAt = Date.now()
      timer.current = window.setInterval(() => {
        const fraction = (Date.now() - startedAt) / (voice.seconds * 1000)
        if (fraction >= 1) finish()
        else setProgress(fraction)
      }, 100)
    }
  }

  const playedBars = Math.round(progress * voice.bars.length)

  return (
    <span
      className="mt-1 inline-flex h-9 items-center gap-2 rounded-full border border-[var(--color-graphite-200)] bg-card py-1 pr-3 pl-1"
      data-comment-voice
    >
      <button
        type="button"
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        onClick={(e) => {
          e.stopPropagation()
          toggle()
        }}
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-graphite-900)] text-white transition-colors hover:bg-[var(--color-graphite-800)]",
          T_FAST,
          FOCUS,
        )}
      >
        {playing ? (
          <Pause className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={2} aria-hidden="true" />
        ) : (
          <Play className="ml-0.5 size-3.5 fill-current data-[size=sm]:size-3.5" strokeWidth={2} aria-hidden="true" />
        )}
      </button>
      <span className="flex h-5 items-center gap-[2px]" aria-hidden="true">
        {voice.bars.map((height, i) => (
          <span
            key={i}
            style={{ height: `${height}px` }}
            className={cn(
              "w-[2px] rounded-full transition-colors",
              T_FAST,
              i < playedBars
                ? "bg-[var(--color-graphite-800)]"
                : "bg-[var(--color-graphite-300)]",
            )}
          />
        ))}
      </span>
      <span className="text-[12px] leading-4 text-[var(--color-graphite-500)] tabular-nums">
        {Math.floor(voice.seconds / 60)}:{String(Math.round(voice.seconds % 60)).padStart(2, "0")}
      </span>
    </span>
  )
}

/* ------------------------------------------------------------- the files -- */

const FILE_ICON: Record<string, LucideIcon> = {
  image: ImageIcon,
  video: Film,
  document: FileText,
  file: Paperclip,
}

/* A file on a comment renders as the Attachments block already renders a
   file: a 32px tile, the name, the meta line (F2a, review M6). The markup is
   restated rather than imported because task-card imports this module —
   when comments graduate under DES-124, the file row extracts to a neutral
   home and both call it. */
function CommentFiles({ files }: { files: NonNullable<ConceptComment["files"]> }) {
  return (
    <span className="mt-1 flex flex-col">
      {files.map((file) => {
        const Icon = FILE_ICON[file.kind] ?? Paperclip
        return (
          <span key={file.name} className="flex h-11 items-center gap-2.5">
            {file.preview ? (
              <img
                src={file.preview}
                alt=""
                className="size-8 shrink-0 rounded-[5px] border border-[var(--color-graphite-200)] object-cover"
              />
            ) : (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[5px] border border-[var(--color-graphite-200)] bg-[var(--color-graphite-50)]">
                <Icon
                  className="size-4 text-[var(--color-graphite-500)]"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-[var(--color-graphite-800)]">
                {file.name}
              </span>
              <span className="block text-[12px] leading-4 text-[var(--color-graphite-400)]">
                {file.meta}
              </span>
            </span>
          </span>
        )
      })}
    </span>
  )
}

/* ---------------------------------------------------------- the composer -- */

function readableSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileKind(type: string): "image" | "video" | "document" | "file" {
  if (type.startsWith("image/")) return "image"
  if (type.startsWith("video/")) return "video"
  if (type === "application/pdf" || type.startsWith("text/")) return "document"
  return "file"
}

/*
The composer. At rest it is one quiet line — a face and a field — because a
card's conversation must not out-shout the task above it. The controls arrive
in the field's trailing slot: attach, voice, and send once there is something
to send.

Recording replaces the field rather than opening anything: a pulsing mark, the
clock counting up, live bars, and two ways out — cancel, which discards, and
stop, which posts. The microphone is real (MediaRecorder), so a voice note
made here plays back as itself; where the microphone is refused or absent the
control says so in words under the field rather than pretending.
*/
function Composer({
  placeholder,
  autoFocus = false,
  onSubmit,
  onCancel,
}: {
  placeholder: string
  autoFocus?: boolean
  onSubmit: (comment: Omit<ConceptComment, "id" | "author" | "at" | "mine">) => void
  onCancel?: () => void
}) {
  const [text, setText] = useState("")
  const [files, setFiles] = useState<NonNullable<ConceptComment["files"]>>([])
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [micError, setMicError] = useState("")
  const fileInput = useRef<HTMLInputElement>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const discard = useRef(false)
  const tick = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (tick.current !== null) window.clearInterval(tick.current)
      if (recorder.current && recorder.current.state !== "inactive") {
        discard.current = true
        recorder.current.stop()
        recorder.current.stream.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  function submitText() {
    const body = text.trim()
    if (!body && files.length === 0) return
    onSubmit({ body: body || undefined, files: files.length ? files : undefined })
    setText("")
    setFiles([])
  }

  async function startRecording() {
    setMicError("")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const media = new MediaRecorder(stream)
      chunks.current = []
      discard.current = false
      media.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data)
      }
      media.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        if (!discard.current && chunks.current.length > 0) {
          const blob = new Blob(chunks.current, { type: media.mimeType })
          const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
          onSubmit({
            voice: {
              seconds,
              bars: voiceBars(seconds * 7 + blob.size),
              url: URL.createObjectURL(blob),
            },
          })
        }
      }
      const startedAt = Date.now()
      media.start()
      recorder.current = media
      setElapsed(0)
      setRecording(true)
      tick.current = window.setInterval(
        () => setElapsed(Math.round((Date.now() - startedAt) / 1000)),
        250,
      )
    } catch {
      setMicError("Microphone unavailable — voice notes need one.")
    }
  }

  function endRecording(keep: boolean) {
    discard.current = !keep
    if (tick.current !== null) {
      window.clearInterval(tick.current)
      tick.current = null
    }
    if (recorder.current && recorder.current.state !== "inactive") {
      recorder.current.stop()
    }
    recorder.current = null
    setRecording(false)
    setElapsed(0)
  }

  function takeFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    setFiles((current) => [
      ...current,
      ...Array.from(list).map((file) => {
        const kind = fileKind(file.type)
        return {
          name: file.name,
          meta: `${file.type.split("/")[1]?.toUpperCase() ?? "FILE"} · ${readableSize(file.size)}`,
          kind,
          preview: kind === "image" ? URL.createObjectURL(file) : undefined,
        }
      }),
    ])
  }

  if (recording) {
    /* Graphite, not danger (F2a, review M5): recording is an activity, not a
       loss, and the palette's guardrails reserve danger for loss. The one
       red thing is the dot — the universal convention — and the timer
       carries the state. */
    return (
      <div className="flex h-9 items-center gap-2 rounded-md border border-[var(--color-graphite-200)] bg-[var(--color-graphite-50)] py-1 pr-1 pl-3">
        <span className="relative flex size-2 shrink-0" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--color-danger-600)] opacity-50" />
          <span className="relative inline-flex size-2 rounded-full bg-[var(--color-danger-600)]" />
        </span>
        <span className="text-[12px] leading-4 font-medium text-[var(--color-graphite-700)] tabular-nums">
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
        </span>
        {/* Live bars: the drawn promise that something is being taken down.
            Heights animate from a keyframe scale rather than the stream's
            real levels — an analyser would be more machinery than the
            question "does recording feel alive" needs answered. */}
        <span className="flex h-5 flex-1 items-center justify-center gap-[2px] overflow-hidden" aria-hidden="true">
          {Array.from({ length: 24 }, (_, i) => (
            <span
              key={i}
              className="w-[2px] animate-pulse rounded-full bg-[var(--color-graphite-400)]"
              style={{
                height: `${5 + ((i * 7) % 13)}px`,
                animationDelay: `${(i % 6) * 90}ms`,
              }}
            />
          ))}
        </span>
        <ThreadAction icon={X} label="Discard recording" onClick={() => endRecording(false)} />
        <button
          type="button"
          aria-label="Stop and post voice message"
          onClick={(e) => {
            e.stopPropagation()
            endRecording(true)
          }}
          className={cn(
            "flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-[var(--color-graphite-900)] px-3 text-[12px] leading-4 font-medium text-white transition-colors hover:bg-[var(--color-graphite-800)]",
            T_FAST,
            FOCUS,
          )}
        >
          <SendHorizontal className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={2} aria-hidden="true" />
          Post
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-start gap-2">
        <CommentFace person={ME} className="mt-1.5" />
        {/* Dana's field, not a messenger's: radius-md from the tokens, the
            input border, the accent focus ring (F2a, review M1/Y1 — the 18px
            radius this replaces exists nowhere in the scale). */}
        <div
          className={cn(
            "flex min-h-9 flex-1 items-end gap-1 rounded-md border border-[var(--color-graphite-300)] bg-card py-1 pr-1 pl-3 transition-colors",
            T_FAST,
            "focus-within:border-[var(--color-dana-accent-600)] focus-within:ring-2 focus-within:ring-[var(--color-dana-accent-100)]",
          )}
        >
          <textarea
            value={text}
            rows={1}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus={autoFocus}
            placeholder={placeholder}
            aria-label={placeholder}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                submitText()
              }
              if (event.key === "Escape" && onCancel) {
                event.preventDefault()
                onCancel()
              }
            }}
            className="min-w-0 flex-1 resize-none self-center bg-transparent py-1 text-[14px] leading-5 text-[var(--color-graphite-800)] outline-none [field-sizing:content] placeholder:text-[var(--color-graphite-400)]"
          />
          <input
            ref={fileInput}
            type="file"
            multiple
            className="sr-only"
            onChange={(event) => {
              takeFiles(event.target.files)
              event.target.value = ""
            }}
          />
          <ThreadAction
            icon={Paperclip}
            label="Attach a file"
            onClick={() => fileInput.current?.click()}
          />
          <ThreadAction icon={Mic} label="Record a voice message" onClick={() => void startRecording()} />
          {text.trim() || files.length > 0 ? (
            <button
              type="button"
              aria-label="Post comment"
              onClick={(e) => {
                e.stopPropagation()
                submitText()
              }}
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-graphite-900)] text-white transition-colors hover:bg-[var(--color-graphite-800)]",
                T_FAST,
                FOCUS,
              )}
            >
              <SendHorizontal className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={2} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
      {files.length > 0 ? (
        <div className="mt-1.5 ml-8 flex flex-wrap gap-1.5">
          {files.map((file, index) => (
            <span
              key={`${file.name}-${index}`}
              className="inline-flex h-7 max-w-52 items-center gap-1.5 rounded-md border border-[var(--color-graphite-200)] bg-card px-2"
            >
              {file.preview ? (
                <img src={file.preview} alt="" className="size-4 rounded-[3px] object-cover" />
              ) : (
                <Paperclip className="size-3.5 text-[var(--color-graphite-500)]" strokeWidth={1.75} aria-hidden="true" />
              )}
              <span className="truncate text-[12px] leading-4 text-[var(--color-graphite-700)]">
                {file.name}
              </span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                className={cn(
                  "flex size-4 items-center justify-center rounded text-[var(--color-graphite-400)] hover:text-[var(--color-graphite-700)]",
                  FOCUS,
                )}
              >
                <X className="size-3 data-[size=sm]:size-3" strokeWidth={2} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {micError ? (
        <p className="mt-1 ml-8 text-[12px] leading-4 text-[var(--color-danger-700)]" role="alert">
          {micError}
        </p>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------ the thread -- */

function CommentRow({
  comment,
  isReply = false,
  onReply,
  onDelete,
}: {
  comment: ConceptComment
  isReply?: boolean
  onReply?: () => void
  onDelete: () => void
}) {
  return (
    <div className="group/comment flex items-start gap-2 rounded-md px-1 py-1.5 transition-colors hover:bg-[var(--color-graphite-50)]">
      <CommentFace person={comment.author} dense={isReply} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        {/* One header line: name, time, and the actions in a reserved
            trailing slot — revealed by hover, never covering the time
            (F2a, review M3; the task row's own rule). */}
        <span className="flex h-5 items-center gap-2">
          <span className="text-[12px] leading-4 font-medium text-[var(--color-graphite-700)]">
            {comment.author.name}
          </span>
          <span className="text-[12px] leading-4 text-[var(--color-graphite-400)]">
            {comment.at}
          </span>
          <span
            className={cn(
              "ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/comment:opacity-100 focus-within:opacity-100",
              T_FAST,
            )}
          >
            {onReply ? <ThreadAction icon={ReplyIcon} label="Reply" onClick={onReply} /> : null}
            {comment.mine ? (
              <ThreadAction icon={Trash2} label="Delete comment" tone="danger" onClick={onDelete} />
            ) : null}
          </span>
        </span>
        {comment.body ? (
          <span className="block text-[14px] leading-5 whitespace-pre-wrap text-[var(--color-graphite-800)]">
            {comment.body}
          </span>
        ) : null}
        {comment.voice ? <VoiceNote voice={comment.voice} /> : null}
        {comment.files ? <CommentFiles files={comment.files} /> : null}
      </div>
    </div>
  )
}

export function CommentsThread({
  comments,
  onChange,
  placeholder = "Write a comment",
  emptyWord = "comment",
  layout = "block",
}: {
  comments: ConceptComment[]
  onChange: (next: ConceptComment[]) => void
  placeholder?: string
  /* "comment" in a card, "message" in a chat panel — the only wording that
     differs between the surfaces. */
  emptyWord?: string
  /* "block" flows with the page; "pinned" fills its container, scrolls the
     thread, and keeps the composer at the foot — the dock, the panel and
     the full-screen surface all read that way. */
  layout?: "block" | "pinned"
}) {
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const counter = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  /* A pinned thread keeps its newest message in view, the way every
     conversation surface people already use does. */
  useEffect(() => {
    if (layout !== "pinned") return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [layout, comments])

  function newComment(
    partial: Omit<ConceptComment, "id" | "author" | "at" | "mine">,
  ): ConceptComment {
    counter.current += 1
    return {
      id: `comment-${Date.now()}-${counter.current}`,
      author: ME,
      at: "Just now",
      mine: true,
      ...partial,
    }
  }

  const thread = (
    <>
      {comments.map((comment) => (
        <div key={comment.id}>
          <CommentRow
            comment={comment}
            onReply={() => setReplyingTo(comment.id)}
            onDelete={() => onChange(comments.filter((c) => c.id !== comment.id))}
          />
          {(comment.replies?.length || replyingTo === comment.id) ? (
            /* Indent and the dense face say "belongs to" — DES-099's own
               mechanism. The rail this replaces was a rule inside the card,
               which DES-099 exists to forbid (F2a, review M4). */
            <div className="mt-0.5 ml-8 flex flex-col gap-0.5">
              {comment.replies?.map((reply) => (
                <CommentRow
                  key={reply.id}
                  comment={reply}
                  isReply
                  onDelete={() =>
                    onChange(
                      comments.map((c) =>
                        c.id === comment.id
                          ? { ...c, replies: c.replies?.filter((r) => r.id !== reply.id) }
                          : c,
                      ),
                    )
                  }
                />
              ))}
              {replyingTo === comment.id ? (
                <div className="py-1 pr-1">
                  <Composer
                    placeholder={`Reply to ${comment.author.name}`}
                    autoFocus
                    onCancel={() => setReplyingTo(null)}
                    onSubmit={(partial) => {
                      onChange(
                        comments.map((c) =>
                          c.id === comment.id
                            ? { ...c, replies: [...(c.replies ?? []), newComment(partial)] }
                            : c,
                        ),
                      )
                      setReplyingTo(null)
                    }}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}

    </>
  )

  const composer = (
    <Composer
      placeholder={comments.length === 0 ? `Write the first ${emptyWord}` : placeholder}
      onSubmit={(partial) => onChange([...comments, newComment(partial)])}
    />
  )

  if (layout === "pinned") {
    return (
      <div
        className="flex h-full min-h-0 flex-col"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <div className="flex flex-col gap-0.5">{thread}</div>
        </div>
        <div className="shrink-0 border-t border-[var(--color-graphite-100)] px-3 py-2.5">
          {composer}
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col gap-0.5"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {thread}
      <div className={cn(comments.length > 0 && "mt-1.5")}>{composer}</div>
    </div>
  )
}
