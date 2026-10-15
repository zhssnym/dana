# What's New publishing

The one release-history source is feed.json. Dana builds its public /updates pages
from this file. Vite also publishes the exact same JSON at /updates/feed.json for
the future in-app menu (#680). No database, CMS, or manual announcement per PR.

## Entry format

Each entry has one stable ID of the form pr-123, a date when it first entered the
public history (UTC), kind (feature, improvement, fix), a plain title, a short
description, PR number, and the merged Git commit. Historical backfill entries use
historical=true. They appear separately and do not create unread notifications.

Group daily updates by publication date. Do not claim a PR became public on its
merge date. The code must be confirmed in production before a new entry is written.

Correct an inaccurate published entry in feed.json with a normal, reviewed PR.
Do not delete or change an existing announcement through the automated publisher.
To omit a future PR, add the optional label updates:skip (or release:skip).
To include a user-facing change without a recognized prefix or client file, add
updates:include (or release:include). Clear user-facing copy is still required.

## Automation and setup

GitHub Actions runs the What's New maintenance workflow after successful main
CI and every six hours. It reads /api/v1/build and checks that the PR's squash
merge commit is an ancestor of the actual production Git SHA.

The workflow checks PR titles, their user-facing source changes, and the first
useful description in the PR. Technical maintenance is skipped. Ambiguous
user-facing descriptions create review issues instead of guessed release notes.

The existing HELP_BOT_TOKEN secret is reused. Configure it as a fine-grained
token for a dedicated bot with Contents and Pull requests write permissions,
so its generated PRs trigger standard GitHub CI. Without the token, the
workflow safely skips generation and the public history still works.

UPDATES_AUTOPUBLISH is an optional repository variable. It defaults to off.
Test and review a bot-created release history PR before setting it to true.

When enabled, publication runs only after the current bot PR passes CI. It
verifies the PR author, current checked head SHA, production ancestor, file
scope, and that all previous entries are unchanged. It then squash-merges
the canonical feed update. The new feed becomes public only when that
new merge deploys successfully.

GitHub Actions and Render deployment timing can differ. Merge is not
deployment confirmation. Workflow retries must never invent the release time
or publish information about unshipped features.

## Historical starting point

The initial backfill includes selected shipped user-facing PRs. The automatic
scanner starts after main commit a25621c4a52fd65a88335f5803e2dd2466bc5090,
the merge that introduced the Help maintenance foundation. It does not generate
a raw change log for every older technical PR.

Run npm run updates:check after changing this file. CI runs this check plus the
application and browser tests.
