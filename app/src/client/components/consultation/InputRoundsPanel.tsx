/*
"Ask for input" inside a Discussion (issue #321, 7.29).

One open round at a time, closed rounds kept as history beneath it. The three
modes are response shapes, not Discussion types, so one panel draws all three
and only the response control and the response list differ.

What this panel deliberately does not draw, because #321 forbids it: a winner,
a leading option, a percentage, a score, or any tally of advice or concerns.
A choose round shows plain per-option counts (the server's `choice_counts`)
and, like every mode, who said what: M1 has no anonymous input, and every
member who can read the Discussion may read every response.

Permissions: `canOpen` is the caller's answer for `input_round.open`, which
has the same rule as `input_round.close`, so it gates both. Responding is
Can comment+, read here from the viewer's own `my_access` on the Folder.
`frozen` (resolved or in Trash) turns every control off; the server's 409 is
still the authority, and a refused write refetches the rounds so the screen
catches up with whatever made it refuse (another member's round, a resolve).
*/
import { useState } from 'react'

import { X } from 'lucide-react'

import type {
  InputMode,
  InputResponse,
  InputRound,
  PutInputResponseBody,
} from '../../../shared/consultation-input.js'
import {
  INPUT_OPTIONS_MAX,
  INPUT_OPTIONS_MIN,
  INPUT_OPTION_LABEL_MAX,
  INPUT_PROMPT_MAX,
  INPUT_RESPONSE_BODY_MAX,
} from '../../../shared/consultation-input.js'
import { atLeast } from '../../../shared/folder-actions.js'
import {
  useCloseInputRound,
  useOpenInputRound,
  usePutInputResponse,
  useWithdrawInputResponse,
} from '../../api/mutations.js'
import { ApiError } from '../../api/http.js'
import { useDiscussion, useFolder, useInputRounds, useMe } from '../../api/queries.js'
import { initialsOf } from '../../parts/presenters.js'
import { PersonFace } from '../person-face.js'
import { Button } from '../ui/button.js'
import { READ_FAILED, TRY_AGAIN } from '../ui/copy.js'
import { Input } from '../ui/input.js'
import { Textarea } from '../ui/textarea.js'
import { cn } from '../ui/utils.js'

const MODE_LABEL: Record<InputMode, string> = {
  choose: 'Choose',
  advice: 'Advice',
  concerns: 'Concerns',
}

const MODE_HINT: Record<InputMode, string> = {
  choose: 'Everyone picks one of the options you list.',
  advice: 'Everyone writes their advice in their own words.',
  concerns: 'Everyone says whether they have a concern, and why.',
}

interface Person {
  readonly name: string
  /** The real name, which the face's initials and tint are drawn from, so
   * the viewer's own face matches theirs everywhere else. */
  readonly faceName: string
  readonly initials: string
  readonly image: string | null
}

type People = (id: string) => Person

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  })
}

export function InputRoundsPanel(props: {
  discussionId: string
  frozen: boolean
  canOpen: boolean
}): React.JSX.Element {
  const { discussionId, frozen, canOpen } = props
  const rounds = useInputRounds(discussionId)
  const discussion = useDiscussion(discussionId)
  const folderId = discussion.data?.folder_id ?? ''
  const folder = useFolder(folderId, folderId !== '')
  const me = useMe()
  const [asking, setAsking] = useState(false)
  const [showPast, setShowPast] = useState(false)

  const myId = me.data?.user.id ?? null
  const canRespond =
    !frozen && folder.data !== undefined && atLeast(folder.data.my_access, 'can_comment')
  const canSteer = canOpen && !frozen

  const people: People = (id) => {
    if (id === myId) {
      return {
        name: 'You',
        faceName: me.data?.user.display_name ?? 'You',
        initials: initialsOf(me.data?.user.display_name ?? 'You'),
        image: me.data?.user.avatar_url ?? null,
      }
    }
    const member = folder.data?.members.find((m) => m.user.id === id)
    if (member === undefined) return { name: 'Former member', faceName: 'Former member', initials: '?', image: null }
    const name = member.user.display_name ?? 'Member'
    return { name, faceName: name, initials: initialsOf(name), image: member.user.avatar_url }
  }

  if (rounds.isPending) {
    return (
      <section aria-label="Input rounds" className="text-xs text-muted-foreground">
        Loading input…
      </section>
    )
  }
  if (rounds.isError) {
    return (
      <section aria-label="Input rounds" className="flex items-center gap-2 text-xs text-muted-foreground">
        {READ_FAILED}
        <Button variant="link" size="sm" onClick={() => void rounds.refetch()}>
          {TRY_AGAIN}
        </Button>
      </section>
    )
  }

  const all = rounds.data.input_rounds
  const open = all.find((r) => r.state === 'open') ?? null
  const past = all.filter((r) => r.state === 'closed')
  const refetch = (): void => void rounds.refetch()

  return (
    <section aria-label="Input rounds" className="flex flex-col gap-3">
      {open !== null ? (
        <RoundCard
          round={open}
          people={people}
          canRespond={canRespond}
          canClose={canSteer}
          onRefused={refetch}
        />
      ) : asking && canSteer ? (
        <AskForm
          discussionId={discussionId}
          onDone={() => setAsking(false)}
          onRefused={refetch}
        />
      ) : canSteer ? (
        <div>
          <Button variant="outline" size="sm" onClick={() => setAsking(true)}>
            Ask for input
          </Button>
        </div>
      ) : null}

      {past.length > 0 ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="self-start text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={showPast}
            onClick={() => setShowPast((v) => !v)}
          >
            {showPast ? 'Hide' : 'Show'} earlier input ({past.length})
          </button>
          {showPast
            ? past.map((round) => (
                <RoundCard
                  key={round.id}
                  round={round}
                  people={people}
                  canRespond={false}
                  canClose={false}
                  onRefused={refetch}
                />
              ))
            : null}
        </div>
      ) : null}
    </section>
  )
}

/* ------------------------------------------------------------------ *
 * Opening a round
 * ------------------------------------------------------------------ */

function AskForm({
  discussionId,
  onDone,
  onRefused,
}: {
  readonly discussionId: string
  readonly onDone: () => void
  readonly onRefused: () => void
}): React.JSX.Element {
  const openRound = useOpenInputRound(discussionId)
  const [mode, setMode] = useState<InputMode>('choose')
  const [prompt, setPrompt] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])

  const labels = options.map((o) => o.trim())
  const filled = labels.filter((o) => o !== '')
  const duplicate = new Set(filled.map((o) => o.toLowerCase())).size !== filled.length
  const optionsOk =
    mode !== 'choose' ||
    (filled.length >= INPUT_OPTIONS_MIN && filled.length === labels.length && !duplicate)
  const ready = prompt.trim() !== '' && optionsOk && !openRound.isPending

  const submit = (): void => {
    if (!ready) return
    openRound.mutate(
      mode === 'choose' ? { mode, prompt: prompt.trim(), options: filled } : { mode, prompt: prompt.trim() },
      {
        onSuccess: onDone,
        onError: (error) => {
          onRefused()
          // 409: a round opened meanwhile, or the Discussion froze; the form
          // is moot. A 422 keeps what was typed so it can be fixed.
          if (error instanceof ApiError && error.status === 409) onDone()
        },
      },
    )
  }

  return (
    <form
      aria-label="Ask for input"
      className="flex flex-col gap-2 rounded-lg border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div role="radiogroup" aria-label="Kind of input" className="flex gap-1">
        {(['choose', 'advice', 'concerns'] as const).map((m) => (
          <Button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            variant={mode === m ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setMode(m)}
          >
            {MODE_LABEL[m]}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{MODE_HINT[mode]}</p>
      <Textarea
        aria-label="Question"
        placeholder="What do you want input on?"
        value={prompt}
        maxLength={INPUT_PROMPT_MAX}
        onChange={(e) => setPrompt(e.target.value)}
        autoFocus
      />
      {mode === 'choose' ? (
        <div className="flex flex-col gap-1.5">
          {options.map((value, i) => (
            <div key={i} className="flex items-center gap-1">
              <Input
                aria-label={`Option ${i + 1}`}
                placeholder={`Option ${i + 1}`}
                value={value}
                maxLength={INPUT_OPTION_LABEL_MAX}
                onChange={(e) =>
                  setOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))
                }
              />
              {options.length > INPUT_OPTIONS_MIN ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove option ${i + 1}`}
                  onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                >
                  <X />
                </Button>
              ) : null}
            </div>
          ))}
          <div className="flex items-center gap-2">
            {options.length < INPUT_OPTIONS_MAX ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOptions((prev) => [...prev, ''])}
              >
                Add option
              </Button>
            ) : null}
            {duplicate ? (
              <span className="text-xs text-destructive">Each option must be different.</span>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="commit" size="sm" disabled={!ready}>
          Ask
        </Button>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ *
 * One round, open or closed
 * ------------------------------------------------------------------ */

function RoundCard({
  round,
  people,
  canRespond,
  canClose,
  onRefused,
}: {
  readonly round: InputRound
  readonly people: People
  readonly canRespond: boolean
  readonly canClose: boolean
  readonly onRefused: () => void
}): React.JSX.Element {
  const isOpen = round.state === 'open'
  const close = useCloseInputRound()
  const put = usePutInputResponse()
  const withdraw = useWithdrawInputResponse()
  const busy = put.isPending || withdraw.isPending
  const respondable = isOpen && canRespond

  const respond = (body: PutInputResponseBody, onSuccess?: () => void): void =>
    put.mutate({ roundId: round.id, body }, { onSuccess, onError: onRefused })
  const withdrawMine = (): void => withdraw.mutate(round.id, { onError: onRefused })

  const asker = people(round.created_by)
  const closedLine =
    round.state === 'closed' && round.closed_at !== null
      ? round.close_reason === 'discussion_resolved'
        ? `Closed when the discussion was resolved, ${shortDate(round.closed_at)}`
        : `Closed by ${round.closed_by === null ? 'a member' : people(round.closed_by).name}, ${shortDate(round.closed_at)}`
      : null

  return (
    <article
      aria-label={`${isOpen ? 'Open' : 'Closed'} input round: ${round.prompt}`}
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-3',
        isOpen ? 'border-border bg-card' : 'border-border/60 bg-muted/30',
      )}
    >
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-sm bg-muted px-1.5 py-0.5 font-medium text-foreground">
            {MODE_LABEL[round.mode]}
          </span>
          <span>
            {asker.name === 'You' ? 'You asked' : `${asker.name} asked`}, {shortDate(round.created_at)}
          </span>
          {isOpen ? <span className="text-primary">Open</span> : null}
        </div>
        <p className="text-sm font-medium whitespace-pre-wrap text-foreground">{round.prompt}</p>
        {closedLine !== null ? (
          <p className="text-xs text-muted-foreground">{closedLine}</p>
        ) : null}
      </header>

      {round.mode === 'choose' ? (
        <ChooseBody
          round={round}
          people={people}
          respondable={respondable}
          busy={busy}
          onChoose={(optionId) => respond({ option_id: optionId })}
          onWithdraw={withdrawMine}
        />
      ) : (
        <>
          {respondable ? (
            <MyWrittenResponse
              key={`${round.id}:${round.my_response?.updated_at ?? 'none'}`}
              mode={round.mode}
              mine={round.my_response}
              busy={busy}
              onSave={respond}
              onWithdraw={withdrawMine}
            />
          ) : null}
          <ResponseList round={round} people={people} />
        </>
      )}

      {isOpen && canClose ? (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={close.isPending}
            onClick={() => close.mutate(round.id, { onError: onRefused })}
          >
            Close round
          </Button>
        </div>
      ) : null}
    </article>
  )
}

function ChooseBody({
  round,
  people,
  respondable,
  busy,
  onChoose,
  onWithdraw,
}: {
  readonly round: InputRound
  readonly people: People
  readonly respondable: boolean
  readonly busy: boolean
  readonly onChoose: (optionId: string) => void
  readonly onWithdraw: () => void
}): React.JSX.Element {
  const mine = round.my_response?.option_id ?? null
  const countOf = (id: string): number =>
    round.choice_counts?.find((c) => c.option_id === id)?.count ?? 0
  return (
    <div className="flex flex-col gap-1.5">
      <ul
        role={respondable ? 'radiogroup' : undefined}
        aria-label="Options"
        className="flex flex-col gap-1.5"
      >
        {round.options.map((option) => {
          const chosen = mine === option.id
          const who = round.responses.filter((r) => r.option_id === option.id)
          const count = countOf(option.id)
          const body = (
            <>
              <span className="flex flex-1 items-center gap-2">
                {respondable ? (
                  <span
                    aria-hidden
                    className={cn(
                      'size-3 shrink-0 rounded-full border',
                      chosen ? 'border-primary bg-primary' : 'border-input',
                    )}
                  />
                ) : null}
                <span className="text-sm text-foreground">{option.label}</span>
              </span>
              <Faces people={people} responses={who} />
              <span className="min-w-[4.5rem] text-right text-xs text-muted-foreground tabular-nums">
                {count} {count === 1 ? 'choice' : 'choices'}
              </span>
            </>
          )
          return (
            <li key={option.id}>
              {respondable ? (
                <button
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  disabled={busy}
                  onClick={() => {
                    if (!chosen) onChoose(option.id)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors',
                    chosen ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/50',
                  )}
                >
                  {body}
                </button>
              ) : (
                <div className="flex w-full items-center gap-2 rounded-md border border-border/60 px-2 py-1.5">
                  {body}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {respondable && mine !== null ? (
        <Button variant="link" size="sm" className="self-start px-0" disabled={busy} onClick={onWithdraw}>
          Withdraw my choice
        </Button>
      ) : null}
    </div>
  )
}

function Faces({
  people,
  responses,
}: {
  readonly people: People
  readonly responses: readonly InputResponse[]
}): React.JSX.Element | null {
  if (responses.length === 0) return null
  const names = responses.map((r) => people(r.user_id).name)
  return (
    <span className="flex -space-x-1" title={names.join(', ')} aria-label={`Chosen by ${names.join(', ')}`}>
      {responses.slice(0, 5).map((r) => {
        const p = people(r.user_id)
        return <PersonFace key={r.user_id} name={p.faceName} initials={p.initials} image={p.image} dense />
      })}
      {responses.length > 5 ? (
        <span className="pl-1.5 text-xs text-muted-foreground">+{responses.length - 5}</span>
      ) : null}
    </span>
  )
}

function MyWrittenResponse({
  mode,
  mine,
  busy,
  onSave,
  onWithdraw,
}: {
  readonly mode: 'advice' | 'concerns'
  readonly mine: InputResponse | null
  readonly busy: boolean
  readonly onSave: (body: PutInputResponseBody, onSuccess?: () => void) => void
  readonly onWithdraw: () => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(mine === null)
  const [body, setBody] = useState(mine?.body ?? '')
  const [concern, setConcern] = useState<'no_concern' | 'concern' | null>(mine?.concern ?? null)

  if (!editing && mine !== null) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>You’ve responded.</span>
        <Button variant="link" size="sm" className="px-0" onClick={() => setEditing(true)}>
          Change
        </Button>
        <Button variant="link" size="sm" className="px-0" disabled={busy} onClick={onWithdraw}>
          Withdraw
        </Button>
      </div>
    )
  }

  const reasonNeeded = mode === 'concerns' && concern === 'concern'
  const ready =
    !busy &&
    (mode === 'advice'
      ? body.trim() !== ''
      : concern !== null && (!reasonNeeded || body.trim() !== ''))

  const save = (): void => {
    if (!ready) return
    const trimmed = body.trim()
    onSave(
      mode === 'advice'
        ? { body: trimmed }
        : concern === 'concern' || trimmed !== ''
          ? { concern: concern ?? 'no_concern', body: trimmed }
          : { concern: concern ?? 'no_concern' },
      () => setEditing(false),
    )
  }

  return (
    <form
      aria-label="Your response"
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      {mode === 'concerns' ? (
        <div role="radiogroup" aria-label="Your answer" className="flex gap-1">
          <Button
            type="button"
            role="radio"
            aria-checked={concern === 'no_concern'}
            variant={concern === 'no_concern' ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setConcern('no_concern')}
          >
            No concern
          </Button>
          <Button
            type="button"
            role="radio"
            aria-checked={concern === 'concern'}
            variant={concern === 'concern' ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setConcern('concern')}
          >
            I have a concern
          </Button>
        </div>
      ) : null}
      {mode === 'advice' || concern !== null ? (
        <Textarea
          aria-label={mode === 'advice' ? 'Your advice' : 'Your reason'}
          placeholder={
            mode === 'advice'
              ? 'Your advice'
              : reasonNeeded
                ? 'What is the concern? (required)'
                : 'Anything to add? (optional)'
          }
          value={body}
          maxLength={INPUT_RESPONSE_BODY_MAX}
          onChange={(e) => setBody(e.target.value)}
        />
      ) : null}
      <div className="flex justify-end gap-2">
        {mine !== null ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" variant="commit" size="sm" disabled={!ready}>
          {mine === null ? 'Respond' : 'Save'}
        </Button>
      </div>
    </form>
  )
}

function ResponseList({
  round,
  people,
}: {
  readonly round: InputRound
  readonly people: People
}): React.JSX.Element {
  if (round.responses.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {round.state === 'open' ? 'No responses yet.' : 'No one responded.'}
      </p>
    )
  }
  return (
    <ul aria-label="Responses" className="flex flex-col gap-2">
      {round.responses.map((r) => {
        const p = people(r.user_id)
        return (
          <li key={r.user_id} className="flex gap-2">
            <PersonFace name={p.faceName} initials={p.initials} image={p.image} dense className="mt-0.5" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-foreground">{p.name}</span>
                {r.concern !== null ? (
                  <span
                    className={cn(
                      'rounded-sm px-1.5 py-0.5',
                      r.concern === 'concern'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {r.concern === 'concern' ? 'Concern' : 'No concern'}
                  </span>
                ) : null}
              </div>
              {r.body !== null && r.body !== '' ? (
                <p className="text-sm whitespace-pre-wrap text-foreground">{r.body}</p>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
