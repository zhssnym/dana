## 7. API surface

**Two annotations covering the whole section, added by the S29 fold on 2026-08-27. Neither
is an edit: section 7 is frozen, and RFC 0004's S29 row is annotate rather than rewrite.**

**First, every v1 page name below is an address rather than a page name, and renaming one
would be a breaking change wearing a tidy-up's clothes.** RFC 0005 renamed the pages and
renamed no address: `GET /views/my-day` serves the page now called Today, `GET
/views/planned` and `/views/planned/calendar` serve Scheduled, `GET /views/tasks` serves
the undated rows that Desk groups and Anytime lists, `POST` and `DELETE /tasks/:id/my-day`
are the pull and un-pull of Today, and 7.8's heading says "My Day membership" for the same
reason. The same holds of the response keys, `inbox`, `planned`, `tasks_inbox` and
`tasks_groups`, and of `pulled`'s gloss on the TaskCard line. The client, the acceptance
suite and the migrations all address these strings literally; the section that decides
what a person sees on screen is section 9, and section 2 carries both names for every
term. The one place a v1 name here is a *page* name rather than an address is 7.6's `POST
/tasks` default, "folder_id default V's Inbox", which means V's default folder, called
Desk since RFC 0005 and Inbox before it, and which is `is_default` in the request path
rather than any string.

**Second, this section now carries the whole API Dana serves, folded by S29a on
2026-08-30.** RFC 0005's accepted units are folded into this frozen file as text and
nothing else: unit 12a replaced the `TaskCard` line of 7.0; unit 12 inserted 7.12 to 7.17
and unit 9a inserted 7.18; change control item 46's units appended the order endpoint to
7.6, widened 7.16's workflow import and page contract, and inserted 7.19. Every one of
them was ruled by the owner before it was written (RFC 0005's acceptance of 2026-08-24,
re-accepted 2026-08-27; item 19 for the two `TaskCard` widenings; item 44 for the four
frozen changes of item 46), so the freeze's rule, that section 7 moves only on a human
decision, holds through the fold. 7.13 is folded as RFC 0005 accepted it and is being
amended in parallel by RFC 0004's S28a, whose Replace unit lands on it, and item 36's
permanent delete; read that row's outcome before relying on 7.13's last sentence.

**Third, three read shapes gained fields on 2026-09-03 under issue #27, and the addition is
recorded here because section 7 is frozen and a change to it must be visible from its front
door.** 7.14's comment file, 7.15's upload answer and 7.16's block read each carry the width
and height migration 0009 added to 4.16. **Every one is additive**: no field changed meaning,
no field became stricter, nothing that parsed before stops parsing, and the shared zod
schemas both sides import are the compiler's business on both sides. The authority is the
ruling the issue records, that a page which jumps by the height of an image is a correctness
fault rather than a feature; the columns are useless without a way to read them, so serving
them is not a second decision but the same one. **The owner's confirmation of the section 7
half is nonetheless owed**, the ruling having named section 4 explicitly and this section
only by implication.

**Fourth, a whole subsection was added on 2026-09-04, and it is the first one
since the S29a fold rather than an annotation of an existing one.** 7.22 is the
data export, `GET /me/export`, and it moves this frozen section on two human
decisions in the way the freeze asks: Imran ruled the product on issue #77,
that Dana offers a real export of a person's own data on the wide reading
rather than the narrowest compliance one, and Hassan ruled the shape. It is
**purely additive** — no existing endpoint, response or status changed, and
nothing that parsed before stops parsing. It is written as its own file rather
than as a paragraph inside 7.1 because it is a surface with a format, a cap, a
limiter and an authorization argument of its own, and because 10.9 named
inventing one inside a compliance note as the wrong way to acquire it. 10.9
stops recording the gap in the same change and points here.

**Fifth, and on the same day, 7.23 is a second new subsection and it is the
opposite kind of move: it records an endpoint that has shipped since RFC 0005
rather than adding one (issue #152).** `GET` and `PATCH /api/v1/settings`, the
4.19 bundle, were described nowhere in this section — not in 7.2, which is the
frozen v1 `/me/settings` and its three page flags, not in 7.17, not in RFC
0005's folded units — so the only account of them anywhere was 4.19's column
list and the zod schemas both sides import. That was found while adding
`calendar_zoom` for #142, which had to annotate 7.2 to name the endpoint at all
and said in terms that writing it up was separate work. The owner ruled it a
hole in the contract rather than a new surface, which is why this one moves the
frozen section without changing a single status, body or field, and why no
criterion moves with it. AC-409 holds the new file to the schemas so that it
cannot quietly go stale the way the endpoint itself did.

**Sixth, and this one takes something away: 7.2 is retired (issue #113, 2026-09-04, on the
owner's ruling).** It is the first breaking change this frozen section has taken rather than
an addition, and the freeze's rule holds through it in the same way it held through 7.22 and
7.23 — a human decided. `GET` and `PATCH /me/settings` are deleted and answer 404; 7.23's
`/settings` bundle is the settings surface. The ground is the one 7.23 made unavoidable to
state: two endpoints over one row of `user_settings` is two contracts over one fact, which
4.19 asked not to have. **No data moves with it** — the three v1 columns stay stored and are
still derived into pins, and frozen 7.1's `GET /me` still answers them under its `settings`
key, so AC-116 is untouched. Five criteria moved: AC-119 to AC-121 rewritten against the
bundle, AC-122 and AC-123 retired, each with its reason in 12.3. The retirement ships in the
same deploy as its client half (#150) and after it, which is what makes it safe.

**Eighth, 7.25 is a new subsection added 2026-09-20 (issue #224), and it is also
purely additive.** Task dependencies: one directed relation with three endpoints
around it, and nothing folded into TaskCard or TaskDetail, whose keys this section
does not touch. It is its own file rather than part of 7.6 because it has an
authorization argument 7.6 does not — that a dependency read must be able to say
"there is an edge here" while saying nothing whatever about the task at the other
end of it, including the state that would otherwise be derived from that task's
status.

**Seventh, 7.24 is a new subsection added 2026-09-20 (issue #223), and it is purely
additive.** It is the Dana Link foundation: a way to resolve a supported internal Dana
URL into the small summary a reference chip draws, and a contextual search for the
picker that will use it. No existing endpoint, response, status or field changes, and
nothing that parsed before stops parsing. It is written as its own file rather than
inside 7.10 because it is a surface with its own grammar, its own closed set of target
kinds, and an authorization argument of its own — that a reference never grants access,
and that an inaccessible target must be indistinguishable from a nonexistent one. It
adds no table: a Dana Link's durable form is the href a rich-content block already
holds, and 7.24 resolves it live.

| | File | Covers |
| - | - | - |
| 7.0 | [`07.0-conventions.md`](07.0-conventions.md) | 7.0 Conventions |
| 7.1 | [`07.1-auth-and-account.md`](07.1-auth-and-account.md) | 7.1 Auth and account |
| 7.2 | [`07.2-settings.md`](07.2-settings.md) | 7.2 Settings — **retired 2026-09-04** (issue #113); see 7.23 |
| 7.3 | [`07.3-connections.md`](07.3-connections.md) | 7.3 Connections (roster) |
| 7.4 | [`07.4-folders-and-membership.md`](07.4-folders-and-membership.md) | 7.4 Folders and membership |
| 7.5 | [`07.5-invites.md`](07.5-invites.md) | 7.5 Invites |
| 7.6 | [`07.6-tasks.md`](07.6-tasks.md) | 7.6 Tasks |
| 7.7 | [`07.7-steps.md`](07.7-steps.md) | 7.7 Steps |
| 7.8 | [`07.8-my-day-membership.md`](07.8-my-day-membership.md) | 7.8 My Day membership |
| 7.9 | [`07.9-reminder.md`](07.9-reminder.md) | 7.9 Reminder |
| 7.10 | [`07.10-views-and-search.md`](07.10-views-and-search.md) | 7.10 Views and search |
| 7.11 | [`07.11-server-authoritative-versus-client-convenience.md`](07.11-server-authoritative-versus-client-convenience.md) | 7.11 Server-authoritative versus client convenience |
| 7.12 | [`07.12-events-and-notifications.md`](07.12-events-and-notifications.md) | 7.12 Events and notifications |
| 7.13 | [`07.13-trash.md`](07.13-trash.md) | 7.13 Trash |
| 7.14 | [`07.14-comments.md`](07.14-comments.md) | 7.14 Comments |
| 7.15 | [`07.15-files.md`](07.15-files.md) | 7.15 Files |
| 7.16 | [`07.16-pages-shelves-and-acts.md`](07.16-pages-shelves-and-acts.md) | 7.16 Pages, shelves and acts |
| 7.17 | [`07.17-view-routes.md`](07.17-view-routes.md) | 7.17 View routes |
| 7.18 | [`07.18-search-extension.md`](07.18-search-extension.md) | 7.18 Search extension |
| 7.19 | [`07.19-place-covers.md`](07.19-place-covers.md) | 7.19 Place covers |
| 7.20 | [`07.20-sample-workspace.md`](07.20-sample-workspace.md) | 7.20 Sample workspace |
| 7.21 | [`07.21-place-descriptions.md`](07.21-place-descriptions.md) | 7.21 Place descriptions |
| 7.22 | [`07.22-data-export.md`](07.22-data-export.md) | 7.22 Data export |
| 7.23 | [`07.23-settings-bundle.md`](07.23-settings-bundle.md) | 7.23 The settings bundle |
| 7.24 | [`07.24-dana-link-references.md`](07.24-dana-link-references.md) | 7.24 Dana Link references |
| 7.25 | [`07.25-task-dependencies.md`](07.25-task-dependencies.md) | 7.25 Task dependencies |
