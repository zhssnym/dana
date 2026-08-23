# The conversation: a brief for the parallel session

Written 2026-08-23, for a Codex session polishing Dana's messaging surface
alongside the F7 sessions running in `v2-refresh-plan.md`. It exists so two
sessions can work one prototype without competing, contradicting, or
overwriting each other.

**Read it whole before you change anything.** Most of what follows is not
advice; it is decisions Imran has already taken, and a session that reverses
one has cost him a review round rather than saved him a task.

## The job

Polish the conversation — the thread that serves the task card, the foot of a
folder page, and the right panel. Visual and interaction refinement of what is
already drawn. **Not new capability**, for a reason set out under *The line you
must not cross* below.

## Where the tree stands

Branch `design/v2-refresh`, baseline **`f2e8fe6`**, working tree clean at the
time of writing.

That commit is five sessions of work — F3 through F7 — committed as one
recoverable baseline. It is **unapproved**: Imran's look is owed on DES-155
through DES-197. So:

- **Commit on top of `f2e8fe6`.** Never rebase, revert, amend or reset it or
  anything before it. Work you did not do is sitting in there and cannot be
  reconstructed from anywhere else.
- Your diff against `f2e8fe6` is what Imran will read. Keep it to your files.
- **Fixtures only.** `prototype-v2` never gains an API call, auth, or anything
  from `app/`. Nothing under `app/` changes. This is a standing ground rule of
  the whole refresh, not a preference.

## Your files, and only these

The conversation has one component and four primitives, and — verified
2026-08-23 — **`comments.tsx` is the sole consumer of all four**. That is why
this boundary is safe:

| File | |
| - | - |
| `src/components/comments.tsx` | yours (1099 lines) |
| `src/components/ui/message.tsx` | yours |
| `src/components/ui/bubble.tsx` | yours |
| `src/components/ui/textarea.tsx` | yours, but see DES-160 |
| `src/components/ui/input-group.tsx` | yours, but see DES-160 |

**Off limits, and why each one:**

- `src/components/right-edge.tsx` — the panel shell. It is **shared with the
  task surface**. F7 item 12 has just unified them so a panel on that edge
  cannot cover the page again (DES-186); editing it re-opens the fault for
  both tenants.
- `src/components/ui/inline-field.tsx` — six consumers across the card, the
  row, the board, the page head and the folder page.
- `src/components/task-card.tsx`, `task-surface.tsx`,
  `screens/folder-page-v2.tsx`, `screens/shell-page.tsx` — the three hosts and
  the shell. F7's remaining stages land here.
- `src/fixtures.ts` — you may **add** message data; you may not change the
  message *shape*. F7 stage 5 makes search reach messages and will read it.
- `src/styles/tokens.css` — one file owns the tokens, and it is not yours.

If polish you believe in needs a host change, **stop and hand it back** rather
than reaching across the line. A note in your handoff costs a sentence; a
conflict in `folder-page-v2.tsx` costs a session.

## The rulings you must not contradict

These are on the register as **APPROVED**. They are not open questions, and a
change that reverses one is a regression however good it looks.

**DES-143 — a message is told apart by tone, never by hue.** Imran's
direction, and the strongest constraint on this surface:

- Mine on graphite-900 with light text; theirs on the graphite-50 wash. **No
  hue enters the thread at all.** Cobalt has been the interaction colour since
  DES-016, and a message is not an interaction — tinting one blue spends the
  accent on something nobody clicks and weakens every control that needs it.
- The corner nearest its own author tightens to 4px against 14px elsewhere.
  That single class is what makes a container read as *spoken by* somebody. No
  tails, no pointers.
- **Media is not put in a container.** A voice note and a file row are
  self-contained objects with their own edges; their side is said by alignment
  alone. Nesting them in a bubble forces a second colourway for each.
- The row has **no hover wash** — it was the same graphite-50 as the other
  person's container, so hovering made your own message look like theirs.
  Actions still arrive on hover; the ground does not move.

**DES-142 — the conversation has two homes.** Inline at the end of the page,
where it reads as the page's own last section, or a side panel beside the
work. Floating and full-screen are gone and should not come back. The page's
is a **closed collapsible line** — chevron, mark, "Comments (4)" — in the same
grammar as Completed directly above it. Opening it from the bar *opens* the
section rather than scrolling to a shut heading. The panel starts under the
window bar (`--shell-windowbar-height`, 60px), not under the tabs.

**DES-123 — one thread component serves card, page and panel.** If you find
yourself writing a second variant, you have found the fault this ruling exists
to prevent.

**DES-146 — a like is the whole reaction set.** The six-emoji picker was
removed deliberately: a palette asks a person to choose a feeling before they
can agree, and it puts emoji — a vocabulary Dana owns nowhere else — in the
middle of the product's own typography. Do not reintroduce a picker. The
actions (like, reply, edit, delete) sit level with the message on its outer
side, not on the name-and-time line above it.

**DES-160 — a control comes from the system or it becomes one.** Imran,
2026-08-22, about this exact file: the conversation "is still not following the
shadcn UI code or structure." Four passes fixed it. So: no bare `<input>`,
`<textarea>` or `<button>` in `comments.tsx`; no hand-copied colour strings
(there is a `commit` Button variant); and if you change `textarea.tsx` or
`input-group.tsx`, the change must stay **shadcn-shaped** — read the published
docs rather than recalling them, which is what the last two passes had to do.

## The line you must not cross

DES-129 (task comments) and DES-134 (the folder's conversation) are both
recorded **NEEDS BACKEND**. Today there is no message table, no endpoint, no
delivery and no unread state, and the register carries this warning:

> a surface that looks like chat will be judged as chat, and chat without
> realtime and unread reads as broken where page comments read as fine

So **do not polish this surface toward chat.** No typing indicators, no
presence dots, no read receipts, no unread badges beyond the count already
drawn, no "delivered" states. Each is free to draw and expensive to mean, and
drawing one pre-empts a ruling Imran has not taken.

## The habit that costs you nothing and saves the dark-mode session

**Colour is named by role, not by value** — a standing ground rule added
2026-08-23. `comments.tsx` is currently one of the worst files in the tree:
**27 direct graphite-ramp references against 3 role references.**

New and touched code writes `bg-card`, `text-muted-foreground`,
`border-border` — not `bg-graphite-50`, `text-graphite-900`. This costs the
same characters and moves no pixel, because those roles resolve to exactly
those graphite steps today. What it buys is the second colourway: a role can
be redefined once under `.dark` and every component follows unopened; a value
cannot, because `graphite-50` means "very light grey" and is used both where a
surface must invert and where it must not.

DES-143's two message grounds are the honest exception — they are a deliberate
two-tone pair, like the public panels and the reversed mark. Say so at the call
site if you keep them on the ramp.

**Improving that 27:3 ratio while you are in the file is real work and
welcome.** It is the one piece of scope expansion this brief invites.

## Running it, and the gate

**The dev server is already running on 5240 — use it, do not start a second
one.** The prototype is at `http://127.0.0.1:5240`. Only if that port is dead:

```bash
cd "docs/design/prototype-v2" && npm run dev
```

Run the prototype and look at it *before* you change anything — RFC 0002's
hard-learned rule, and a standing ground rule of every session here.

Your work is not done until all four are green:

```bash
cd "docs/design/prototype-v2" && node tools/audit.mjs && node tools/sweep.mjs && npm run typecheck && npm run build
```

`audit.mjs` is the consistency audit — twelve rules, each carrying a probe it
must catch or it fails as BLIND (DES-157), because a green check used as
evidence about something it never looked at is worse than no check. `sweep.mjs`
drives a real browser over 25 routes and needs the 5240 server up; it resolves
Playwright out of `app/node_modules` by design, so do not add a Playwright
dependency to the prototype.

**If you settle a rule, add a rule.** DES-154's lesson, learned five times on
this project: a behaviour kept in a review comment is lost by the next session.
A rule you add must be watched to fail against a deliberately broken build
before you trust it.

## What you owe at the end

1. **A diff limited to the five files above**, committed on top of `f2e8fe6`.
2. **One line appended to the session log** in `v2-refresh-plan.md`: who ran,
   date, what was delivered, verdict. Mark it as a parallel session, so the
   log's order is not later read as a sequence.
3. **A handoff paragraph** naming: anything you wanted to change outside your
   files, anything you believe needs a ruling from Imran, and any DES number
   you think should be raised. Propose; do not decide. Every session here ends
   with Imran looking at it and saying yes or no, and an unapproved session
   repeats or returns rather than rolling into the next.
