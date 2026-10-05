// The transfer-ownership dialog: pick a member with Full control to hand the page to.
import type { useTransferOwnership } from '../../api/mutations.js'
import { Button } from '../../components/ui/button.js'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog.js'
import { PersonFace } from '../../components/person-face.js'
import { cn } from '../../components/ui/utils.js'
import { eligibleSuccessors } from '../../lib/folder-authority.js'
import { showToast } from '../../state/toasts.js'
import type { FolderMember } from '../../../shared/folders.js'

/*
9.6: an owner with other members leaves only by transferring first.

**The list is every member who currently holds Full control, and the
dialog says so.** Joining first is not evidence that anybody intended you
to hold custody, and the server answers a target below Full control `422
to: must be a member of this folder who currently has Full control`.

**There is no default and nothing is sorted**, because no rule would order
them: the roster's own order is used, which is the order the Share panel
this person just came from shows. A single candidate is picked
already, since there is nothing to choose between.

**An empty list is a sentence and not an empty box.** A folder can be full
of people and have nobody eligible, and that person's next step — give
somebody Full control in Share, then come back — is not something an empty
picker communicates. The wording follows the server's own refusal copy,
"This folder would be left with nobody in Full control".
*/
export function TransferOwnershipDialog({
  transferOpen,
  setTransferOpen,
  transferTo,
  setTransferTo,
  members,
  viewerId,
  projectName,
  folderName,
  headId,
  transfer,
  setSharing,
}: {
  readonly transferOpen: boolean
  readonly setTransferOpen: (next: boolean) => void
  readonly transferTo: string | null
  readonly setTransferTo: (next: string | null) => void
  readonly members: readonly FolderMember[]
  readonly viewerId: string | null
  readonly projectName: string | undefined
  readonly folderName: string | undefined
  readonly headId: string
  readonly transfer: ReturnType<typeof useTransferOwnership>
  readonly setSharing: (next: boolean) => void
}): React.JSX.Element {
  /* Ownership passes only to a member who *currently* holds Full control, and
     there is no default successor; offering anyone else would be offering a
     choice the server answers 422. */
  const successors = eligibleSuccessors(members, viewerId)
  /* Who the transfer goes to: the pick while they still qualify, or the only
     candidate when nothing has been picked yet. A pick that lost Full control
     on a refetch leaves nothing selected; it never falls onto someone else. */
  const heir =
    transferTo === null
      ? successors.length === 1
        ? successors[0]
        : undefined
      : successors.find((member) => member.user.id === transferTo)
  return (
    <Dialog
      open={transferOpen}
      onOpenChange={(next) => {
        setTransferOpen(next)
        if (!next) setTransferTo(null)
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Transfer ownership</DialogTitle>
          <DialogDescription>
            {successors.length === 0
              ? `Nobody else in ${projectName ?? folderName ?? 'this page'} has Full control, so there is nobody to hand it to yet. Give a member Full control in Share, then transfer it to them.`
              : `Choose who owns ${projectName ?? folderName ?? 'this page'} next. Only members who have Full control can take it on, and you stay a member. Only the new owner can hand it back.`}
          </DialogDescription>
        </DialogHeader>
        {successors.length === 0 ? (
          <DialogFooter>
            <DialogClose render={<Button variant="ghost">Close</Button>} />
            <Button
              variant="outline"
              onClick={() => {
                setTransferOpen(false)
                setSharing(true)
              }}
            >
              Open Share
            </Button>
          </DialogFooter>
        ) : (
          <>
            {/* Picking a name only selects it: handing the page over is
                the footer's one button, which says so. */}
            <div role="group" aria-label="New owner" className="flex flex-col gap-[var(--space-row)]">
              {successors.map((member) => {
                const name = member.user.display_name ?? 'Someone'
                const picked = heir?.user.id === member.user.id
                return (
                  <button
                    key={member.user.id}
                    type="button"
                    aria-pressed={picked}
                    data-focus={picked ? 'self' : undefined}
                    className={cn(
                      'flex min-h-[var(--row-height)] w-full items-center gap-[var(--space-inline)] rounded-md px-2 text-left text-sm text-foreground',
                      picked ? 'bg-selected' : 'hover:bg-accent',
                    )}
                    onClick={() => {
                      setTransferTo(member.user.id)
                    }}
                  >
                    <PersonFace id={member.user.id} name={name} image={member.user.avatar_url} />
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                  </button>
                )
              })}
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="ghost">Cancel</Button>} />
              <Button
                variant="commit"
                disabled={heir === undefined || transfer.isPending}
                onClick={() => {
                  if (heir === undefined) return
                  transfer.mutate(
                    { id: headId, to: heir.user.id },
                    {
                      onSuccess: () => {
                        setTransferOpen(false)
                        setTransferTo(null)
                        showToast(
                          `${heir.user.display_name ?? 'Someone'} now owns ${folderName ?? 'this page'}`,
                        )
                      },
                    },
                  )
                }}
              >
                Transfer ownership
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
