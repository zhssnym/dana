// @vitest-environment jsdom

/*
What a conversation offers somebody who may read it and not write in it:
AC-790's composer half, and the only evidence in the vitest suite that the
owner's ruling of 2026-09-20 on issue #268 reached a screen. That ruling is
two comments, and this half rests on the second:
https://github.com/zhssnym/dana/issues/268#issuecomment-5753983138
hides Reply below Can comment, disables the composer rather than hiding it,
and disables an existing reaction pill, while
https://github.com/zhssnym/dana/issues/268#issuecomment-5753495877
carries the `my_access` field and the authorship half.

**Why this one is rendered when the rest of AC-790 is not.** Every other half
of that criterion is a decision in a pure function — `folderGates`,
`toConceptComments`, `mayPurge` — and is driven as one. The composer's is not:
`canComment` is a prop on the lifted component, and what it buys is a
*disabled field carrying a particular sentence*, which no pure function
returns. `person-face.test.tsx` beside this file carries the argument for
rendering at all and the `@vitest-environment jsdom` docblock that buys it.

**What is asserted, and what deliberately is not.** That the field is
disabled, that it carries the sentence, that Reply is drawn or not, and that
the enabled composer is unchanged. Not the layout, not the styling, and not
the attach menu's contents: those are the browser leg's, and this file exists
because the decision is invisible to it today rather than to replace it.
*/
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, test } from 'vitest'

import { CommentsThread } from './comments.js'
import type { ConceptComment } from '../tasks/task-model.js'

afterEach(cleanup)

/*
The composer draws the viewer's own face through `useViewerPerson`, which is
`useMe()`, so this component needs a query client to mount at all -- the same
wrapper `views/usePlace.test.tsx` uses and for the same reason. Nothing here
answers a request: `retry: false` and no fetch means `useMe()` stays pending,
`useViewerPerson` falls back to "You", and the composer renders. That is the
real loading state of every one of these surfaces, so mounting in it is
honest rather than convenient.
*/
function mount(ui: React.JSX.Element): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const SENTENCE = 'You can read this conversation. Commenting needs Can comment.'

function comment(overrides: Partial<ConceptComment> = {}): ConceptComment {
  return {
    id: 'c1',
    author: { initials: 'SE', name: 'Someone Else' },
    at: '2h',
    body: 'somebody else said this',
    mine: false,
    ...overrides,
  }
}

describe('AC-790 the composer, for a member who may only read', () => {
  test('AC-790: the field is disabled and says what standing commenting needs', () => {
    mount(
      <CommentsThread comments={[comment()]} canComment={false} onChange={() => {}} />,
    )
    const field = screen.getByLabelText(SENTENCE)
    expect(field, 'the sentence stands in for the placeholder').toBeDefined()
    expect(
      (field as HTMLTextAreaElement).disabled,
      'disabled rather than hidden: it carries a fact the person may read',
    ).toBe(true)
  })

  test('AC-790: and it is still there — hiding it would hide the fact with the act', () => {
    mount(
      <CommentsThread comments={[comment()]} canComment={false} onChange={() => {}} />,
    )
    expect(screen.queryByLabelText(SENTENCE)).not.toBeNull()
  })

  /*
  The composer's **third** guard, and the only one of the three nothing else
  in the suite sees (review of #268, 2026-09-20).

  `disabled` on the textarea stops a person typing, and the undrawn send
  button stops them clicking. Neither stops `submitText`, because the field's
  own `onKeyDown` is what posts on Enter and a disabled element still receives
  a programmatic one -- and a jsdom `keyDown` is exactly that. The reviewer
  deleted `if (disabled) return` from `submitText` and the whole suite stayed
  green, 12 files and 181 tests, which is what this case is here to end. The
  same deletion was made again with this case in place, 2026-09-21: this one
  case fails and the seven others beside it pass, so what it pins is the
  guard and not the wiring.

  It is not a hypothetical about jsdom. `fireEvent` dispatches an untrusted
  event, and so does anything else that reaches this handler without a
  keyboard: the guard is the only thing between a refused conversation and a
  201 nobody meant to send.
  */
  test('AC-790: Enter in the disabled field posts nothing', () => {
    let posted = 0
    mount(
      <CommentsThread
        comments={[comment()]}
        canComment={false}
        onChange={() => {
          posted += 1
        }}
      />,
    )
    const field = screen.getByLabelText(SENTENCE)
    fireEvent.change(field, { target: { value: 'ac790 a comment nobody may make' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(
      posted,
      '`submitText` refuses on `disabled`: the field and the send button are not the whole guard',
    ).toBe(0)
  })

  test('AC-790: no Reply is offered on a comment in that thread', () => {
    mount(
      <CommentsThread
        comments={[comment({ replyable: false })]}
        canComment={false}
        onChange={() => {}}
      />,
    )
    expect(
      screen.queryByRole('button', { name: 'Reply' }),
      'replying is `comment.create`, and it is hidden rather than disabled',
    ).toBeNull()
  })
})

describe('AC-790 the composer, for a member who may write', () => {
  test('AC-790: the field is enabled and carries the ordinary placeholder', () => {
    mount(<CommentsThread comments={[comment()]} onChange={() => {}} />)
    const field = screen.getByLabelText('Write a comment')
    expect((field as HTMLTextAreaElement).disabled).toBe(false)
    expect(screen.queryByLabelText(SENTENCE)).toBeNull()
  })

  test('AC-790: Enter in the enabled field does post, so the guard above is the disabling and not the wiring', () => {
    let posted = 0
    mount(
      <CommentsThread
        comments={[comment()]}
        onChange={() => {
          posted += 1
        }}
      />,
    )
    const field = screen.getByLabelText('Write a comment')
    fireEvent.change(field, { target: { value: 'ac790 an ordinary comment' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(
      posted,
      'the same two events on an enabled composer post once, which is what makes the refusal above evidence',
    ).toBe(1)
  })

  test('AC-790: an empty thread still invites the first comment', () => {
    mount(<CommentsThread comments={[]} onChange={() => {}} />)
    expect(screen.queryByLabelText('Write the first comment')).not.toBeNull()
  })

  test('AC-790: Reply is offered on a comment that allows it', () => {
    mount(
      <CommentsThread
        comments={[comment({ replyable: true })]}
        onChange={() => {}}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeNull()
  })
})
