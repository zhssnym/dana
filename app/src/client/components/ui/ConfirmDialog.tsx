/*
Every confirmation of 9.3 to 9.9, as one component.

Section 9 writes its confirmations word for word and each of them describes an
effect the person cannot see from where they are standing. The message is the
whole of the specified content, passed in rather than composed here, and it is
rendered as one uninterrupted text run: AC-183 refuses normative copy split
across a heading and a paragraph, so the whole sentence is the dialog's title
and there is no separate body, exactly as `pages/task-rows.tsx` renders the
row confirms it now delegates to this component.

**The two controls are named by 9.1's control table and are exact.** "The two
controls of every confirmation (9.3 to 9.9)" are "Continue" and "Cancel", and
no caller may rename either, which is why neither is a prop.

Built on the `alert-dialog.tsx` family so a task confirm and a folder confirm
are the same surface: same scrim, same panel, same footer, same motion. The
primitive supplies the obligations the old hand-rolled version discharged
itself: `role="alertdialog"` announcing the message, a focus trap, Escape
cancelling, and focus returning to whatever opened it. Initial focus is the
primitive's default, the popup itself, so a reflexive Enter runs nothing and
the first Tab lands on Cancel, the safe control.

Continue closes through the same open-state as Escape, so a `decided` ref
separates the two paths: without it, confirming would also fire `onCancel`
when the close settles, and a caller cannot be asked to tolerate both
callbacks for one press.
*/
import { useId, useRef, useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog.js'
import { Input } from './input.js'

/** 9.1's control table, and not the caller's to change. */
const CONTINUE = 'Continue'
const CANCEL = 'Cancel'

interface ConfirmDialogProps {
  /** The normative sentence section 9 writes for this action. */
  readonly message: string
  readonly onContinue: () => void
  readonly onCancel: () => void
  /**
   * A destructive confirm may name what
   * the press does ("Delete") and what declining keeps ("Keep it") in place of
   * 9.1's uniform pair, which 9.1 now allows for the task's confirms. Absent,
   * the pair stands.
   */
  readonly confirmLabel?: string
  readonly cancelLabel?: string
  /** One muted sentence under the message, for what the title cannot say. */
  readonly description?: string
  /**
   * r5: an irreversible act (deleting the account) asks the person to type
   * this word first; Continue stays disabled until it matches exactly.
   */
  readonly requireText?: string
  /** False for a confirm that destroys nothing: Continue is neutral. */
  readonly destructive?: boolean
}

export function ConfirmDialog({
  message,
  onContinue,
  onCancel,
  confirmLabel = CONTINUE,
  cancelLabel = CANCEL,
  description,
  requireText,
  destructive = true,
}: ConfirmDialogProps): React.JSX.Element {
  const decided = useRef(false)
  const [typed, setTyped] = useState('')
  const typedId = useId()
  const blocked = requireText !== undefined && typed !== requireText

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !decided.current) onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{message}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {requireText !== undefined ? (
          <div className="flex flex-col gap-1">
            <label htmlFor={typedId} className="text-xs text-muted-foreground">
              Type {requireText} to confirm
            </label>
            <Input
              id={typedId}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            destructive={destructive}
            disabled={blocked}
            onClick={() => {
              decided.current = true
              onContinue()
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
