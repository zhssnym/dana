# Changing the frontend from a backend task

You are working on a backend issue and you have found that something in
`app/src/client/` needs to change. This file tells you what to do.

**This rule binds Hassan too.** It is not a leash on Imran. A quick frontend fix from this
side is how he discovers his own area changed underneath him.

---

## Read this before the rules, because it changes how you should feel about them

The obvious argument for a light touch here is that frontend mistakes are visible: a broken
screen looks broken. **That argument is false for you**, and the reason is worth knowing.

- `app/vitest.config.ts:5` sets `environment: 'node'` for the entire suite.
- `jsdom` and four `@testing-library` packages are in `package.json`, and **nothing in the
  repository imports them.**
- So `npm test` proves the client **compiles**. It proves almost nothing about what it does.
- Client behaviour lives in 109 Playwright specs, which `CLAUDE.md` records as awkward to run
  locally and slow when they do run.

**For an agent working from a terminal, most of the frontend is as silent as a migration.**
You will not see the broken screen. A human with a browser would; you will not.

That is why the criteria below matter more than the short list, and why one specific rule
exists at the bottom about what counts as having tested a client change.

---

## Question 1: is it one of these four?

**If yes, stop and hand it off, however small the change looks.**

| What | Dependents | Why you must not judge this one |
| - | - | - |
| `app/src/client/parts/presenters.ts` | 32 files | It turns data into the words on screen, and its own header says it plainly: **"No acceptance criterion sees this file."** The tests assert a due badge *exists*, never what it *says*. This has already shipped a real bug: commit `359d28d`, where `personDisplay` dropped `avatar_url` across nine surfaces and a human found it by looking at the product. |
| `app/src/client/styles/tokens.css` | 101 of the 116 files that render | Every colour, size and radius in the product. The values are effectively untested: `foundation.test.ts` asserts two strings are present and nothing about whether any value is right. A wrong hex passes the entire suite. |
| `app/src/client/api/queryClient.ts` and `api/http.ts` | under everything | `networkMode: 'always'` at `queryClient.ts:105` is spec 10.6, not tuning. The library default, `'online'`, silently creates the offline write queue the spec forbids. One Playwright criterion catches it. Nothing else does. |
| Renaming a `localStorage` or `sessionStorage` key | 16 key constants | **The only genuinely irreversible thing in the client.** A renamed key silently resets that preference for every existing user, and no later deploy can reach the orphaned value. |

**And one habit, not a file: do not add a `fetch` outside `api/http.ts`.** That file is where
the CSRF header and the timezone parameter are added, once, for everything. Its own comment
at line 4 claims nothing else calls `fetch` directly, and that claim is **already false** at
`components/folder-cover.tsx:192`. Nothing enforces it: the eslint boundary rules restrict
imports of `server/` and `db/`, not this.

---

## Question 2: otherwise, judge it

This carries almost all the weight on this side. The list above is four items; the backend's
equivalent is six, and the frontend's are narrower. That is the honest extent, and padding it
to look symmetrical would make a rule nobody believes.

**Make the change yourself if all four are true:**

- you can describe it in one sentence;
- it touches at most two files inside `app/src/client/`;
- it changes no shared component that many screens render, and no value in `tokens.css`;
- **you can name how you checked it**, and see the next section, because for the client that
  bar is higher than it looks.

**Hand it off if any is false, or if you are unsure.**

Typical safe changes: a string, a label, a `console` removal, a type annotation, wiring an
existing component to a field that already exists in the response.

---

## What counts as having tested a client change

**`npm test` is not an answer.** Under `environment: 'node'` it tells you the client compiles.
For a change to what a person sees, that is not evidence.

The honest answers are:

- you ran the specific Playwright spec that covers it, and you name it; or
- you ran the app and looked, and you say so; or
- **you say plainly that it was not verified in a browser.**

The third is an acceptable answer. Claiming the first while having done the third is not, and
it is the exact failure the "name the command" rule exists to prevent.

---

## When you stop, hand off properly

Open an issue with the **Handoff to frontend** template. It sets the label and assigns Imran.

Its first question separates three kinds of change, and only one is dangerous:

- **Additive.** Nothing breaks; there is just new work to do.
- **Breaking, and the type checker catches it.** The build fails and announces itself. This is
  the good case.
- **Breaking, and nothing catches it.** A field that changes meaning, a value that starts
  arriving as `null`, an endpoint that gets stricter. Nothing fails to compile and the screen
  just misbehaves. **This is the one that needs the issue**, because it is invisible from the
  frontend until a user hits it.

---

## When you do make a frontend change

Say so in the pull request, in the section that asks, with one line on why. Imran cannot read
the backend half of your diff, so the frontend half is the part he *can* review. Do not make
him find it.
