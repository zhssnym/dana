# Public help content

The public /help routes read Markdown articles from articles/. They are separate from
the internal docs/ developer rules, architecture and troubleshooting.

Each article starts with three frontmatter fields:

- title: The concept, in Dana's current terminology.
- summary: One sentence about what the reader will learn.
- related: Optional comma-separated slugs of existing articles.

Stable URLs use the filename as the slug. Rename or remove a slug only with an entry in
MOVED_HELP in content.ts. Keep one article per concept. Add a section to an existing article
before you make a new one; do not make an article for each PR. [[shortcuts]] inserts the shared shortcut reference.

## Source inventory for the initial help set

| Topic | Current source to check |
| --- | --- |
| Sign-in, Desk, pages | src/client/pages/LandingPage.tsx, src/client/shell/sidebar/, docs/product-rules.md |
| Tasks, scheduling, lists | src/client/pages/TaskPage.tsx, src/shared/tasks.ts, src/server/views/cards.ts |
| Work views, editing | src/client/views/, src/client/components/page/canvas/, src/client/components/settings-page-content.tsx |
| Teammates, access, messaging | src/client/components/settings/people.tsx, src/shared/folder-actions.ts, docs/product-rules.md |
| Navigation, search, shortcuts | src/client/routes.ts, src/client/components/search-overlay.tsx, src/client/components/help-sheet.tsx |
| Settings, archive, feedback | src/client/components/settings-page-content.tsx, src/client/pages/ArchivedWorkPage.tsx, src/client/components/feedback/FeedbackDialog.tsx |

The Page/Facet model is changing (#671). Publish only behavior actually available.
An old PR or a proposed feature is not evidence that a screen works today.

## Editorial rules

Explain the concept first: two or three sentences on what the feature is and why it exists.
Then give the how in short sentences or bullets, with exact labels. Do not write
click-by-click steps; use a numbered list only when the order is not clear from the screen.
No marketing promises. Do not invent controls or describe unfinished features as available. When source
and UI disagree, verify the running app before changing the guide.

The reader intentionally supports only headings, paragraphs, numbered/bulleted lists,
safe Markdown links, bold and inline code. Avoid raw HTML and complex Markdown.
New content and changed shortcuts need source or browser verification.

Automated writing and ongoing documentation validation belong to #678.


## Automated maintenance

The article registry is in scripts/help/topics.mjs. It maps source areas to existing
article slugs. Keep this map current when you add or move a feature. Unknown user-facing
source changes are sent for review, not ignored.

CI runs npm run help:check. It checks frontmatter, categories, stable links, article
length and unsupported markup. A generated article must pass these checks before a PR
is created. Raw HTML is not permitted.

The Help maintenance workflow runs after successful main CI and every six hours as a
fallback. It reads the public /api/v1/build endpoint and proceeds only when Render's
RENDER_GIT_COMMIT confirms that the changed code is live. The endpoint returns HTTP
503 when the deployment identity is unavailable. The workflow never substitutes a
GitHub merge time or commit date for production verification.

The workflow uses the current code, changed tests, and affected article text as
evidence for a draft. It does not treat old PR descriptions as source of truth. Its
review stage checks exact source quotes, relevant changed tests, article scope,
links and writing quality. Uncertain changes create a draft PR or a specific
review issue. Removing an old guide always needs human review.

### Enable generation

Create these repository Actions secrets:

- OPENAI_API_KEY: A scoped API key for the documentation model. The workflow sends
  relevant source, test excerpts and existing help text to that model. Do not enable
  this step if the repository's code must not be shared with the selected provider.
- HELP_BOT_TOKEN: A fine-grained GitHub personal access token for this repository
  with Contents and Pull requests read/write. Use a dedicated bot account where
  possible. A PR created with this token triggers regular GitHub CI. A PR created
  with the workflow's GITHUB_TOKEN may not trigger those checks.

The connected GitHub code integration cannot create or read repository Actions secrets.
An administrator must supply them securely in **Settings → Secrets and variables → Actions**
at https://github.com/zhssnym/dana/settings/secrets/actions. Never put keys in
source files, PR comments, or chat messages.

When either required secret is absent, the audit now pauses before marking commits
reviewed or raising per-commit issues. An earlier setup-only audit marked
`action_required` is automatically retryable once the secrets are available.

After adding both secrets, open **Actions → Help maintenance → Run workflow** to
validate a deployed commit; review any generated PR or exception issue before
enabling unattended publication.

Optional repository variables:

- HELP_WRITER_MODEL: The model used for drafting and verification. Defaults to
  gpt-4.1-mini.
- HELP_AUTOPUBLISH: Set to true **only after** a test-generated PR has passed
  verification and manual review. Its default is off. When enabled, a second
  workflow merges only a nondraft Help-bot PR whose latest head passed CI, whose
  files are only Help Markdown articles, and whose source code is confirmed live.

The workflow records an audit check on each inspected main commit. When a required
secret is absent, evidence is missing, or a model answer is uncertain, it opens a
review issue and does not publish changes. Use the Help maintenance workflow's
manual Force input to retry after a configuration or documentation fix.

The automatic scan starts after the Help Center redesign commit
235ff6b509ab5791319c3bfb953bc3550c43fa74. The initial help articles were
created under #677. Their first audit is separate from the incremental change scan.

The documentation model can be wrong even when its checks pass. Keep the exception
queue and audit history available, and periodically spot-check published guides
against the running application.
