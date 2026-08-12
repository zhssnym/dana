/*
Every confirmation of 9.3 to 9.9, as one component.

Section 9 writes four confirmations word for word and each of them describes
an effect the person cannot see from where they are standing: abandoning
takes a task off My Day and leaves it everywhere else, deleting a folder
deletes tasks for every member, un-completing a repeat takes the next
occurrence with any edits already made to it, and deleting a task cannot be
undone. The message is therefore the whole of the specified content, and it
is passed in rather than composed here.

**The two controls are named by 9.1's control table and are exact.** "The two
controls of every confirmation (9.3 to 9.9)" are "Continue" and "Cancel", and
the table's own paragraph gives the reason: the destructive verb is already in
the message the person is reading, so spelling it on the button buys nothing
and costs four more strings to keep in step with four messages. Uniform means
uniform: no caller may rename either control, which is why neither is a prop.

Three accessibility obligations this component discharges so no caller has to,
all of them the persona's ("focus management in dialogs and overlays"):

- **`alertdialog`, not `dialog`.** The role exists for exactly this: a modal
  interrupting to get a confirmation about a consequence. It makes the message
  the dialog's own description, so a screen reader announces the sentence on
  arrival rather than only the two buttons.
- **Focus enters and comes back.** Focus moves into the dialog on open and
  returns on close to whatever held it, which is the control the person
  pressed. Without the return, dismissing a menu's confirm drops focus onto
  the document and the next tab starts at the top of the page.
- **Focus lands on Cancel.** The safe control, deliberately: a confirm whose
  destructive button has focus turns a reflexive Enter into the thing the
  dialog was asked to prevent. Escape cancels for the same reason.

The dialog is rendered where its caller sits rather than through a portal. It
is fixed-position, so its ancestors do not place it, and keeping it in the
tree keeps its focus return and its unmount tied to the state that opened it.
*/
import { useEffect, useRef } from 'react'

/** 9.1's control table, and not the caller's to change. */
const CONTINUE = 'Continue'
const CANCEL = 'Cancel'

interface ConfirmDialogProps {
  /** The normative sentence section 9 writes for this action. */
  readonly message: string
  readonly onContinue: () => void
  readonly onCancel: () => void
}

export function ConfirmDialog({
  message,
  onContinue,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element {
  const dialog = useRef<HTMLDivElement | null>(null)
  const cancel = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const returnTo = document.activeElement
    cancel.current?.focus()
    return () => {
      if (returnTo instanceof HTMLElement && returnTo.isConnected) returnTo.focus()
    }
  }, [])

  /*
  The trap, over the dialog's own focusable elements rather than over a
  computed list: this dialog has exactly two controls and always will, because
  9.1 fixes them. Tab cycles between them and Escape cancels, so nothing
  behind the dialog can be reached while it is open, which is what "modal"
  means to a keyboard.
  */
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = dialog.current?.querySelectorAll('button') ?? []
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (first === undefined || last === undefined) return
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
      return
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="dialog-scrim" onKeyDown={onKeyDown}>
      <div
        ref={dialog}
        role="alertdialog"
        aria-modal="true"
        aria-describedby="dana-confirm-message"
        className="dialog-panel"
      >
        <p id="dana-confirm-message">{message}</p>
        <div className="dialog-actions">
          <button
            type="button"
            ref={cancel}
            className="button-base button-default"
            onClick={onCancel}
          >
            {CANCEL}
          </button>
          <button
            type="button"
            className="button-base button-danger"
            onClick={onContinue}
          >
            {CONTINUE}
          </button>
        </div>
      </div>
    </div>
  )
}
