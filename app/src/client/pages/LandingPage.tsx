/*
9.2's public page, at `/`.

Four rules and one paragraph: one screen describing the shipping product,
collaborative to-do lists in shareable folders; no AI claim anywhere in v1
copy; a single "Continue with Google" button; privacy and terms links.

**Single** is the word to keep. The ordinary way one call to action becomes two
is a hero and a footer, and a page with two of them fails a criterion written
against exactly that. So the sign-in path appears once, in the hero, and the
footer below carries the two links 9.2 asks for and nothing else.

**The claim rule is broken by addition**, so the thing to watch when this copy
changes is what gets added rather than what is here. Section 13 item 14 records
the final wording as the designer's under that rule; what is below is
placeholder copy that obeys it, and the rule outlives the copy.

**The words are the owner's, written by him on 2026-08-11.** Section 13 item
14 recorded the final wording as the designer's; he chose among four drafts
and wrote it himself instead, which is his to do, item 14 being an open
question rather than frozen text and RFC 0001 already reading it as closing
when this package lands the copy. The structure around the strings is this
file's and does not move: a hero carrying the product sentence and the single
call to action, a block of points, and a footer of links.

The one thing a later rewrite may not do is add a claim:
`tests/e2e/ac-159-landing-page.spec.ts` reads the whole rendered body for one,
which is the only way a rule broken by addition can be measured at all.

The sign-in link carries the browser's zone, which is 7.1's optional tz: it
rides the pending-authorization record to the callback, where it becomes the
new account's timezone. A value that fails validation is treated as absent
rather than refused there, a deliberate deviation so a stale zone database
cannot lock anyone out of signing in.

This page renders whether or not there is a session. A client that redirected
signed-in visitors away from `/` would hide the only surface an
unauthenticated person ever sees from everyone who could check it.
*/
import { browserTimezone } from '../api/tz.js'

/*
The owner's copy, ruled 2026-08-11. Collected here rather than written into
the markup below so that a later revision is a diff over this block alone.

The third point's closing clause is worth a sentence, because it looks like
decoration and is not. The owner's own draft ended at the task landing on the
assignee's day; Q1's predicate is an assignee **and** a due date that has
arrived, which is what that query's empty state tells a person in its own
words, so a point promising the first alone would describe a page Dana does
not have. The clause was corrected before it reached this session.
*/
const HEADLINE = 'A shared to-do list, and nothing else.'
const SUBHEAD =
  'Folders you can share, tasks with dates, and the people they belong to. ' +
  'No databases, no wikis, no setup.'
const POINTS = [
  'Share a folder once. Everything you put in it is already shared.',
  'A task with a date appears on that day. There is no second place to file it.',
  'Hand a task to someone and it shows up on their day, on the date you set.',
] as const

export function LandingPage(): React.JSX.Element {
  const signInHref = `/api/v1/auth/google?tz=${encodeURIComponent(browserTimezone())}`
  return (
    <main>
      <header>
        <p className="text-heading">Dana</p>
      </header>

      <section aria-label="What Dana is">
        <h1 className="text-title">{HEADLINE}</h1>
        <p className="text-body">{SUBHEAD}</p>
        {/* The single call to action of 9.2, and the only one on the page. A
            link rather than a button because it is a navigation to 7.1's
            endpoint; 9.2 calls it a button and 9.1's addressing sentence
            fixes the name rather than the element, which is why the criterion
            admits either role under that one name. */}
        <a href={signInHref}>Continue with Google</a>
      </section>

      <section aria-label="What Dana does">
        <ul>
          {POINTS.map((point) => (
            <li className="text-body" key={point}>
              {point}
            </li>
          ))}
        </ul>
      </section>

      <footer>
        <ul>
          <li>
            <a href="/privacy">Privacy</a>
          </li>
          <li>
            <a href="/terms">Terms</a>
          </li>
        </ul>
      </footer>
    </main>
  )
}
