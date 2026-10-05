// The one confirmation dialog. The message is the title as one text run (AC-183).
// Initial focus is the popup, so a reflexive Enter runs nothing. A `decided` ref stops
// Continue from also firing `onCancel` when the close settles.
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

/** The fixed control names (spec 9.1); not the caller's to change. */
const CONTINUE = 'Continue'
const CANCEL = 'Cancel'

interface ConfirmDialogProps {
  /** The fixed sentence the spec writes for this action. */
  readonly message: string
  readonly onContinue: () => void
  readonly onCancel: () => void
  /**
   * A destructive confirm may name its actions ("Delete", "Keep it") instead of the
   * default pair.
   */
  readonly confirmLabel?: string
  readonly cancelLabel?: string
  /** One muted sentence under the message, for what the title cannot say. */
  readonly description?: string
  /**
   * An irreversible act asks the person to type this word; Continue stays disabled until
   * it matches exactly.
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
