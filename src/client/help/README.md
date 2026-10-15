# Public help content

The public /help routes read Markdown articles from articles/. They are separate from
the internal docs/ developer rules, architecture and troubleshooting.

Each article starts with four frontmatter fields:

- title: A plain question or action in Dana's current terminology.
- summary: One sentence about what the reader will learn.
- section: One value from HELP_SECTIONS in content.ts.
- related: Optional comma-separated slugs of existing articles.

Stable URLs use the filename as the slug. Rename or remove a slug only with an explicit redirect.
Keep one article per subject. Update existing steps when behavior changes; do not create
another article for every PR. [[shortcuts]] inserts the shared shortcut reference.

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

Explain an action, not a marketing promise. Use short steps, familiar labels and specific
outcomes. Do not invent controls or describe unfinished features as available. When source
and UI disagree, verify the running app before changing the guide.

The reader intentionally supports only headings, paragraphs, numbered/bulleted lists,
safe Markdown links, bold and inline code. Avoid raw HTML and complex Markdown.
New content and changed shortcuts need source or browser verification.

Automated writing and ongoing documentation validation belong to #678.
