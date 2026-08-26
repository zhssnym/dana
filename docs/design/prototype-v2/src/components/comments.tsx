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
  Video,
  Mic,
  Link2,
  Paperclip,
  Plus,
  UserRound,
  Pause,
  Pencil,
  Play,
  Reply as ReplyIcon,
  SendHorizontal,
  ThumbsUp,
  Trash2,
  X,
  Image as ImageIcon,
  type LucideIcon,
} from "@/lib/icons"
import { Face } from "@/components/person-face"
import { IconAction } from "@/components/icon-action"
import { Textarea } from "@/components/ui/textarea"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import {
  Bubble,
  BubbleContent,
  BubbleReactions,
} from "@/components/ui/bubble"
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageHeader,
} from "@/components/ui/message"
import { PEOPLE, personTint, type ConceptComment } from "@/lib/task-model"
import { cn } from "@/lib/utils"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-1"

const ME = PEOPLE[0]!

/*
The thread reads at the prose tier — F5, 2026-08-22, and it moved as one
change because it could not honestly move as three.

Imran called the composer's placeholder oversized and inconsistent with the
hierarchy. It was: 14px, while DES-148 puts "all prose and row information" at
12 and the whole thread around it obeyed that everywhere except in the two
places that carry the words. Fixing only the placeholder would have made the
composer smaller than the messages it writes, which is worse than the fault —
you type into the thing you are going to read, and those two must agree.

So the message body, the composer and the card's Notes field all sit at 12/20
now. That is the condition the plan recorded against this question: if the
composer drops, Notes drops with it.
*/

type Person = { initials: string; name: string; image?: string }


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
      <Button
        variant="commit"
        size="icon"
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        className="shrink-0 rounded-full"
        onClick={(event) => {
          event.stopPropagation()
          toggle()
        }}
      >
        {playing ? (
          <Pause className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={2} aria-hidden="true" />
        ) : (
          <Play className="ml-0.5 size-3.5 fill-current data-[size=sm]:size-3.5" strokeWidth={2} aria-hidden="true" />
        )}
      </Button>
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
  video: Video,
  document: FileText,
  file: Paperclip,
  /* A link on a message wears the link glyph, like a link on a task
     (DES-161) — it was showing a paperclip, which is the mark for the other
     kind of thing you can attach. */
  link: Link2,
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
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  /* The link row, open only while somebody is pasting one. */
  const [showLink, setShowLink] = useState(false)
  const [link, setLink] = useState("")
  /* Which control the trailing slot shows. Not "is the field empty" — a
     message that is only an attachment is still a message worth sending. */
  const hasSomethingToSend = Boolean(text.trim()) || files.length > 0
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
        <IconAction dense icon={X} label="Discard recording" onClick={() => endRecording(false)} />
        <Button
          variant="commit"
          aria-label="Stop and post voice message"
          className="shrink-0 px-3"
          onClick={(event) => {
            event.stopPropagation()
            endRecording(true)
          }}
        >
          <SendHorizontal className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={2} aria-hidden="true" />
          Post
        </Button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-start gap-2">
        <Face person={ME} className="mt-1.5" />
        {/*
        The composer is an `InputGroup` — Imran, 2026-08-22: the chat "is
        still not following the shadcn UI code or structure", with the
        reference showing exactly this assembly.

        It was a bordered `<div>` holding a textarea and three buttons, with
        the border, the focus ring and the packing written out by hand. The
        primitive owns all three now, and the arrangement follows the
        reference's: **the text on its own line, the controls on a row
        underneath** (`align="block-end"`), rather than buttons sharing the
        line and being shoved sideways as the field grows.

        The two ways of attaching something collapse into one `+` with a menu,
        which is the reference's shape and also the honest one — "add a file"
        and "record a voice note" are two answers to one question, and two
        permanent buttons made them look like two features.
        */}
        <InputGroup className="flex-1">
          <InputGroupTextarea
            ref={fieldRef}
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
            className="leading-5"
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
          {/*
          One line, and the right-hand control is either the microphone or the
          send — never both — Imran, 2026-08-22, with a messenger's composer
          as the reference.

          The first pass put the controls on a row *beneath* the field, which
          is right for an assistant's prompt box (several persistent controls,
          a long message) and wrong for a conversation, where the composer is
          furniture you want to take up one line until you are actually using
          it.

          **The swap is the idea.** A microphone and a send button never both
          apply: with nothing written, the useful act is to speak; the moment
          there is something to send, it is to send it. Showing both means one
          of them is always the wrong answer sitting in the way of the right
          one. So the trailing slot holds exactly one control and it changes
          with the state of the field.

          The `+` stays on the left and holds what you can *attach* — a file,
          a link (DES-161 made those real), a person to mention — which is the
          division the reference draws too.
          */}
          <InputGroupAddon align="inline-start">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <InputGroupButton size="icon-sm" aria-label="Add to this message">
                    <Plus />
                  </InputGroupButton>
                }
              />
              <DropdownMenuContent align="start" side="top" className="w-52">
                <DropdownMenuItem onClick={() => fileInput.current?.click()}>
                  <Paperclip />
                  Add a file
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowLink(true)}>
                  <Link2 />
                  Add a link
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setText((current) => `${current}${current.endsWith(" ") || !current ? "" : " "}@`)
                    fieldRef.current?.focus()
                  }}
                >
                  <UserRound />
                  Mention someone
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </InputGroupAddon>
          <InputGroupAddon align="inline-end">
            {hasSomethingToSend ? (
              <InputGroupButton
                size="icon-sm"
                variant="commit"
                aria-label="Post comment"
                onClick={(event) => {
                  event.stopPropagation()
                  submitText()
                }}
              >
                <SendHorizontal />
              </InputGroupButton>
            ) : (
              <InputGroupButton
                size="icon-sm"
                aria-label="Record a voice message"
                onClick={() => void startRecording()}
              >
                <Mic />
              </InputGroupButton>
            )}
          </InputGroupAddon>
          {/* A link, taken in the composer rather than in a second place —
              the same shape the card's attachment picker uses (DES-161). It
              is the one thing that gives the composer a second line, and only
              while somebody is pasting into it. */}
          {showLink ? (
            <InputGroupAddon align="block-end" className="pt-0">
              <InputGroupInput
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                value={link}
                placeholder="Paste a link"
                aria-label="Message link"
                onChange={(event) => setLink(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") { setLink(""); setShowLink(false) }
                  if (event.key !== "Enter") return
                  event.preventDefault()
                  const trimmed = link.trim()
                  if (!trimmed) return
                  const href = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
                    ? trimmed
                    : `https://${trimmed}`
                  let host = trimmed
                  let last = ""
                  try {
                    const parsed = new URL(href)
                    host = parsed.hostname.replace(/^www\./, "")
                    last = parsed.pathname.split("/").filter(Boolean).pop() ?? ""
                  } catch { /* keep what they typed */ }
                  setFiles((current) => [
                    ...current,
                    { name: decodeURIComponent(last) || host, meta: host, kind: "link", url: href },
                  ])
                  setLink("")
                  setShowLink(false)
                }}
                className="h-7 px-2"
              />
            </InputGroupAddon>
          ) : null}
        </InputGroup>
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
                (() => {
                  const ChipIcon = FILE_ICON[file.kind] ?? Paperclip
                  return (
                    <ChipIcon
                      className="size-3.5 text-[var(--color-graphite-500)]"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  )
                })()
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

/* One reaction, not a set (Imran, 2026-08-18): a like is the whole of what a
   team needs to say "seen, agreed" without writing. A palette of six asks a
   person to *choose a feeling* before they can agree, which is more thought
   than the gesture is worth — and it puts emoji, a vocabulary Dana owns
   nowhere else, into the middle of the product's typography. The like is
   drawn with the icon family like everything else. */
const LIKE = "like"

function toggleReaction(comment: ConceptComment, emoji: string = LIKE): ConceptComment {
  const current = comment.reactions ?? []
  const existing = current.find((r) => r.emoji === emoji)
  let next: NonNullable<ConceptComment["reactions"]>
  if (!existing) {
    next = [...current, { emoji, count: 1, mine: true }]
  } else if (existing.mine) {
    next = current
      .map((r) =>
        r.emoji === emoji ? { ...r, count: r.count - 1, mine: false } : r,
      )
      .filter((r) => r.count > 0)
  } else {
    next = current.map((r) =>
      r.emoji === emoji ? { ...r, count: r.count + 1, mine: true } : r,
    )
  }
  return { ...comment, reactions: next.length ? next : undefined }
}

function CommentRow({
  comment,
  isReply = false,
  replyTo,
  onReply,
  onDelete,
  onUpdate,
}: {
  comment: ConceptComment
  isReply?: boolean
  /* The message this answers, for the quoted stub. */
  replyTo?: { author: string; excerpt: string }
  onReply?: () => void
  onDelete: () => void
  onUpdate: (next: ConceptComment) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body ?? "")

  function commitEdit() {
    const body = draft.trim()
    if (body && body !== comment.body) {
      onUpdate({ ...comment, body, edited: true })
    }
    setEditing(false)
  }

  /* My own messages sit on the right, the way every conversation surface
     people already use draws them (Imran's direction): the face moves to the
     right edge, the header and body anchor right, and the hover actions
     mirror to the message's inner side. Everyone else stays on the left. */
  const mine = Boolean(comment.mine)

  return (
    /*
    The turn, as `Message` — Imran, 2026-08-22, with shadcn's own messaging
    primitives as the reference.

    The side used to be re-decided in six places, each with its own
    `mine && "flex-row-reverse"`, so alignment was a rule six spans had to
    remember rather than a property of the turn. `Message` owns it once as a
    data attribute and every part reads it from there — which is the same
    move DES-154 keeps making, applied inside one component.
    */
    <Message align={mine ? "end" : "start"} className="group/comment px-1 py-1.5">
      <MessageAvatar>
        <Face person={comment.author} dense={isReply} />
      </MessageAvatar>
      <MessageContent className="w-full">
        {/* Who said it, above — `MessageHeader`, which stays start-aligned
            on both sides so a name is always in the same place. The time and
            "edited" ride it because they are facts about the saying, not
            about what happened afterwards. */}
        <MessageHeader className="h-5">
          <span className="font-medium text-[var(--color-graphite-700)]">
            {comment.author.name}
          </span>
          <span>
            {comment.at}
            {comment.edited ? " · edited" : ""}
          </span>
        </MessageHeader>
        {/*
        What this replies to, quoted — Imran, 2026-08-22: a reply "incorrectly
        showing as a regular message instead of showing as it is replied to a
        message."

        The indent was supposed to carry that, and it cannot: a reply of my
        own is right-aligned by DES-143's rule that mine sits on the right, and
        right-alignment cancels a left indent exactly. Two mechanisms were
        fighting and the alignment won, so my reply to Sara looked like a new
        remark addressed to nobody.

        A quoted stub is independent of both. It states the thing the indent
        was only implying, it survives either alignment and either tone, and
        it is the treatment every conversation surface people already use has
        settled on. One line, clipped, quiet: enough to know what is being
        answered without re-reading it.
        */}
        {replyTo ? (
          <span
            className={cn(
              /* Capped, because a quote wider than the thing it introduces
                 reads as the message and pushes the reply into a footnote. */
              "mt-1 flex max-w-[min(22rem,80%)] items-center gap-1.5 border-[var(--color-graphite-300)] text-[12px] leading-4 text-[var(--color-graphite-500)]",
              mine ? "flex-row-reverse border-r-2 pr-2" : "border-l-2 pl-2",
            )}
          >
            <span className="shrink-0 font-medium text-[var(--color-graphite-600)]">
              {replyTo.author}
            </span>
            <span className="min-w-0 truncate">{replyTo.excerpt}</span>
          </span>
        ) : null}
        {editing ? (
          /* The bubble's own editor, on the same primitive as the composer.
             `bare` again, because the bubble is the frame here exactly as the
             composer's bordered row is above it. */
          <Textarea
            bare
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            value={draft}
            rows={1}
            aria-label="Edit comment"
            onChange={(event) => setDraft(event.target.value)}
            onFocus={(event) =>
              event.currentTarget.setSelectionRange(
                event.currentTarget.value.length,
                event.currentTarget.value.length,
              )
            }
            onBlur={commitEdit}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                commitEdit()
              }
              if (event.key === "Escape") {
                event.preventDefault()
                setDraft(comment.body ?? "")
                setEditing(false)
              }
            }}
            className="mt-0.5 block rounded-[14px] bg-card px-3 py-1.5 leading-5 ring-2 ring-[var(--color-dana-accent-600)]"
          />
        ) : comment.body ? (
          /* The actions sit level with the message, on its outer side. They
             used to ride the name-and-time line, which left them floating
             above the thing they act on (Imran, 2026-08-18). */
          <span className={cn("flex max-w-full items-center gap-1", mine && "flex-row-reverse")}>
          {/* Whose message this is, said in tone rather than in colour
             (Imran, 2026-08-18): mine sits on graphite-900 with light text,
             everyone else's on the graphite-50 wash. No hue enters the
             thread — cobalt stays the interaction colour it has been since
             DES-016, and a message is not an interaction.

             The corner nearest its own author tightens to 4px. It is the
             one detail that makes a container read as *spoken by* somebody
             rather than as a box, and it costs a single class. */}
          {/* Tone, never hue (DES-143) — which is exactly the split
              `Bubble`'s two variants carry, so the rule now lives in the
              primitive instead of in a ternary here. */}
          <Bubble variant={mine ? "default" : "muted"} className="mt-0.5">
            <BubbleContent>{comment.body}</BubbleContent>
            {comment.reactions?.length ? (
              <BubbleReactions
                aria-label={comment.reactions
                  .map((r) => `${r.count} like${r.count === 1 ? "" : "s"}`)
                  .join(", ")}
              >
                {comment.reactions.map((reaction) => (
                  /* A reaction is a toggle, so it is the system's button
                     pressed or not, rather than a pill with its own two
                     states hand-written beside every other pill. */
                  <Button
                    key={reaction.emoji}
                    variant={mine ? "outline" : reaction.mine ? "secondary" : "outline"}
                    size="xs"
                    aria-pressed={reaction.mine || undefined}
                    onClick={() => onUpdate(toggleReaction(comment, reaction.emoji))}
                    className={cn(
                      "rounded-full tabular-nums",
                      mine &&
                        "border-white/25 bg-white/10 text-[var(--color-graphite-0)] hover:bg-white/20",
                    )}
                  >
                    <ThumbsUp className={cn(reaction.mine && "fill-current")} strokeWidth={1.75} aria-hidden="true" />
                    {reaction.count}
                  </Button>
                ))}
              </BubbleReactions>
            ) : null}
          </Bubble>
            <span
              className={cn(
                "flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/comment:opacity-100 focus-within:opacity-100",
                T_FAST,
              )}
            >
              <IconAction dense
                icon={ThumbsUp}
                label={comment.reactions?.some((r) => r.mine) ? "Remove like" : "Like"}
                onClick={() => onUpdate(toggleReaction(comment))}
              />
              {onReply ? <IconAction dense icon={ReplyIcon} label="Reply" onClick={onReply} /> : null}
              {comment.mine ? (
                <IconAction dense
                  icon={Pencil}
                  label="Edit comment"
                  onClick={() => {
                    setDraft(comment.body ?? "")
                    setEditing(true)
                  }}
                />
              ) : null}
              {comment.mine ? (
                <IconAction dense icon={Trash2} label="Delete comment" tone="danger" onClick={onDelete} />
              ) : null}
            </span>
          </span>
        ) : null}
        {/* Media is not bubbled: a voice note and a file row are already
            self-contained objects with their own edges, and a container
            inside a container is how a thread starts looking cluttered.
            Their side is said by alignment alone. */}
        {comment.voice ? <VoiceNote voice={comment.voice} /> : null}
        {comment.files ? (
          <span className="flex w-full flex-col">
            <CommentFiles files={comment.files} />
          </span>
        ) : null}
      </MessageContent>
    </Message>
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

  function updateComment(next: ConceptComment) {
    onChange(
      comments.map((c) =>
        c.id === next.id
          ? next
          : c.replies?.some((r) => r.id === next.id)
            ? {
                ...c,
                replies: c.replies.map((r) => (r.id === next.id ? next : r)),
              }
            : c,
      ),
    )
  }

  const thread = (
    <>
      {comments.map((comment) => (
        <div key={comment.id}>
          <CommentRow
            comment={comment}
            onReply={() => setReplyingTo(comment.id)}
            onDelete={() => onChange(comments.filter((c) => c.id !== comment.id))}
            onUpdate={updateComment}
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
                  replyTo={{
                    author: comment.author.name,
                    excerpt:
                      comment.body ??
                      (comment.voice ? "Voice note" : "Attachment"),
                  }}
                  onDelete={() =>
                    onChange(
                      comments.map((c) =>
                        c.id === comment.id
                          ? { ...c, replies: c.replies?.filter((r) => r.id !== reply.id) }
                          : c,
                      ),
                    )
                  }
                  onUpdate={updateComment}
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
