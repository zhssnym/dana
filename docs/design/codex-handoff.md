# The polish lane: a second brief for the Codex session

Written 2026-08-24, at Imran's instruction: "try to handoff every frontend
related thing which will not change backend or a design decision to Codex."
This file widens the boundary `messaging-brief.md` drew; that brief's ground
rules — the baseline discipline, fixtures-only, the rulings you must not
contradict, the gates, the debts you owe at the end — **apply to every item
here and are not restated**. Read it first, whole. `v2-refresh-plan.md` stays
the authority on state.

**The test that decides what belongs in this lane**, in Imran's words: would
doing it change a backend fact, or require a design ruling? If yes, it is the
studio's or it escalates as a proposal. If no — it is presentation, mechanics,
or a conversion under a standing rule — it is yours.

## Where the tree stands now

Branch `design/v2-refresh`, head **`f94acbf`**. The messaging brief named
`f2e8fe6` as the baseline; three commits have landed since (the fourth review
pass, the close-out review, the last drawing pass) and the same discipline
transfers: **commit on top of the current head**, never rebase, revert, amend
or reset anything before it, and keep your diff to your files.

## The work, four items

### 1. The landing page — Imran directs this one

`screens/public-auth-screen.tsx` is yours whole (it holds `LandingScreen`,
`InviteGateScreen`, `UnverifiedEmailScreen` — one owner per file, no mid-file
splits), with `public-legal-screen.tsx` and `transactional-email-screen.tsx`
beside it, presentation only.

- **Copy on these screens does not move without Imran's word.** The legal
  pages carry copy he approved at V0; the email's strings sit next to
  normative spec material; the landing's headline copy was ruled at S5 to
  stay put while its *treatment* was A/B'd.
- That A/B is live and waiting on him: the headline's second line steps back
  by tone at the plain URL and by weight at `?view=landing&headline=weight`
  (review S5). When he picks — likely while directing your redesign — the
  losing rule and the param leave with the decision.
- The invite gate and email screens were finished at DES-222 (S3's count chip
  dropped, S4's label deduped); do not reintroduce either.
- Both public screens are in the sweep's routes now. Keep them console-clean;
  the `nativeButton` mechanism in `ui/button.tsx` handles anchor-rendered
  Buttons for you — do not pass the prop by hand.

### 2. Colour named by role: the conversion

The standing ground rule (in `v2-refresh-plan.md`, dated 2026-08-23) says new
code writes `bg-card`, `text-muted-foreground`, `border-border` rather than
the graphite ramp steps they resolve to. The existing code predates it:
**650 raw ramp references outside `components/ui/`** at the last count. Every
one converted now is one the dark-colourway session — which needs Imran for a
dozen judgements — does not spend his time on.

- **Not one pixel moves.** The roles resolve to exactly the ramp steps the
  code names today; this is the same characters counting differently. If a
  conversion would change a rendered colour, you have the wrong role — stop.
- Convert only where the role *means* the surface: `bg-card` where the thing
  is a card's ground, not wherever white appears. A role misapplied is worse
  than a ramp step, because it will follow the dark redefinition somewhere
  wrong.
- The deliberate two-tone surfaces stay on the ramp **with a comment at the
  call site**: the public screens' dark panels and the reversed mark, which
  must not invert when the theme does. `tokens.css` line 279 records what
  skipping that comment cost once.
- `tokens.css` itself is untouched — values are the studio's.
- Land the conversion as its own commits, mechanical and reviewable. Check
  the plan file before each batch: if a fix round from Imran's click-through
  has landed in `src/`, rebase onto it — the studio has priority there.

### 3. The card's collapse animates (DES-119's carried fault)

The expanded task card has never animated shut — carried as a known fault
since V3. The motion tiers are tokens (`--duration-fast/base/slow`) and the
reduced-motion suppression is global, so the work is the transition itself,
not a motion system. `task-card.tsx` transfers to you for this item — the
messaging brief listed it off-limits because F7's stages were landing there;
they have landed. If the fix genuinely needs the shell or `task-row.tsx`'s
grid, stop and hand it back with a note rather than reaching across.

### 4. The messaging surface — unchanged

Your standing job per `messaging-brief.md`, files and rulings as written
there. Its three debts stand: the diff, the parallel log line, the handoff
paragraph.

## What stays out of this lane, so the line is bright

- **Every token value** — colours, type, spacing, radii, motion durations —
  and every new hue, size, or tier. Proposing one costs a sentence in your
  handoff; deciding one costs a review round.
- **Normative and spec-adjacent copy** — section 9 strings, control names,
  page names, the legal pages, email copy.
- **The contracts and models**: `lib/object-acts`, `lib/nav-model`, the
  filter model, the tab model in `shell-page.tsx`.
- **The comparison instruments** (`?nav=v1`, `?measure=`, `?folder-page=v1`,
  `?headline=`) — each leaves only when its ruling lands, and removing one
  is the studio's record to write.
- **`app/`** — never, for any reason.
- **New capability** — the Lane 2 line. Everything that needs a backend is
  recorded in `v2-decisions.md` and priced later; drawing more of it now
  turns proposals into assumptions.
- **V9's records** — `design-contract.md`, `screen-registry.csv`, the
  reference exports — the studio's, and the exports will be captured *after*
  your landing pass so the set shows one design.

## Gates, counts, and the discipline

Both gates green before you report anything: `node tools/audit.mjs` (12
rules) and `node tools/sweep.mjs` against port 5240 (**31 routes** now — the
counts in the messaging brief predate the public-screen routes and the stress
block). A check you add must be watched to fail against a deliberately broken
build before you trust it (DES-157) — this discipline caught two blind spots
in the stress block's own first draft the day it was written, so it earns its
keep. Imran reviews by clicking: links into 5240, never screenshots.
