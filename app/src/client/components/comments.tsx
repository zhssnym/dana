/*
The conversation component, over the seam in `lib/thread.ts`. That module's
header carries the argument; this list is what a reader needs to know here.

**The writer is the array.** `onChange(next)` is called at every one of its
sites, and the page hands it `applyThreadChange`, which turns the array into
7.14's four routes. `onChange` is threaded through the row, the reply composer
and `toggleReaction`, so a version taking four callbacks would have to be
rewritten at each.

**`ME` is the session.** The composer's own face and a comment made in this
session both need a person. `useViewerPerson()` is that person, read from the
cache every page already holds.

**Voice is behind a prop that defaults to off.** `files.kind` admits `'voice'`,
but what is owed is a duration, a player and a decision about transcription. So
the microphone is not drawn (a dead control is worse than an absent one) and
`MediaRecorder`, `VoiceNote` and the recording bar stay here unreferenced by
default, so that turning voice on flips one default.

**One file per comment, of any kind.** 7.14 takes a single `file_id` on a
comment, so a second attachment has no route and the composer takes one. The
read carries 4.16's columns (`files: { id, name, mime, bytes }[]`),
`lib/thread.ts` draws the tile, the name and the meta line from them, and the
composer offers any file 10.3 admits. The picture-only branch below stays for a
file that arrives nameless.

**Somebody other than the author may delete.** 7.14 gives a comment's deletion
to its author **or** to a member who may moderate the folder
(`comment.moderate`, Full control's; ownership is custody), and
`routes/conversation.ts` resolves exactly those two. The answer rides the
comment itself rather than the thread, so the card mount and the folder page
cannot disagree. This file only reads `deletable`.

**Edit and Like read `editable` and `likeable`.** `comment.mutate.own` is
authorship **and** currently holding Can comment or better, and `comment.like`
is Can comment's, so a member reduced to Can view is not offered the pencil or
the thumb. Both are answered per comment by `lib/thread.ts` in the same place
and for the same reason as `deletable`, and each falls back to the lab's answer
when a surface supplies none (AC-518, AC-790).

**An existing reaction pill is disabled rather than hidden**, unlike the three
hover controls. It carries a count somebody below the bar may still read, and
Can view reads everything in a thread and changes nothing; removing the pill
would hide the fact as well as the act (#268).
*/
/*
One conversation surface, wherever a conversation happens.

Comments on a task and a folder's conversation are deliberately one component: a
thread copied into a second place is a thread that will one day disagree with
itself. The card renders it as a block, the folder page renders it as a block or
as a side panel, and the differences between those are layout, never behaviour.

What a comment can be: words, files riding along, or a voice note. Replies are
the same shape nested one level, and one level is a decision rather than a limit
hit, a task's conversation is a short thread between a handful of people, and
unbounded nesting is how a card grows a forum inside it.

A voice note recorded here goes through the actual microphone and actually plays
back. A *fixture* voice note sweeps its progress silently.
*/

import { useEffect, useRef, useState } from "react"

import {
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
} from "../lib/icons.js"
import { Face } from "./person-face.js"
import { IconAction } from "./icon-action.js"
import { Textarea } from "./ui/textarea.js"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupTextarea,
} from "./ui/input-group.js"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.js"
import { Button } from "./ui/button.js"
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageHeader,
} from "./ui/message.js"
import { type ConceptComment } from "../tasks/task-model.js"
/* Seam two: the session, never `PEOPLE`. See the header. */
import { useViewerPerson } from "../lib/thread.js"
import { cn } from "./ui/utils.js"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"


/*
The thread reads at the prose tier, 12/20: the message body, the composer and
the card's Notes field all sit there together. The composer must not be smaller
or larger than the messages it writes: you type into the thing you are going to
read, and those two must agree.
*/



/* ------------------------------------------------------------- the voice -- */

/* A deterministic waveform, so a fixture's bars do not reshuffle on every
   render and a recording's do not depend on a real analysis of the audio.
   Seeded LCG, heights 4..18. */
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
waveform itself rather than adding a second track under it, the wave is
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
      className="mt-1 inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card py-1 pr-3 pl-1"
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
                ? "bg-foreground"
                : "bg-muted-foreground/40",
            )}
          />
        ))}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
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
  /* A link on a message wears the link glyph, like a link on a task; a
     paperclip is the mark for the other kind of thing you can attach. */
  link: Link2,
}

/* A file on a comment renders as the Attachments block already renders a file:
   a 32px tile, the name, the meta line. The markup is restated rather than
   imported because task-card imports this module; a shared file row would need
   a neutral home both call. */
function CommentFiles({ files }: { files: NonNullable<ConceptComment["files"]> }) {
  return (
    <span className="mt-1 flex flex-col">
      {files.map((file) => {
        const Icon = FILE_ICON[file.kind] ?? Paperclip
        /* Seam four: a file this client did not itself just choose arrives as
           a bare uuid, so it has a preview and no words. The bytes are the
           whole of what can be said, and a picture says it. */
        if (file.preview && !file.name) {
          return (
            <img
              key={file.preview}
              src={file.preview}
              alt="Attached image"
              /*
              The space this picture will take, reserved before it lands
              (issue #108). It is the one attachment here drawn at a height the
              picture decides — the tile in the row below is a fixed 32px
              square and has nothing to reserve — so it is the one that made
              the thread jump under itself when the bytes arrived.

              `max-h-64` still caps it and always did: the reservation is the
              height the picture will actually occupy rather than its whole
              shape, and a very tall one is clamped before and after the load
              alike.

              **No style at all where the file was never measured, rather than
              a 16 by 9 fallback.** This element has never reserved anything,
              so a picture takes its own proportion once the bytes arrive;
              imposing a default shape on it would crop every attachment
              posted before migration 0009, and nothing is backfilled.
              `lib/page-images.ts` splits the two readings for this reason.
              */
              style={file.ratio === undefined ? undefined : { aspectRatio: file.ratio }}
              className="mt-1 max-h-64 w-full rounded-lg border border-border object-cover"
            />
          )
        }
        return (
          <span key={file.name} className="flex h-11 items-center gap-2.5">
            {file.preview ? (
              <img
                src={file.preview}
                alt=""
                className="size-8 shrink-0 rounded-sm border border-border object-cover"
              />
            ) : (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border bg-muted">
                <Icon
                  className="size-4 text-muted-foreground"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-foreground">
                {file.name}
              </span>
              <span className="block text-xs text-muted-foreground">
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

/*
What the composer says to somebody who may read this conversation and not write
in it (#268).

**The composer is disabled rather than hidden**, the same reasoning as the
reaction pill above: it carries a fact a Can-view member may read — that this
conversation takes comments, and what standing that needs — and hiding it would
hide the fact with the act. The sentence stands in for the placeholder rather
than sitting beside it, so the composer stays one quiet line and says the one
thing there is to say.
*/
const COMMENTING_NEEDS_STANDING =
  "You can read this conversation. Commenting needs Can comment."

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
The composer. At rest it is one quiet line, a face and a field, because a
card's conversation must not out-shout the task above it. The controls arrive
in the field's trailing slot: attach, voice, and send once there is something
to send.

Recording replaces the field rather than opening anything: a pulsing mark, the
clock counting up, live bars, and two ways out, cancel, which discards, and
stop, which posts. The microphone is real (MediaRecorder), so a voice note
made here plays back as itself; where the microphone is refused or absent the
control says so in words under the field rather than pretending.
*/
function Composer({
  placeholder,
  autoFocus = false,
  onSubmit,
  onCancel,
  voice = false,
  maxFiles = 1,
  disabled = false,
  attach = true,
}: {
  placeholder: string
  /* Whether the "+" (file, link, mention) is drawn. The task panel keeps a
     task's files in its one Attachments section, so its thread passes false. */
  attach?: boolean
  autoFocus?: boolean
  /* A caller that returns a promise gets the typed text back if it rejects:
     the composer clears at once, and a refused post (a Discussion resolved
     meanwhile, #212) must not lose what was written. */
  onSubmit: (
    comment: Omit<ConceptComment, "id" | "author" | "at" | "mine">,
  ) => void | Promise<unknown>
  onCancel?: () => void
  /* Seam three: B5 defers voice, so the microphone is not drawn and the
     recorder below it is kept whole for the package that lands it. */
  voice?: boolean
  /* Seam four: 7.14 carries one `file_id` per comment. */
  maxFiles?: number
  /* Seam six (issue #268): the viewer reads this conversation and may not
     write in it. The field is disabled and says so, the attach menu and the
     trailing control are not drawn, and `submitText` refuses — three answers
     rather than one, because a disabled textarea still takes a programmatic
     Enter and the composer's own keydown handler is the thing that posts.
     Nothing about the enabled composer moves. */
  disabled?: boolean
}) {
  const me = useViewerPerson()
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
  /* Which control the trailing slot shows. Not "is the field empty", a
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
    if (disabled) return
    const body = text.trim()
    if (!body && files.length === 0) return
    const sentText = text
    const sentFiles = files
    const sent = onSubmit({ body: body || undefined, files: files.length ? files : undefined })
    setText("")
    setFiles([])
    if (sent !== undefined) {
      sent.catch(() => {
        setText((now) => (now === "" ? sentText : now))
        setFiles((now) => (now.length === 0 ? sentFiles : now))
      })
    }
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
      setMicError("Microphone unavailable, voice notes need one.")
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
      /* Seam four: the bytes ride along (`file`) so `lib/thread.ts` can post
         them, and the list is capped at what 7.14 will carry. */
      ...Array.from(list).slice(0, Math.max(0, maxFiles - current.length)).map((file) => {
        const kind = fileKind(file.type)
        return {
          name: file.name,
          meta: `${file.type.split("/")[1]?.toUpperCase() ?? "FILE"} · ${readableSize(file.size)}`,
          kind,
          preview: kind === "image" ? URL.createObjectURL(file) : undefined,
          file,
        }
      }),
    ])
  }

  if (recording) {
    /* Graphite, not danger: recording is an activity, not a loss, and the
       palette's guardrails reserve danger for loss. The running timer alone
       carries the state; nothing pulses. */
    return (
      <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-muted py-1 pr-1 pl-3">
        <span className="flex-1 text-xs font-medium text-foreground tabular-nums">
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
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
        <Face person={me} className="mt-1.5" />
        {/*
        The composer is an `InputGroup`: the primitive owns the border, the
        focus ring and the packing. **The text is on its own line, the controls
        on a row underneath** (`align="block-end"`), rather than buttons sharing
        the line and being shoved sideways as the field grows.

        The two ways of attaching something collapse into one `+` with a menu:
        "add a file" and "record a voice note" are two answers to one question,
        and two permanent buttons would make them look like two features.
         */}
        <InputGroup className="flex-1">
          <InputGroupTextarea
            ref={fieldRef}
            value={text}
            rows={1}
            autoFocus={autoFocus && !disabled}
            disabled={disabled}
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
            /* One file, of any kind. See the header. */
            className="sr-only"
            onChange={(event) => {
              takeFiles(event.target.files)
              event.target.value = ""
            }}
          />
          {/*
          One line, and the right-hand control is either the microphone or the
          send, never both, like a messenger's composer: in a conversation the
          composer is furniture you want to take up one line until you are
          actually using it.

          **The swap is the idea.** A microphone and a send button never both
          apply: with nothing written, the useful act is to speak; the moment
          there is something to send, it is to send it. Showing both means one
          of them is always the wrong answer sitting in the way of the right
          one. So the trailing slot holds exactly one control and it changes
          with the state of the field.

          The `+` stays on the left and holds what you can *attach*: a file, a
          link, a person to mention.
           */}
          {disabled || !attach ? null : (
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
                <DropdownMenuItem
                  disabled={files.length >= maxFiles}
                  onClick={() => fileInput.current?.click()}
                >
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
          )}
          <InputGroupAddon align="inline-end">
            {disabled ? null : hasSomethingToSend ? (
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
            ) : voice ? (
              <InputGroupButton
                size="icon-sm"
                aria-label="Record a voice message"
                onClick={() => void startRecording()}
              >
                <Mic />
              </InputGroupButton>
            ) : null}
          </InputGroupAddon>
          {/* A link, taken in the composer rather than in a second place, the
              same shape the card's attachment picker uses. It is the one thing
              that gives the composer a second line, and only while somebody is
              pasting into it. */}
          {showLink ? (
            <InputGroupAddon align="block-end" className="pt-0">
              <InputGroupInput
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
              className="inline-flex h-7 max-w-52 items-center gap-1.5 rounded-md border border-border bg-card px-2"
            >
              {file.preview ? (
                <img src={file.preview} alt="" className="size-4 rounded-sm object-cover" />
              ) : (
                (() => {
                  const ChipIcon = FILE_ICON[file.kind] ?? Paperclip
                  return (
                    <ChipIcon
                      className="size-3.5 text-muted-foreground"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  )
                })()
              )}
              <span className="truncate text-xs text-foreground">
                {file.name}
              </span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                className={cn(
                  "flex size-4 items-center justify-center rounded text-muted-foreground hover:text-foreground",
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
        <p className="mt-1 ml-8 text-xs text-destructive" role="alert">
          {micError}
        </p>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------ the thread -- */

/* One reaction, not a set: a like is the whole of what a team needs to say
   "seen, agreed" without writing. A palette of six asks a person to *choose a
   feeling* before they can agree, which is more thought than the gesture is
   worth, and it puts emoji, a vocabulary Dana owns nowhere else, into the
   middle of the product's typography. The like is drawn with the icon family
   like everything else. */
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


  return (
    /*
    The turn, as `Message`, after shadcn's own messaging primitives.

    `Message` owns which side a turn sits on, once, as a data attribute, and
    every part reads it from there, so alignment is a property of the turn
    rather than a rule every span has to remember.
    */
    <Message align="start" className="group/comment px-1 py-1.5">
      <MessageAvatar>
        <Face person={comment.author} dense={isReply} />
      </MessageAvatar>
      <MessageContent className="w-full">
        {/* Who said it, above, `MessageHeader`, which stays start-aligned
            on both sides so a name is always in the same place. The time and
            "edited" ride it because they are facts about the saying, not
            about what happened afterwards. */}
        <MessageHeader className="h-5">
          <span className="font-medium text-foreground">
            {comment.author.name}
          </span>
          <span>
            {comment.at}
            {comment.edited ? " · edited" : ""}
          </span>
        </MessageHeader>
        {/*
        What this replies to, quoted, so a reply shows as a reply rather than as
        a regular message.

        An indent cannot carry that: a reply of my own is right-aligned, because
        mine sits on the right, and right-alignment cancels a left indent
        exactly, so my reply to Sara would look like a new remark addressed to
        nobody.

        A quoted stub is independent of both. It states the thing the indent was
        only implying, it survives either alignment and either tone, and it is
        the treatment every conversation surface people already use has settled
        on. One line, clipped, quiet: enough to know what is being answered
        without re-reading it.
         */}
        {replyTo ? (
          <span
            className={cn(
              /* Capped, because a quote wider than the thing it introduces
                 reads as the message and pushes the reply into a footnote. */
              "mt-1 flex max-w-[min(22rem,80%)] items-center gap-1.5 border-border text-xs text-muted-foreground",
              /* Author, then what they said, on either side. */
              "border-l-2 pl-2",
            )}
          >
            <span className="shrink-0 font-medium text-muted-foreground">
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
            className="mt-0.5 block rounded-sm bg-card px-3 py-1.5 leading-5 ring-2 ring-ring"
          />
        ) : comment.body ? (
          /* The actions sit level with the message, on its outer side, rather
             than on the name-and-time line, where they would float above the
             thing they act on. */
          <span className="flex max-w-full items-start gap-1">
          {/* Plain text on the page, every author alike: a thread is
              something people read, not a stack of containers. Who said it is
              the name above; nothing is filled, nothing is inverted. */}
          <span className="mt-0.5 flex min-w-0 flex-1 flex-col gap-1">
            <span className="whitespace-pre-wrap break-words text-sm text-foreground">
              {comment.body}
            </span>
            {comment.reactions?.length ? (
              <span
                className="flex flex-wrap gap-1"
                aria-label={comment.reactions
                  .map((r) => `${r.count} like${r.count === 1 ? "" : "s"}`)
                  .join(", ")}
              >
                {comment.reactions.map((reaction) => (
                  <Button
                    key={reaction.emoji}
                    variant={reaction.mine ? "secondary" : "ghost"}
                    size="xs"
                    aria-pressed={reaction.mine || undefined}
                    disabled={(comment.likeable ?? true) === false}
                    onClick={() => onUpdate(toggleReaction(comment, reaction.emoji))}
                    className="tabular-nums text-muted-foreground"
                  >
                    <ThumbsUp className={cn(reaction.mine && "fill-current")} strokeWidth={1.75} aria-hidden="true" />
                    {reaction.count}
                  </Button>
                ))}
              </span>
            ) : null}
          </span>
            <span
              className={cn(
                "flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/comment:opacity-100 focus-within:opacity-100",
                T_FAST,
              )}
            >
              {(comment.likeable ?? true) ? (
                <IconAction dense
                  icon={ThumbsUp}
                  label={comment.reactions?.some((r) => r.mine) ? "Remove like" : "Like"}
                  onClick={() => onUpdate(toggleReaction(comment))}
                />
              ) : null}
              {/* Replying is `comment.create`, the same act as a first comment,
                  and it is hidden rather than disabled because it is one of
                  this row's own controls: the composer below carries the fact
                  that the conversation takes comments, so a second greyed
                  control per row would say it four more times (#268). */}
              {onReply && (comment.replyable ?? true) ? (
                <IconAction dense icon={ReplyIcon} label="Reply" onClick={onReply} />
              ) : null}
              {(comment.editable ?? comment.mine) ? (
                <IconAction dense
                  icon={Pencil}
                  label="Edit comment"
                  onClick={() => {
                    setDraft(comment.body ?? "")
                    setEditing(true)
                  }}
                />
              ) : null}
              {/* 7.14 gives a deletion to the author or to a member who may
                  moderate. The answer rides the comment rather than the thread,
                  so that the card's mount and the folder page's cannot
                  disagree. */}
              {(comment.deletable ?? comment.mine) ? (
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
  canComment = true,
  closedReason,
  attachments = true,
}: {
  comments: ConceptComment[]
  /** Whether the composer offers to attach a file or a link. */
  attachments?: boolean
  /* May return a promise; a top-level post that rejects gives the composer
     its text back. */
  onChange: (next: ConceptComment[]) => void | Promise<unknown>
  placeholder?: string
  /* Whether this viewer may write into the conversation at all
     (`comment.create`, Can comment's; issue #268).

     **A prop rather than a field on a comment, and that is not an
     inconsistency.** Reply is per comment and rides `replyable`; the composer
     belongs to the thread and exists when the thread holds nothing at all, so
     there is no comment to carry an answer for it. It defaults to true, which
     is the lab's answer and what every surface that has not worked out the
     viewer's Access gets. */
  canComment?: boolean
  /* A conversation that takes no comments from anyone right now (a resolved
     Discussion, #212): the composer is disabled and says this instead of the
     standing sentence, which would blame the viewer's Access. */
  closedReason?: string
  /* "comment" in a card, "message" in a chat panel, the only wording that
     differs between the surfaces. */
  emptyWord?: string
  /* "block" flows with the page; "pinned" fills its container, scrolls the
     thread, and keeps the composer at the foot, the dock, the panel and
     the full-screen surface all read that way. */
  layout?: "block" | "pinned"
}) {
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const me = useViewerPerson()
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
      author: me,
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
            /* Indent and the dense face say "belongs to"; a rail would be a
               rule inside the card, and the card has no rules inside it. */
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
                    attach={attachments}
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
      attach={attachments}
      disabled={!canComment || closedReason !== undefined}
      placeholder={
        closedReason !== undefined
          ? closedReason
          : canComment
            ? comments.length === 0
              ? `Write the first ${emptyWord}`
              : placeholder
            : COMMENTING_NEEDS_STANDING
      }
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
        <div className="shrink-0 border-t border-border px-3 py-2.5">
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
