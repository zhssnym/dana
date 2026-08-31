# A9 — `docs/spec/13-open-questions.md`, all 57 items triaged

Read-only. Branch `pipelines` at `18f72a7`, 2026-09-01. I opened the code, the schema, the
CI config, the RFCs and git history for each item and did not take any item's word for
itself. Nothing was edited. `npm test` was not run.

**The count.** 20 closed, 16 recorded bets or notes that are not questions, 21 genuinely
open. The 21 become **16 issues**, because some items are the same question twice.

**The short version.** Hassan is right. Two thirds of this file is dead. But the live third
is not small, and it is not soft: **six items have a revisit trigger that already fired and
nobody noticed**, and one of them is dated 2026-09-12, eleven days from now.

The six that fired:

| Item | Trigger | What happened |
| - | - | - |
| 2 | "verify during launch review" | Dana launched 2026-08-16. No record it was checked. |
| 15, 22 | "at the next authorized change to section 4's text" | Section 4 was folded 2026-08-30 (S29a). 4.11 was not amended. |
| 33 | "the first package after P8D that changes appearance" | Dozens have. The rule was generalised into `docs/workflow/how-we-work.md` without anyone closing the item. |
| 35 | "the move to a paid always-on instance" | Decided 2026-08-16 for early September. RFC 0004 dates it 2026-09-10/11. Not done. |
| 37 | "any defect the browser leg and the visual review could not have seen" | Issue #11 is exactly that shape. Nothing followed. |
| 50 | "whichever package next opens the folder-group dialog" | S27 opened it, fixed the headings, left the menu item and AC-246. Half-done. |

That is the argument for the closing section: a file where triggers fire silently is not a
tracker. It is a place questions go to be forgotten.

---

## 1. Summary table

Assignee column: **H** = @zhssnym, **I** = @mranwafa. "Issue" is the draft in section 4.

| # | Subject | Verdict | Who | Issue |
| - | - | - | - | - |
| 1 | Gmail dotted-variant email claim | OPEN — product | I | B |
| 2 | Google account-deletion policy wording | OPEN — technical | H | J |
| 3 | Hosting cron frequency tiers | CLOSED | | |
| 4 | rrule library conformance | CLOSED | | |
| 5 | iOS PWA push constraints | CLOSED (moot) | | |
| 6 | 1000-row cap instead of pagination | Not a question — recorded bet | | |
| 7 | One reminder per task | Not a question — recorded bet | | |
| 8 | Silent timezone auto-sync | Not a question — recorded bet | | |
| 9 | Verified email always present | CLOSED | | |
| 10 | Floating `due_time` across timezones | Not a question — recorded bet | | |
| 11 | Postgres 15 or later | CLOSED | | |
| 12 | Invites never expire | Not a question — recorded bet | | |
| 13 | UNTIL only, no COUNT | CLOSED | | |
| 14 | Landing copy | CLOSED | | |
| 15 | Yearly repeat anchored on 29 February | OPEN — technical | H | K |
| 16 | Drizzle migrator transaction scope | Not a question — standing note | | |
| 17 | openid-client signature verification | Not a question — standing note | | |
| 18 | Drizzle errors embed bound parameters | Not a question — standing note | | |
| 19 | Two Google accounts, one email address | OPEN — product | I | B |
| 20 | Folder list deliberately uncapped | Not a question — recorded bet | | |
| 21 | Important page has no index | Not a question — recorded bet | | |
| 22 | Monthly repeat on the 29th–31st skips months | OPEN — technical | H | K |
| 23 | Calendar response bounded only by 62 days | Not a question — recorded bet | | |
| 24 | Calendar projection has no index | Not a question — recorded bet | | |
| 25 | DST rules have no oracle | Not a question — standing note | | |
| 26 | Browser tests run on PGlite only | Not a question — recorded bet | | |
| 27 | "Deleted user" surfaces | CLOSED | | |
| 28 | Task form cannot express "unassigned" | CLOSED | | |
| 29 | No test leg runs production's text ordering | OPEN — technical | H | I |
| 30 | Hand-rolled components vs shadcn/ui | CLOSED | | |
| 31 | Task form state library, duplicated limits | CLOSED (moot) | | |
| 32 | Whether v1 owes a mobile layout | CLOSED | | |
| 33 | Human visual review as a merge precondition | CLOSED (moot) | | |
| 34 | Email surfaces and refusal page appearance | CLOSED | | |
| 35 | Free host plan freezes the reminder tick | OPEN — technical | H | I |
| 36 | @base-ui/react pinned exactly | Not a question — standing note | | |
| 37 | Wholesale markup replacement, no reviewer | Not a question — history | | |
| 38 | Section 9 amended to match artifacts | Not a question — history (moot) | | |
| 39 | The client ships as one 2.3 MB chunk | OPEN — technical | H | N |
| 40 | Two controls for five task fields | CLOSED | | |
| 41 | Dana ships no states page | CLOSED (moot) | | |
| 42 | Four things missing from the task card | CLOSED | | |
| 43 | Forwardable invite link | OPEN — product | I | C |
| 44 | Nothing gates who may create an account | OPEN — product | I | A |
| 45 | No way to report anything from inside Dana | OPEN — product | I | G |
| 46 | Duplicate a task | CLOSED | | |
| 47 | Images have no stored dimensions | OPEN — technical | H | L |
| 48 | Where a task opens does not follow you | OPEN — technical | H | O |
| 49 | Invite into a folder sitting in Trash | OPEN — technical | H | M |
| 50 | Old page names still shown to people | OPEN — product | I | D |
| 51 | Editable description on a place page | OPEN — product | I | F |
| 52 | A place page cannot wear a photograph | OPEN — product | I | E |
| 53 | A folder cannot wear a gradient | CLOSED | | |
| 54 | One file per comment against a cap of ten | OPEN — product | I | H |
| 55 | Object-store provider | OPEN — technical | H | I |
| 56 | Email digests for notifications | OPEN — product | I | P |
| 57 | A shelf cover can never be set | OPEN — product | I | E |

---

## 2. The closed ones, one line each

Spot-check any of these by opening the file named.

| # | What closed it | What I checked |
| - | - | - |
| 3 | Resolved 2026-07-29. Vercel was rejected and the scheduler runs in-process. | `docs/spec/11-architecture.md:180` still carries the rejection with its reasoning. |
| 4 | Resolved by construction. The repeat iterator is ours; rrule is only a test oracle. | `app/src/server/time/recurrence.ts` and `recurrence-oracle.test.ts` exist; `rrule` is pinned `2.8.1` in devDependencies (`app/package.json:70`); `tests/ac-071-rule-subset-validation.test.ts` exists. |
| 5 | Moot. Push was never scheduled for any release. | Grepped `app/src` and `package.json` for `web-push`, `PushManager`, `webpush`: zero hits. v1.1, 2.0, 2.1 and 2.2 all shipped without it. |
| 9 | Closed by code. An unverified Google email is refused outright. | `app/src/server/auth/router.ts:284` — `if (claims.email_verified !== true)`. |
| 11 | Resolved 2026-07-29. Postgres 18 everywhere. | `docs/spec/11-architecture.md:94-111` pins both test legs; CLAUDE.md records the local service as `postgresql-x64-18`. |
| 13 | Not a question, a decision, and it is already spec text. | `docs/spec/04-data-model.md:184` — "COUNT unsupported in v1". |
| 14 | Closed three times, last on 2026-08-24 at S13. | `docs/rfcs/0005-v2-specification.md:1865` records the third closure; AC-159 asserts the page. |
| 27 | Closed 2026-08-13. The history block renders creator and completer; AC-178 asserts "Deleted user". | The residual trigger was "any surface that displays an invite's acceptor". None does: `app/src/shared/invites.ts:204` says `accepted_by` is deliberately absent from the wire. |
| 28 | Closed by RFC 0005. The assignee control offers "Unassigned". | `docs/rfcs/0005-v2-specification.md:676` and `:1408`. |
| 30 | Closed 2026-08-13 by RFC 0002. The shadcn components were copied in. | `app/package.json:25` carries `@base-ui/react`, which is that distribution's primitive library. |
| 31 | Moot. The form the item is about was deleted at S15, and the duplicated limits went with it. | No `TaskForm.tsx` anywhere under `app/src`. `TASK_TITLE_LIMIT` and `TASK_NOTES_LIMIT` are declared once, at `app/src/shared/tasks.ts:62-63`, and `app/src/client/components/task-surface.tsx:31` imports them. |
| 32 | Answered by the owner 2026-08-12 (desktop-first), and then overtaken: a phone layout shipped in 2.1.0. | CHANGELOG 2.1.0 lists "A phone shell: a top bar with a menu that opens the sidebar as a drawer"; `app/src/client/shell/app-shell.tsx:316` draws it. |
| 33 | Moot as written, and generalised in substance. P8D was a v1 package; `SESSION-LOG.md` and `docs/team/` are deleted. | The rule it asked about now lives in the workflow: `docs/workflow/how-we-work.md:206` — "For frontend work, attach before and after screenshots." |
| 34 | Closed 2026-08-26 at S19. Emails are HTML with a plain-text alternative; the refusal page was restyled. | `app/src/server/notify/templates.ts` header line 1 — "rendered as HTML with a text/plain alternative"; DES-034 closed 2026-08-25; `docs/rfcs/0005-v2-specification.md:3062` calls the item's "deferred" wording stale. |
| 38 | History, and moot besides. It rests on the design-artifact process, which no longer exists. | `docs/design/` was deleted on 2026-08-31 and standalone prototypes are forbidden by the new workflow. |
| 40 | Closed at S15, as its own text says, and the closure is real. | The v1 form is gone from the tree (see item 31's row). |
| 41 | Moot. The states page lived in a prototype directory that no longer exists. | `docs/design/prototype/src/screens/states-page.tsx` is deleted along with the rest of `docs/design/`. |
| 42 | Closed. All four of the named absences landed. | Comments: `app/src/client/components/task-editing.tsx:103` ("the thread inside a task, which had no mount at all", S26). Attachments: `threadAttachments` at `:173`. Folder picker: `app/src/client/components/task-card.tsx:710` draws "New folder…". "More actions": `app/src/client/lib/object-acts.ts:176-199` carries History, Copy link, Duplicate, Move, Make a folder, Abandon, Restore, Delete, not Delete alone. |
| 46 | Closed at S28a. The endpoint the item said did not exist now exists. | `POST /tasks/:id/duplicate` at `app/src/server/routes/workshop.ts:353`, `duplicateTask` at `app/src/server/domain/acts.ts:220`, client call at `app/src/client/lib/task-acts.ts:90`. |
| 53 | Closed 2026-08-30 by migration 0006, taking the item's own first answer. | `app/db/migrations/0006_folder_cover_tiers.sql` adds `cover_preset` and `cover_focal_y`; `coverTiersFor` at `app/src/client/lib/page-identity.ts:147` gives a folder gallery, upload and photos. |

### The sixteen that are not questions

These are recorded bets and standing notes. Nothing is undecided in them; they exist so a
future reader knows a choice was made on purpose. **None of them should become an issue.**
They should move into the spec section they constrain — see section 5.

- **6, 20, 21, 23, 24** — five deliberate scale bets. Verified still accurate: lists cap at
  1000 with a `truncated` flag and no cursors (`app/src/server/views/lists.ts`);
  `listFolders(db, viewerId)` at `app/src/server/domain/folders.ts:132` takes no cap; no
  index on `tasks.important` or on `recurrence_rule` in any migration; the calendar has no
  cap, recorded in its own file at `app/src/server/views/calendar.ts:36`.
- **7, 8, 10, 12** — four product assumptions from v1, all still true.
  `reminders_pkey PRIMARY KEY (task_id)` is one reminder per task; `invites` has no expiry
  column (`app/db/migrations/0000_core_schema.sql:149-167`).
- **16, 17, 18, 25, 36** — five "this library does X, we do Y" notes, each with a revisit
  trigger tied to upgrading that library. **No trigger has fired.** `drizzle-orm`,
  `openid-client`, `luxon` and `@base-ui/react` have each been touched by exactly one
  commit — the one that added them (`efa6ab7`, `087f4e7`, `4091b9b`, `5a108bd`). Each
  mitigation is still in place: `enableNonRepudiationChecks` at
  `app/src/server/auth/oidc.ts:32`; `sanitizedError` stripping the message, asserted at
  `app/src/server/observability/error-tracker.test.ts:45-49`; the Luxon anti-oracle at
  `app/src/server/time/reminderTime.test.ts` with AC-144 and AC-145.
- **26** — the browser tests run on PGlite only. Still true and still deliberate:
  `app/playwright.config.ts:146` pins `TEST_DATABASE_URL: ''`.
- **37** — history. Worth one honest line: its trigger *did* fire. Issue #11, "Dana v2.0
  does not match Prototype v2 and requires these fixes before release", is exactly the
  shape it predicted. But the client has been rewritten again since, the bet is spent, and
  nothing now follows from the item. Delete it.

---

## 3. Before filing

`open-question` already exists as a label — I checked with `gh label list`. So do
`frontend` and `backend`. Nothing needs creating.

---

## 4. The sixteen issues, ready to paste

Nine are Imran's. Seven are Hassan's. **I is the one with a date on it.**

The letters used in the summary table, so you can find one:

| | Title | Items | Who |
| - | - | - | - |
| A | Who is allowed to sign up for Dana? | 44 | I |
| B | Two Google accounts, one email address — which one wins? | 1, 19 | I |
| C | Should an invite link be forwardable over WhatsApp? | 43 | I |
| D | Dana still calls two pages by their old names | 50 | I |
| E | Which pages in Dana can wear a photograph? | 52, 57 | I |
| F | Can a person write their own line under a page's title? | 51 | I |
| G | How does a person tell you something is wrong with Dana? | 45 | I |
| H | How many files can one comment carry? | 54 | I |
| I | The September hosting move | 29, 35, 55 | H |
| J | Confirm Google's account-deletion policy | 2 | H |
| K | Two repeat rules the spec never describes | 15, 22 | H |
| L | Stored images have no dimensions | 47 | H |
| M | Accepting an invite into a folder in Trash | 49 | H |
| N | The client is one 2.3 MB file | 39 | H |
| O | "Where a task opens" does not follow a person | 48 | H |
| P | Should Dana email people a digest? | 56 | I |

Everything below the next rule is pasteable as-is.

---

### Issue: Who is allowed to sign up for Dana?

**Assign:** @mranwafa
**Labels:** open-question, backend

Right now anybody who reaches dana.so and signs in with Google gets an account. There is no
list of allowed people, no waiting list, no invite requirement. I checked the whole sign-in
module: there is nothing to gate it.

That was invisible while Dana had two users. It stops being invisible the moment a third
person is invited, because a link forwarded to anybody at all is a working front door.

The question is what you want instead, and there are three shapes. Leave it open, which is
fine if you never mind who joins. Keep a list of allowed email addresses, which is airtight
but means you personally add every tester before they can get in. Or the middle one, which
is the shape the session that found this recommended: a short list of addresses **plus
anybody who is holding a Dana invite**, so the circle grows through Dana's own sharing and
you do not have to be in the loop for every new person.

A plain list without that second half would refuse an invited second tester at the door,
which defeats the point of inviting them.

What changes once you decide: if you pick either of the last two, a stranger who arrives
uninvited meets the ordinary "sign-in failed" screen rather than an explanation, which is
the right behaviour and needs no new writing. It needs no change to how Dana stores
anything.

Decide this together with the "how does someone tell us something is wrong" issue. Inviting
people without giving them a way to answer back is the expensive half of the pair.

Spec item 13.44.

---

### Issue: Two Google accounts, one email address — which one wins?

**Assign:** @mranwafa
**Labels:** open-question, backend

Two related situations, and they have one answer between them.

**The first.** Somebody signs in with a Google account Dana has not seen before, but the
email address on it already belongs to an existing Dana account. Today Dana refuses the
sign-in cleanly. Nothing is merged, nothing is linked, nothing is overwritten, and the
person is bounced to the landing page. This is deliberate — the decision was parked in
August waiting for it to actually happen to somebody.

**The second.** Gmail treats `imran.wafa@gmail.com` and `imranwafa@gmail.com` as the same
mailbox. Dana does not. So if one person invites another at the dotted spelling and that
person signs in at the undotted one, the invite sits unclaimed and looks broken to both of
them. Dana has no dot-handling of any kind — I checked.

Neither has been reported by a real person. That is why it is parked rather than urgent.

What you are deciding: when Dana meets two ways of writing what is arguably the same
person, does it refuse, ask, or join them up? Refusing is what happens today and is the
safest. Asking means building a screen nobody has designed. Joining them up automatically
is the friendliest and is also the only one of the three that can hand somebody the wrong
account.

What changes once you decide: only the refusal case needs new writing — today the person
just sees "sign-in failed" with no explanation of why.

Spec items 13.1 and 13.19, which are the same question from two angles.

---

### Issue: Should an invite link be forwardable over WhatsApp?

**Assign:** @mranwafa
**Labels:** open-question, backend

You asked for this in August and then said to leave it for now. This is here so it does not
get re-derived from scratch by whoever next reads the invite emails, because the obstacle
is completely invisible from the outside.

An invite in Dana is tied to one email address at the deepest level of how it is stored.
Accepting one checks that the person signing in is the person the invite was addressed to.
So a forwarded link does not half-work — it lands the recipient on an empty Dana with no
sign that an invite existed. That is Dana working correctly, not a bug.

**The trap worth knowing about:** this request always arrives sounding like a change to the
wording of an email, or to the link inside it. It is neither. No change to any email
reaches it.

Making it work needs three things in this order, and the first one is yours:

1. **A decision: does holding a link grant access?** That is the whole question. Today
   access follows the person's identity. A forwardable link means access follows whoever
   has the link, which is a genuinely different product with a genuinely different risk.
2. A change to how invites are stored.
3. A new public page that redeems the link.

Two and three both touch frozen parts of the spec, so neither can be done by anyone but you
and Hassan agreeing to it. That is why this is a question and not a task.

**If anyone is ever asked to "make the invite email shareable", that is this issue wearing a
smaller hat.**

Spec item 13.43.

---

### Issue: Dana still calls two pages by their old names

**Assign:** @mranwafa
**Labels:** open-question, frontend

Two places where the product says the old v1 words out loud. Neither is a bug in how Dana
works — both are words on the screen that never caught up with your renames.

**One.** On the Important page, starring a task shows a tooltip saying *"Also in Planned,
due 3 Sep"* or *"Also in Tasks, in Work"*. Planned is now called **Scheduled** and Tasks is
now called **Anytime**. So Dana points people at two pages it no longer has.

**Two.** In the sidebar, the menu item still reads **"New folder group"**. Click it and the
dialog that opens is headed **"New shelf"**. So the button and the window it opens disagree.
The dialog was fixed in a later round; the menu item and the acceptance test that pins it
were not.

The recommendation is one decision covering both: take everything to the v2 words. "Also in
Scheduled" and "Also in Anytime", and "New shelf" in the menu. The rename was a product
decision that simply did not reach every string.

There is a real alternative on the tooltip alone, and it is cheap to state: it is the only
place in Dana that names another page, so the old names could be defended as directions
rather than labels. If you want it left, say so and it gets left.

What changes once you decide: a few strings and two automated tests that check them by name.

Spec item 13.50.

---

### Issue: Which pages in Dana can wear a photograph?

**Assign:** @mranwafa
**Labels:** open-question, backend

Dana has three kinds of page a person can decorate: **folders**, **shelves**, and the
built-in places like Today and Scheduled. You approved four ways of setting a cover —
a gallery of gradients, uploading your own picture, pasting a link, and searching stock
photos.

Today no page offers all four, and the three kinds each offer something different:

- **A folder** can have a gradient, an uploaded picture, or a searched photo.
- **A place page** like Today can have a gradient only. It can never have a picture.
- **A shelf** can have nothing at all. It draws no "Add cover" control.

That is not three design decisions. It is one accident: Dana can only store an uploaded
picture if the picture belongs to a folder, and neither a place page nor a shelf is a
folder. Everything else follows from that.

Two ways out and the difference is a product difference, not a technical one:

**Let pictures belong to a person rather than to a folder.** Then all three page kinds can
have all four cover options and the picker is the same everywhere. This is the recommended
one: two pages a click apart offering different halves of the same picker is exactly the
inconsistency the cover work existed to end.

**Or rule that photographs belong to folders and shelves — the things a person made — and
that the built-in pages get gradients.** That is a defensible product with a real character
to it, and if it is what you want, then what looks like a gap today becomes a deliberate
rule and the spec should say so.

What changes once you decide: nothing for anyone who never sets a cover. For the first
answer, a shelf gains an "Add cover" control it does not have today, and Today gains the
ability to hold a picture.

Spec items 13.52 and 13.57, which are the same question for two different objects.

---

### Issue: Can a person write their own line under a page's title?

**Assign:** @mranwafa
**Labels:** open-question, frontend

The design gives Today, Scheduled and every other built-in page a head with a mark, a title,
a short description, and the "3 of 8 done" count. The description is meant to be editable —
a person's own note about what the page is for.

There is nowhere to store it. A folder has a description and keeps it. A built-in page has
a cover picture and no words.

So the page today shows a fixed sentence rather than an editable one. That was the deliberate
choice rather than shipping a box people could type into: a description that accepts what
you write, blurs, and comes back unchanged is worse than no box at all, because it tells you
your words were saved when they were not.

Three answers, all yours:

1. **Store it.** A person's own line under Today, kept the way their chosen cover is kept.
   This is the recommended one: a built-in page is furniture, and how a person describes
   their own furniture is theirs.
2. **Store it along with whatever the next such setting turns out to be** — more than this
   needs today, but avoids doing it twice.
3. **Rule that the sentence is Dana's, not the person's.** Costs nothing, and the page keeps
   the line it draws now.

Worth naming if you pick the third: folders and built-in pages then diverge — a folder keeps
its editable description and a place page does not. That is a real product difference rather
than a tidy-up, and should be decided as one.

Spec item 13.51.

---

### Issue: How many files can one comment carry?

**Assign:** @mranwafa
**Labels:** open-question, backend

Dana's limits say a comment may carry up to ten files. The thing that actually posts a
comment accepts exactly one. So the limit and the product disagree, and have since both were
written.

The reading half of this was fixed at the end of August — an attached file now arrives with
its name, type and size, so Dana can show a proper attachment row instead of just the
picture. What is left is the writing half, and it is a product question rather than a
technical one.

Two answers:

**Ten, as the limit already says.** Someone dropping three screenshots into one comment
sends one comment, not three.

**Or one, deliberately.** A conversation is for saying things, not for filing them, and the
ten was provision for a feature Dana decided against. If this is the answer, the limit drops
to one and the spec should say a comment carries one picture.

What changes once you decide: for ten, the box under a comment accepts more than one file at
a time. For one, nothing changes in the product and one sentence changes in the spec.

Spec item 13.54.

---

### Issue: How does a person tell you something is wrong with Dana?

**Assign:** @mranwafa
**Labels:** open-question, frontend

There is no way to report anything from inside Dana. No feedback link, no support address,
no "something's broken" button. I checked the whole client.

With two people who talk to each other anyway, this cost nothing. With anybody else, it is
the difference between a tester's confusion reaching you and it evaporating. Somebody who
hits something odd and has no way to say so does not chase you down. They stop using it.

The cheapest thing that closes it is **an email address in Settings**. Not a form, not a
tracker, not a widget. One line that says where to write.

What you are deciding is whether that is enough, or whether you want something that captures
what page a person was on when they wrote.

Decide this together with the "who is allowed to sign up" issue. Inviting people without a
way for them to answer back is the expensive half of the pair.

Spec item 13.45.

---

### Issue: Should Dana email people a digest of what they missed?

**Assign:** @mranwafa
**Labels:** open-question

Dana already keeps a list of things that happened to you — somebody assigned you a task,
commented on one, shared a folder. That list lives inside the app, behind the bell.

Whether any of it should also arrive as email was deliberately left open until there was
real usage to look at. There now nearly is.

The question is whether a person who has not opened Dana in a few days should get a summary
by email, and if so, how often. Daily is the obvious answer and is also the one most likely
to become noise.

Nothing is blocked on this. It is here so it gets decided on purpose rather than by nobody
mentioning it. Whichever way it goes, no stored data has to change.

Spec item 13.56.

---

### Issue: The September hosting move — and the one thing that is only free this week

**Assign:** @zhssnym
**Labels:** open-question, backend

Three open items are one action, and it has a hard date. The plan (RFC 0004, row S-inf)
puts the purchases on **2026-09-10 or 11**, before the free database expires on
**2026-09-12**. It has not happened. Today is 2026-09-01.

**1. The always-on instance (item 35).** The free plan suspends the process when it is idle,
which freezes the 60-second reminder tick. This was measured, not guessed: three requests to
`/api/health` timed out, the fourth answered after 99 seconds and reported 377 seconds since
the last reminder pass — a resumed process, not a fresh one. Reminders are delayed rather
than lost as long as the freeze is under six hours; past that they are dropped and logged as
stale. Alerting only sees a freeze longer than nine minutes, so the common case is invisible.
Buying an always-on instance closes it. No code moves. **Until then, a report of a late
reminder is this, and should not be chased as a scheduling bug.**

**2. The new database's text ordering (item 29), and this is the part with a window.** Dana
sorts folder names and people's names in the database. How those sort depends on the setting
the database was created with, and it can only be set **at creation**. Both test legs are
pinned to `C.UTF-8`. Production is whatever Render's default gives it, so production is the
only one of the three nobody checks. It is narrow — you need an accent, a punctuation mark,
or a mix of capitalised and lowercase display names to see a difference — but the people list
is the one that mixes capitalisation.

Three answers: accept it, **create the new database with the same `C.UTF-8` locale so all
three finally agree**, or write the collation into the queries themselves, which touches two
frozen spec sections and is by far the most expensive. The middle one is free *this week and
never again*, because you are creating a database anyway. The statement is in spec 11.10.

**3. The object store (item 55).** Uploaded files sit on the host's disk today. Whether that
stays or becomes an S3-compatible bucket is a deployment decision to make with the move. It
is behind one interface, so the API does not change either way.

Also owed by the same row: verified-restorable backups (restore the new database from a
backup once *before* cutover, not after) and the domain cutover.

Purchases are Imran's, per the plan.

Spec items 13.29, 13.35 and 13.55.

---

### Issue: Confirm Google's account-deletion policy before opening Dana up

**Assign:** @zhssnym
**Labels:** open-question, backend

Small and probably quick, but it is a compliance check that was scheduled for "launch
review", and launch happened on 2026-08-16 with no record that anyone did it.

Dana signs people in with Google, so it falls under Google's user-data policy. Dana already
implements account deletion behind a typed confirmation, and the Privacy page describes it,
so the mechanism is there. What was never checked is the current policy wording — whether
Google now requires anything Dana does not do, a user-facing data export being the specific
thing the original note worried about.

Worth doing before Dana has users who are not you two, because the answer could be a new
surface rather than a wording change.

Spec item 13.2.

---

### Issue: Two repeat rules behave correctly and the spec never says so

**Assign:** @zhssnym
**Labels:** open-question, documentation, backend

Spec hygiene, not a defect. Both behaviours are implemented, tested, and agree with RFC 5545.
Section 4.11 just never got the two sentences that describe them.

**Yearly on 29 February.** A task due 29 February with a yearly repeat only recurs in leap
years. That is the standard's behaviour and it is what the code does.

**Monthly on the 29th, 30th or 31st.** 4.11 forbids those as *rule* values precisely to avoid
month-skipping. But the day comes from the task's due date, not the rule, so a task due the
31st with a plain monthly repeat is legal input the rules never refuse and the spec never
describes. It skips the months too short to hold it: due 31 January, next 31 March, with
February and April skipped rather than clamped.

**Why this is being filed now.** Both items said the same thing: fold one sentence into 4.11
"at the next authorized change to section 4's text". That change happened — section 4 was
folded on 2026-08-30 by S29a. The amendment was not made. The trigger fired and nobody
noticed, which is the whole reason this file is being triaged.

One amendment carries both sentences. If either behaviour is ever judged surprising to
users, the alternative is clamping to the month's last day: an iterator change, no stored
data affected.

Spec items 13.15 and 13.22.

---

### Issue: Stored images have no dimensions, so pages jump as they load

**Assign:** @zhssnym
**Labels:** open-question, backend

A page that jumps by the height of an image as it loads was ruled a correctness fix rather
than a feature. It cannot be built from what Dana stores today. The files table carries id,
owner, folder, kind, name, mime, size and duration — and no width or height. I checked every
migration, including the three added since.

**The trap, and it is the reason this is worth writing down.** This looks like a client-side
fix and half of it genuinely is. Whoever builds the upload path holds the actual file in the
browser and knows its shape the moment it is chosen, so they will see the space reserved
correctly and ship it. Every *other* reader of that page — and the author on their next load —
gets the jump anyway, because nothing on the wire says how tall the picture is.

What closes it is a nullable width and height stored with the file, where they belong: one
image can be used by several blocks, and its shape is a fact about the file. That touches
frozen section 4, so it is a decision rather than a session's call. Dana already re-encodes
every image it accepts, so reading the dimensions costs nothing extra at upload.

Spec item 13.47.

---

### Issue: Accepting an invite into a folder that is sitting in Trash

**Assign:** @zhssnym
**Labels:** open-question, backend

Deleting a folder used to destroy its pending invites immediately. Now deleting is soft — the
folder sits in Trash for thirty days first — so there is a thirty-day window with no specified
outcome, and the code takes the accidental one.

Verified in `app/src/server/domain/invites.ts:595` onward: `acceptInvite` never looks at
`folders.deleted_at`. So the acceptance succeeds, the person gets a membership on a folder
they cannot see, and whether they can ever see it depends on whether somebody else restores
it within thirty days.

Three answers:

1. **Refuse while the folder is in Trash**, with copy saying the folder was deleted. Smallest
   change, and the only one of the three that a restore then makes right by itself.
2. **Cancel the invite at the moment of deletion**, the way deleting an account cancels the
   invites it sent. Decisive, but loses the restore case.
3. **Leave it as is.** This is the literal reading of the current rules and is the one nobody
   would choose on purpose.

Recommendation: the first. One guard in the acceptance path and one test.

Spec item 13.49.

---

### Issue: The client is one 2.3 MB file, downloaded whole on every release

**Assign:** @zhssnym
**Labels:** open-question, frontend

Dana's entire client ships as a single JavaScript file. Measured just now:
`dist/client/assets/index-*.js` is **2,368,439 bytes**. There is no route-level splitting —
no lazy imports, no manual chunks.

Three consequences. Every page's code is fetched before any page renders. The whole file is
re-downloaded on every release. And the offline-shell cache limit had to be raised past
Workbox's 2 MiB default to let it through at all — it sits at 4 MiB in `vite.config.ts:84`,
raised once at `d11cccc` on 2026-08-25 and not since. That number is a ceiling somebody will
raise again, not a budget anybody chose.

The cap follows the shell rather than bounding it, and that is deliberate: Dana promises an
offline shell, and the default's failure mode is a service worker that caches everything
*except* the application, which is an offline shell that shows a white screen.

The answer is splitting by route. It changes what loads when, so it wants a change that can
measure first paint before and after — not something to do inside a merge.

**The item's own trigger has not fired** (no second raise, no report of a slow first load), so
this is not urgent. It is filed because the debt is real and measured, and because the next
raise of that constant is the point at which it stops being optional.

Spec item 13.39.

---

### Issue: "Where a task opens" does not follow a person between devices

**Assign:** @zhssnym
**Labels:** open-question, frontend

Small, and mostly fixed already. Filing the remainder so it does not sit in a deleted file.

Imran ruled that a task opens as a dialog by default, and that choosing the sidebar makes the
sidebar the default until you choose the dialog again. That is what ships, and it is held in
the browser rather than on the account.

The Settings control was wired up at S27 to write both the account column and the browser
store, so the dead-control half of this is closed. What is left:

- **The stored default still says `panel`** (`0003_v2_expand.sql:210`), which disagrees with
  the ruled default of `dialog`. Nothing reads it as the record, so nothing breaks — it is
  just wrong.
- **The preference does not travel between a person's devices.** Row density and the clock
  both started in the browser and were deliberately moved onto the account. This is now the
  odd one of the three.

Two answers, both touching frozen section 4: change the column's default to `dialog` and make
the column the record, which needs a one-word migration and an update for existing rows; or
treat the Settings control as the *starting* value that a new browser adopts once, which
keeps the column meaningful without making it the record.

Worth knowing before touching it: reading that column as the record was tried at S23 and
turned **42 of 228 browser tests red**, because every existing account's default is `panel`
and the tests all open the dialog. Whichever answer is taken needs the data updated in the
same change.

Spec item 13.48.

---

## 5. What to do with `13-open-questions.md`

**Delete it.** Not shorten it, not split it. Delete the file.

Here is the arithmetic. Of 57 items: 20 are closed, 16 are recorded bets that are not
questions, and 21 are open and are now issues. Once the issues are filed, the file holds
nothing that needs a file.

**The 20 closed and the 4 moot: delete outright.** Git has them. Every one is traceable to a
commit, an RFC change-control item, or a deleted directory. Nobody will ever need to read
item 14's third closure again.

**The 16 bets: move them into the section they constrain, and this is the only part that is
real work.** They are not questions and they must not become issues, but they are the record
of why a choice looks odd, and losing them means somebody "fixes" a deliberate decision.
Where each belongs:

- **16, 17, 18, 25, 36** — the five "the library does X, we do Y" notes — belong in **spec
  11.15**, which already *is* the list of ways recall of the installed libraries is wrong.
  That is their home; it is a coincidence of history that they ended up here instead.
- **6, 20, 21, 23, 24** — the five scale bets — belong as annotations on the sections they
  are about: 10.3's cap rule, 4.12's index rule, 7.10's calendar body. Three of the five
  already have a matching comment in the code, so this is one sentence each.
- **7, 8, 10, 12** — the four v1 product assumptions — belong in the spec sections that state
  the behaviour, as "this was assumed, here is what changes if it is wrong".
- **26** — belongs in 11.10 beside the two test legs it is about.
- **37** — delete. Its bet is spent and the client has been replaced again since.

**Why deleting beats keeping a shorter version.** A one-file list of open questions has been
tried here for a year and it does not work, and the evidence is in this triage rather than in
an opinion: **six items had a revisit trigger that fired and nobody noticed**, including one
where the very thing the item was waiting for happened on 2026-08-30 and the amendment still
was not made. The failure is structural. A trigger inside a paragraph inside an 86 KB file
that no tooling reads is a reminder addressed to nobody. A GitHub issue has an assignee and
shows up in a list somebody actually opens.

The one thing that would be lost is the linkage — items 52, 53 and 57 are one question about
three objects, and reading them together is how anyone can tell. That is preserved by the
issues themselves: issue E carries 52 and 57 in one body, and issue K carries 15 and 22.

If A5's proposed `13-open-questions/` folder is built, **build it empty or not at all**. A
folder with a README saying "open questions live in GitHub issues labelled `open-question`"
is worth more than a folder with items in it, because the second one starts filling up again
the week after it is made.

---

## What I could not verify

Six things. Each would be settled by something I could not reach from a read-only checkout.

1. **Whether the September purchases have been made** (items 35, 55). I checked for a
   `render.yaml`, a deployment doc, and any note in the spec, RFCs or changelog. There is
   none. Absence of a record is not proof it did not happen — Hassan may have bought the
   instance without writing it down. **Settled by:** looking at the Render dashboard.
2. **What locale the current production database was created with** (item 29). Needs one
   query against production: `SELECT datlocprovider, datlocale FROM pg_database WHERE datname
   = current_database();`. I have no production connection. The item's own reasoning says it
   is Render's default, which is glibc `en_US.UTF-8`, but that is inference.
3. **Whether Google's user-data policy currently mandates anything beyond deletion**
   (item 2). This needs reading Google's live policy page, which is outside this repository.
   I verified only that Dana implements deletion and describes it on the Privacy page.
4. **Whether item 26's trigger has ever fired** — a browser test failing while its server half
   passed on both database legs. That would need reading a year of CI runs case by case. I
   read the config, not the history. If it did fire, the item becomes a real technical
   question rather than a bet.
5. **Whether any of the accepted scale bets are close to their limits in real use**
   (items 6, 20, 21, 23, 24). All five are "this is fine at personal scale". Whether real
   accounts are near 1000 rows, 200 folders, or a calendar month dense with repeats is a
   production data question. I confirmed only that the caps and the missing indexes are
   exactly as described.
6. **Whether items 15 and 22's repeat behaviour is actually surprising to users.** I verified
   the code implements RFC 5545 and that the spec does not describe it. Whether a person whose
   monthly task skipped February would call that correct is Imran's judgement, not mine — I
   filed the amendment as documentation, but if the answer is "that is surprising", the issue
   becomes a product question and moves to him.
