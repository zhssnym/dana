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

| | File | Covers |
| - | - | - |
| 7.0 | [`07.0-conventions.md`](07.0-conventions.md) | 7.0 Conventions |
| 7.1 | [`07.1-auth-and-account.md`](07.1-auth-and-account.md) | 7.1 Auth and account |
| 7.2 | [`07.2-settings.md`](07.2-settings.md) | 7.2 Settings |
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
