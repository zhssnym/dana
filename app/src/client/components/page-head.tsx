/*
The head of a place-page: the folder page's composition, made shareable, so
every place wears one head rather than a copy that drifts:

    [cover]
    mark
    [Add cover]
    Title   fact
    description

**A system page's mark is not pickable, and a folder's is.** That difference is
the honest one and it survives: a folder is the person's own thing, so its glyph
and colour are theirs to choose; My Day's sun is Dana's, and offering a picker
on it would promise a choice that does not exist. Same geometry, same optical
position, no popover, so the two read as one family without either telling a
lie.

**The fact rides the title's line; prose sits under it.** "Monday, 10 August"
and "Starred tasks" are prose and take the 12/20 prose tier, while a progress
figure, which only My Day and a folder have, is the quiet figure beside the
name. A page with nothing to count leaves that slot empty rather than inventing
a number to fill it.
*/

import { useState, type ComponentPropsWithoutRef, type ReactNode } from "react"

import { PLACE_DESCRIPTION_MAX } from "../../shared/place-descriptions.js"
import { AlignLeft, type LucideIcon } from "../lib/icons.js"
import { resolveCover } from "./folder-cover.js"
import { AddCoverAction, PageCover } from "./page-cover.js"
import { T_FAST } from "./task-row.js"
import { InlineTextarea } from "./ui/inline-field.js"
/* Covers are read from 7.19 keyed by 4.20's place, through
   `lib/page-identity.js`; its two names are aliased on import. */
import {
  savePageIdentity as savePrototypeFolderIdentity,
  usePageIdentity as useFolderIdentity,
} from "../lib/page-identity.js"
import { cn } from "./ui/utils.js"

/*
How a long page path folds (round 3: the trail itself is drawn in the top bar,
not in the page head; search still names paths with this).

**A long trail keeps its ends.** The root says which tree this is and the
nearest parent says where you are; the middle is the least informative part,
so it is what folds into "…".
*/
export function crumbTrail<T>(crumbs: readonly T[], keep = 4): (T | null)[] {
  if (crumbs.length <= keep) return [...crumbs]
  return [crumbs[0] as T, null, ...crumbs.slice(crumbs.length - (keep - 2))]
}

/*
Whether this page is currently wearing a cover, the header needs it, because a
mark stands on a plate only when there is something behind it, and the page
above has no top padding when a band is already there.

It asks the same question `PageCover` asks, and deliberately: a stored key is
not a drawn cover. A header that plated its mark on a key that resolves to
nothing would float a white tile over blank page.
*/
export function usePageHasCover(storageName: string) {
  const identity = useFolderIdentity(storageName)
  return Boolean(
    resolveCover(identity.cover, storageName, identity.coverPos ?? 50),
  )
}

/* The reading column, one definition. The folder page's own measure, so the
   six pages cannot drift from it by a rounding of padding. */
export function pageBodyClass(className?: string) {
  return cn(
    "mx-auto w-full max-w-[var(--shell-content-max)] px-10 pb-8",
    className,
  )
}

/*
The mark itself, one definition.

The mark has no container, over a cover or not. It is a component so every page draws the same mark, and the two call
sites differ in the one way they honestly differ: a folder's mark is a control
that opens the icon picker, a system page's is not a control at all and is
therefore not a button. Everything else, the geometry included, is written once
here:

- **It grows over a cover rather than shrinking**, 32px bare to 40px plated. A
  cover is the one place identity has competition and the one place it should be
  loudest.
- **A control says so on hover**, with a disc.
*/
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
  /* A folder's glyph wears the colour its owner chose; a system page's is
     Dana's own graphite and passes nothing. */
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

/*
The mark, title, fact, description and actions are one structure. `PageHead`
adds the identity features that belong to places with storage; `PageHeading`
fixes the same structure to the no-cover, prose-only form used by People.
Keeping those capabilities in the wrappers means sharing the geometry never
quietly promises People a cover or an edit that cannot be saved (#84).
*/
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
          <h1 className="min-w-0 max-w-full truncate text-2xl leading-8 font-semibold text-foreground max-md:whitespace-normal">
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
 * The fixed page-heading variation. It deliberately has no storage name and
 * no identity props, so a caller such as People can share the page geometry
 * without acquiring cover or editable-description controls.
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
  /* The quiet figure on the title's own line. Only a page with a completion
     has one; the rest leave it out. */
  fact?: ReactNode
  /* Dana's own sentence for this place, from `pageQuestion`. A person's own
     wording overrides it and clearing that brings it back. */
  description?: string
  /*
  Native pages use 7.21, while folders and shelves keep using their own records.
  `false` remains available if a stored place genuinely needs fixed wording,
  while native task pages use the editable default. People does not cross this
  storage-owning wrapper at all; it uses `PageHeading` above.
  */
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
        /* The same tier, the same measure and the same offset as the field
           above draws at rest: what changes is that it is prose. */
        <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      ) : undefined}
    >
      {/*
      **The band is drawn here rather than by the page above.**

      `PageMark` rides up over the band on a negative margin, which only works
      while the two are adjacent in one flow, and a page putting them in a
      `space-y-*` stack would open a gap between them.

      The negative inset undoes the shell's own measure and nothing else.
      `app-shell.tsx` wraps every page in padding, and a cover is a band across
      the page rather than a picture inside its column, so the wrapper is drawn
      only when there is one: an empty box carrying a negative margin would pull
      every uncovered page's mark up by the shell's own padding.

      **Only the vertical half is here.** The horizontal half is in
      `page-cover.tsx`, which draws the band to the window's own edge and states
      the arithmetic. The top inset is the shell's two measures rather than one:
      the column is `py-4` on a phone and `py-6` from `md` up, so a flat `-mt-6`
      would pull the band 8px past the top of the scroll region on a phone.
       */}
      {children}
    </PageHeadingStructure>
  )
}


/*
A place's description, in its own words or in Dana's.

Every native page carries a short, natural sentence a person can edit later.
This is the folder page's own control rather than a second one, so the places
are not written twice.

**Clearing it restores the shipped sentence**, which is what a fallback means
and is why there is no separate reset. A folder has no shipped sentence, so
clearing one there leaves it empty and the ghost comes back, the same rule,
reading differently because the two have different defaults.

The storage seam keeps the UI simple: folders and shelves save through their own
records, and native pages save through 7.21. The control does not need to know
which kind of page it is editing.
*/
export function PageDescription({
  storageName,
  fallback,
  label,
  offer = false,
  readOnly = false,
}: {
  storageName: string
  /* Dana's own sentence for this place, from `pageQuestion`. Undefined for a
     folder, which has nothing to fall back to. */
  fallback?: string
  label: string
  /* Show the ghost without being hovered, for a page nobody has touched,
     where a hidden affordance is one nobody discovers. */
  offer?: boolean
  /* Read the sentence, do not offer to write it (issue #228). A folder's
     description is part of its 4.3 identity, which accepted #209 R8A makes
     ordinary shared Folder work, so `PATCH /folders/:id` answers 403 below
     Can edit; a place's description is the viewer's own and never passes
     this. **A textarea nobody may submit is worse than a paragraph**, because
     it takes the typing first and loses it to a 403 afterwards. */
  readOnly?: boolean
}) {
  const identity = useFolderIdentity(storageName)
  const [editing, setEditing] = useState(false)
  const value = identity.description ?? fallback ?? ""

  function commit(next: string) {
    const text = next.trim()
    savePrototypeFolderIdentity(storageName, {
      /* The shipped sentence typed back in is not a person's wording, and
         storing it would freeze a copy that stops following Dana's. */
      description: text && text !== fallback ? text : undefined,
    })
    setEditing(false)
  }

  if (readOnly) {
    /* Nothing at all where there is no sentence: the ghost is an offer, and
       there is nothing to read. */
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
          "-mx-1 mt-1 flex h-6 items-center gap-1.5 rounded-md px-1 text-xs leading-5 text-quiet-foreground transition-[opacity,background-color,color]",
          T_FAST,
          "hover:bg-accent hover:text-muted-foreground",
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
      /* Keyed on the stored wording, because the field is uncontrolled: without
         this, clearing a page's own sentence would save the revert and go on
         showing the empty box it was typed into rather than Dana's sentence
         coming back. */
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
