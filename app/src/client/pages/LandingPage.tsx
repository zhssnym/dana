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

**The structure is this session's and the words are not.** 9.2 specifies one
screen and names three things on it, so what this file fixes is the frame: a
hero carrying the product sentence and the single call to action, a block of
points about what the product does, and a footer of links. Every string below
is a placeholder in a slot, marked so, and replacing one is an edit to a
sentence rather than to this page. The one thing a rewrite may not do is add a
claim: `tests/e2e/ac-159-landing-page.spec.ts` reads the whole rendered body
for it, which is the only way a rule about addition can be measured.

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
Placeholder copy, in the slots the structure above fixes. Section 13 item 14
records the final wording as the designer's, so these are here to be replaced
rather than to be kept, and each one obeys 9.2's rule about what may not be
said. Collected at the top of the file rather than written into the markup so
that a rewrite is a diff over this block alone.
*/
const HEADLINE = 'Shared to-do lists that stay in one place.'
const SUBHEAD =
  'Put your tasks in folders, share a folder with the people it concerns, and everyone ' +
  'sees the same list.'
const POINTS = [
  'Give anything a date and it shows up on the day it is due.',
  'Assign a task to someone in the folder and it shows up on their day.',
  'Repeat, remind, and break a task into steps when it needs them.',
] as const

export function LandingPage(): React.JSX.Element {
  const signInHref = `/api/v1/auth/google?tz=${encodeURIComponent(browserTimezone())}`
  return (
    <main>
      <header>
        <p>Dana</p>
      </header>

      <section aria-label="What Dana is">
        <h1>{HEADLINE}</h1>
        <p>{SUBHEAD}</p>
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
            <li key={point}>{point}</li>
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
