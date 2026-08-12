import { useState } from "react"
import { Mail, UserPlus, UsersRound } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

function MemberRow({
  initials,
  name,
  joined,
  owner = false,
  removable = false,
  onRemove,
}: {
  initials: string
  name: string
  joined: string
  owner?: boolean
  removable?: boolean
  onRemove?: () => void
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-md px-2 hover:bg-[var(--color-graphite-50)]">
      <Avatar className="size-8">
        <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
          {owner ? <Badge variant="secondary">Owner</Badge> : null}
        </div>
        <p className="text-xs text-muted-foreground">Joined {joined}</p>
      </div>
      {removable ? (
        <Button
          variant="ghost"
          className="h-8 px-2 text-xs text-muted-foreground"
          onClick={onRemove}
        >
          Remove
        </Button>
      ) : null}
    </div>
  )
}

export function SharingPanel({
  open,
  onOpenChange,
  isOwner = true,
  folderName = "Wedding",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isOwner?: boolean
  folderName?: string
}) {
  const [connection, setConnection] = useState("")
  const [saraPresent, setSaraPresent] = useState(true)
  const [noorAdded, setNoorAdded] = useState(false)
  const [removingMember, setRemovingMember] = useState<"Sara Khan" | "Noor Ali" | null>(null)
  const [email, setEmail] = useState("")
  const [pendingInvites, setPendingInvites] = useState(["hassan@example.com"])

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[440px] sm:max-w-none"
        overlayClassName="bg-black/20 backdrop-blur-none"
      >
        <SheetHeader className="border-b border-border px-5 py-4 pr-16">
          <SheetTitle className="text-base font-semibold">Share {folderName}</SheetTitle>
          <SheetDescription>
            Members can view and manage every task in this folder.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <section aria-labelledby="share-members">
            <div className="mb-2 flex items-center gap-2">
              <UsersRound className="size-4 text-muted-foreground" strokeWidth={1.75} />
              <h3 id="share-members" className="text-sm font-semibold">Members</h3>
            </div>
            <div className="space-y-0.5">
              <MemberRow initials="IW" name="Imran Wafa" joined="4 Aug 2026" owner />
              {saraPresent ? (
                <MemberRow
                  initials="S"
                  name="Sara Khan"
                  joined="8 Aug 2026"
                  removable={isOwner}
                  onRemove={() => setRemovingMember("Sara Khan")}
                />
              ) : null}
              {noorAdded ? (
                <MemberRow
                  initials="N"
                  name="Noor Ali"
                  joined="today"
                  removable={isOwner}
                  onRemove={() => setRemovingMember("Noor Ali")}
                />
              ) : null}
            </div>
          </section>

          <section className="mt-7" aria-labelledby="share-connected">
            <div className="mb-2 flex items-center gap-2">
              <UserPlus className="size-4 text-muted-foreground" strokeWidth={1.75} />
              <h3 id="share-connected" className="text-sm font-semibold">
                Share with someone you&apos;re connected to
              </h3>
            </div>
            <div className="flex gap-2">
              <Select
                value={connection}
                onValueChange={(value) => setConnection(value ?? "")}
              >
                <SelectTrigger aria-label="Choose a connection">
                  <SelectValue>
                    {(value: string | null) =>
                      value === "noor" ? "Noor Ali" : "Choose a person"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="noor">Noor Ali</SelectItem>
                </SelectContent>
              </Select>
              <Button
                className="h-[var(--control-height)] bg-[var(--color-graphite-900)] px-4 text-white hover:bg-[var(--color-graphite-800)]"
                disabled={!connection || noorAdded}
                onClick={() => setNoorAdded(true)}
              >
                Add
              </Button>
            </div>
          </section>

          <section className="mt-7" aria-labelledby="share-email">
            <div className="mb-2 flex items-center gap-2">
              <Mail className="size-4 text-muted-foreground" strokeWidth={1.75} />
              <h3 id="share-email" className="text-sm font-semibold">Invite by email</h3>
            </div>
            <div className="flex gap-2">
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-[var(--control-height)] text-sm md:text-sm"
                placeholder="name@example.com"
                aria-label="Email address"
              />
              <Button
                className="h-[var(--control-height)] bg-[var(--color-graphite-900)] px-4 text-white hover:bg-[var(--color-graphite-800)]"
                disabled={!email.includes("@")}
                onClick={() => {
                  setPendingInvites((current) => [...current, email.trim()])
                  setEmail("")
                }}
              >
                Send invite
              </Button>
            </div>
          </section>

          {pendingInvites.length > 0 ? (
            <section className="mt-7" aria-labelledby="pending-invites">
              <h3 id="pending-invites" className="mb-2 text-sm font-semibold">
                Pending invites
              </h3>
              <div className="space-y-1">
                {pendingInvites.map((pendingEmail) => (
                  <div
                    key={pendingEmail}
                    className="flex min-h-14 items-center gap-3 rounded-md px-2 hover:bg-[var(--color-graphite-50)]"
                  >
                    <Avatar className="size-8">
                      <AvatarFallback className="text-xs">@</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{pendingEmail}</p>
                      <p className="text-xs text-muted-foreground">Sent today</p>
                    </div>
                    <Button
                      variant="ghost"
                      className="h-8 px-2 text-xs text-muted-foreground"
                      onClick={() =>
                        setPendingInvites((current) =>
                          current.filter((item) => item !== pendingEmail),
                        )
                      }
                    >
                      Cancel
                    </Button>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span tabIndex={0} className="inline-flex">
                            <Button variant="ghost" className="h-8 px-2 text-xs" disabled>
                              Resend
                            </Button>
                          </span>
                        }
                      />
                      <TooltipContent>Resent recently</TooltipContent>
                    </Tooltip>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
    <AlertDialog
      open={removingMember !== null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setRemovingMember(null)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {removingMember}?</AlertDialogTitle>
          <AlertDialogDescription>
            They&apos;ll lose access to {folderName}. Tasks assigned to them in this folder will become unassigned.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            destructive
            onClick={() => {
              if (removingMember === "Sara Khan") setSaraPresent(false)
              if (removingMember === "Noor Ali") setNoorAdded(false)
              setRemovingMember(null)
            }}
          >
            Remove member
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
