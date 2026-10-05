// The shared head of a place page: cover, mark, title with its fact, description.
// A system page's mark is not pickable; a folder's is.

import { useState, type ComponentPropsWithoutRef, type ReactNode } from "react"

import { PLACE_DESCRIPTION_MAX } from "../../shared/place-descriptions.js"
import { AlignLeft, type LucideIcon } from "../lib/icons.js"
import { resolveCover } from "./folder-cover.js"
import { AddCoverAction, PageCover } from "./page-cover.js"
import { T_FAST } from "./task-row.js"
import { InlineTextarea } from "./ui/inline-field.js"
// Covers are stored through `lib/page-identity.js`; its names are aliased here.
import {
  savePageIdentity as savePrototypeFolderIdentity,
  usePageIdentity as useFolderIdentity,
} from "../lib/page-identity.js"
import { cn } from "./ui/utils.js"

// A long trail keeps the root and the nearest parents; the middle folds into "…".
export function crumbTrail<T>(crumbs: readonly T[], keep = 4): (T | null)[] {
  if (crumbs.length <= keep) return [...crumbs]
  return [crumbs[0] as T, null, ...crumbs.slice(crumbs.length - (keep - 2))]
}

// Asks the same question as `PageCover`: a stored key that resolves to nothing is
// not a drawn cover.
export function usePageHasCover(storageName: string) {
  const identity = useFolderIdentity(storageName)
  return Boolean(
    resolveCover(identity.cover, storageName, identity.coverPos ?? 50),
  )
}

// The page mark. A folder's opens the icon picker; a system page's is not a control.
export function PageMark({
  icon: Icon,
  hasCover,
  color,
  interactive = false,
  className,
  ...rest
}: {
  icon: LucideIcon
  hasCover: boolean
  // A folder's chosen colour; a system page passes nothing.
  color?: string
  interactive?: boolean
} & Omit<ComponentPropsWithoutRef<"button">, "color">) {
  const body = (
    <>
      {interactive ? (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 rounded-full bg-accent opacity-0 transition-opacity group-hover/mark:opacity-100 group-focus-visible/mark:opacity-100",
            T_FAST,
          )}
        />
      ) : null}
      <Icon
        className={cn("relative", hasCover ? "size-10" : "size-8")}
        style={color ? { color } : undefined}
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </>
  )

  const shape = cn(
    "relative flex shrink-0 items-center justify-center text-foreground",
    hasCover ? "z-40 -ml-1.5 -mt-9 size-14" : "-ml-1.5 size-10",
    className,
  )

  if (!interactive) return <div className={shape}>{body}</div>

  return (
    <button type="button" className={cn("group/mark rounded-full", shape)} {...rest}>
      {body}
    </button>
  )
}

interface PageHeadingStructureProps {
  icon: LucideIcon
  title: string
  fact?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  hasCover: boolean
  cover?: ReactNode
  coverAction?: ReactNode
  children?: ReactNode
}

// Shared heading geometry. `PageHead` adds cover and editable description;
// `PageHeading` has neither, so People never offers an edit it cannot save.
function PageHeadingStructure({
  icon,
  title,
  fact,
  description,
  actions,
  hasCover,
  cover,
  coverAction,
  children,
}: PageHeadingStructureProps): React.JSX.Element {
  return (
    <header className={cn("group/head", hasCover ? "pt-0" : "pt-2")}>
      {cover}
      <PageMark icon={icon} hasCover={hasCover} />
      {coverAction}

      {/* On a phone the fact wraps under the name. */}
      <div className="mt-1.5 flex items-baseline justify-between gap-6">
        <div className="flex min-w-0 items-baseline gap-3 max-md:flex-col max-md:items-start max-md:gap-1">
          <h1 data-page-title="" className="min-w-0 max-w-full truncate text-[length:var(--text-title-size)] leading-8 font-title text-foreground max-md:whitespace-normal">
            {title}
          </h1>
          {fact === undefined ? null : (
            <span className="shrink-0 text-xs leading-4 text-muted-foreground tabular-nums">
              {fact}
            </span>
          )}
        </div>
        {actions}
      </div>

      {description}
      {children}
    </header>
  )
}

/**
 * No storage name and no identity props, so People gets the geometry without
 * cover or description controls.
 */
export function PageHeading({
  icon,
  title,
  description,
  fact,
  actions,
}: {
  readonly icon: LucideIcon
  readonly title: string
  readonly description: string
  readonly fact?: ReactNode
  readonly actions?: ReactNode
}): React.JSX.Element {
  return (
    <PageHeadingStructure
      icon={icon}
      title={title}
      hasCover={false}
      {...(fact === undefined ? {} : { fact })}
      description={
        <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      }
      {...(actions === undefined ? {} : { actions })}
    />
  )
}

export function PageHead({
  storageName,
  icon: Icon,
  title,
  fact,
  description,
  descriptionEditable = true,
  children,
}: {
  storageName: string
  icon: LucideIcon
  title: string
  // Only a page with a completion figure has one.
  fact?: ReactNode
  // Dana's default sentence; a person's wording overrides it, and clearing restores it.
  description?: string
  // `false` keeps fixed wording for a stored place.
  descriptionEditable?: boolean
  children?: ReactNode
}) {
  const hasCover = usePageHasCover(storageName)

  return (
    <PageHeadingStructure
      icon={Icon}
      title={title}
      hasCover={hasCover}
      {...(fact === undefined ? {} : { fact })}
      cover={hasCover ? (
        <div className="-mt-4 md:-mt-6">
          <PageCover storageName={storageName} />
        </div>
      ) : undefined}
      coverAction={
        <div className="mt-1">
          <AddCoverAction storageName={storageName} />
        </div>
      }
      description={descriptionEditable ? (
        <PageDescription
          storageName={storageName}
          fallback={description}
          label={`${title} description`}
        />
      ) : description ? (
        <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      ) : undefined}
    >
      {/* The cover is drawn in the head so the mark can ride over it. Its negative top inset
          matches the shell's padding (`py-4`, `md:py-6`), and is drawn only with a cover. */}
      {children}
    </PageHeadingStructure>
  )
}


// A place's description. Clearing it restores the default sentence, so there is
// no separate reset.
export function PageDescription({
  storageName,
  fallback,
  label,
  offer = false,
  readOnly = false,
}: {
  storageName: string
  // Undefined for a folder, which has no default sentence.
  fallback?: string
  label: string
  // Show the ghost without hover, on a page nobody has touched.
  offer?: boolean
  // Read only, for viewers whose save would be refused (403). A textarea nobody may
  // submit would take the typing and lose it.
  readOnly?: boolean
}) {
  const identity = useFolderIdentity(storageName)
  const [editing, setEditing] = useState(false)
  const value = identity.description ?? fallback ?? ""

  function commit(next: string) {
    const text = next.trim()
    savePrototypeFolderIdentity(storageName, {
      // Storing the default sentence typed back in would freeze a copy of it.
      description: text && text !== fallback ? text : undefined,
    })
    setEditing(false)
  }

  if (readOnly) {
    if (!value) return null
    return (
      <p className="-mx-1 mt-1 max-w-xl px-1 py-0.5 text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
        {value}
      </p>
    )
  }

  if (!value && !editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          "-mx-1 mt-1 flex h-6 items-center gap-1.5 rounded-md px-1 text-xs leading-5 text-muted-foreground transition-[opacity,background-color,color]",
          T_FAST,
          "hover:bg-accent hover:text-foreground",
          offer ? "opacity-100" : "opacity-0 group-hover/head:opacity-100 focus-visible:opacity-100",
        )}
      >
        <AlignLeft className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={1.75} aria-hidden="true" />
        Add a description
      </button>
    )
  }

  return (
    <InlineTextarea
      // Keyed on the stored wording because the field is uncontrolled: clearing must
      // remount it to show the default sentence again.
      key={identity.description ?? "__shipped"}
      defaultValue={value}
      placeholder="Add a description"
      aria-label={label}
      rows={1}
      maxLength={PLACE_DESCRIPTION_MAX}
      autoFocus={editing}
      onBlur={(event) => commit(event.target.value)}
      className={cn(
        "-mx-1 mt-1 block w-[calc(100%+0.5rem)] max-w-xl resize-none rounded-md bg-transparent px-1 py-0.5 text-xs leading-5 text-muted-foreground outline-none transition-colors [field-sizing:content]",
        T_FAST,
        "placeholder:text-quiet-foreground hover:bg-accent focus:bg-card",
      )}
    />
  )
}
