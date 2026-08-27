/*
The head of a place-page: the composition the folder page settled, made
shareable.

F3, 2026-08-19, at Imran's direction: My Day, Tasks, Planned, Important, All
and Done still wore the v1 header, a 24px glyph inline with the title, a
subtitle stacked under it, and the page's own controls parked to the right of
its name, while the folder page next door had moved on to a cover, a mark at
identity scale, and a window bar holding everything that is chrome. Two
compositions, one product, and the pages sit one click apart.

So the folder page's header is extracted rather than copied (DES-124's rule),
and every place wears it:

    [cover]
    mark
    [Add cover]
    Title   fact
    description

**A system page's mark is not pickable, and a folder's is.** That difference
is the honest one and it survives: a folder is the person's own thing, so its
glyph and colour are theirs to choose (DES-130); My Day's sun is Dana's, and
offering a picker on it would promise a choice that does not exist. Same
geometry, same optical position, no popover, so the two read as one family
without either telling a lie.

**The fact rides the title's line; prose sits under it.** The folder page put
its completion ratio on the baseline and its description below (DES-130, as
Imran revised it), and the six pages divide the same way: "Monday, 10 August"
and "Starred tasks" are prose and take DES-148's 12/20 tier, while a progress
figure, which only My Day and a folder have, is the quiet figure beside the
name. A page with nothing to count leaves that slot empty rather than
inventing a number to fill it.

Lane 2 travels with the cover, unchanged: no page has a cover column, and the
storage question is DES-105's.
*/

import { useState, type ComponentPropsWithoutRef, type ReactNode } from "react"

import { AlignLeft, type LucideIcon } from "../lib/icons.js"
import { resolveCover } from "./folder-cover.js"
import { AddCoverAction, PageCover } from "./page-cover.js"
import { FOCUS, T_FAST } from "./task-row.js"
import { InlineTextarea } from "./ui/inline-field.js"
/* The S25 seam, and the whole of it in this file: the prototype read its
   covers from a browser store keyed by the page's name, and this client
   reads them from 7.19 keyed by 4.20's place. `lib/page-identity.js` is
   that module rewritten; the two names are aliased back to the prototype's
   so that nothing below this line moves. */
import {
  savePageIdentity as savePrototypeFolderIdentity,
  usePageIdentity as useFolderIdentity,
} from "../lib/page-identity.js"
import { cn } from "./ui/utils.js"

/*
Whether this page is currently wearing a cover, the header needs it, because
a mark stands on a plate only when there is something behind it, and the page
above has no top padding when a band is already there.

It asks the same question `PageCover` asks, and deliberately: a stored key is
not a drawn cover. An uploaded cover is an object URL alive for the session
only (DES-130), so after a reload the key is still in the store and resolves
to nothing, and a header that plated its mark on the key alone would float a
white tile over blank page.
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
The mark itself, one definition, F5, 2026-08-22.

F4 took the container off the mark on Imran's word (the rounded white tile
"does not feel aesthetically strong") and replaced it with ground: a soft
radial scrim over a cover, nothing at all on a bare page. That fix landed
here, in the head every system page renders, and the **folder page kept its
own copy of the mark**, so the one page the whole composition was extracted
from was the one still wearing the box. DES-154 exactly: the treatment was
settled for the mark and left in each screen's keeping.

So the mark is a component, and the two call sites differ in the one way they
honestly differ, a folder's mark is a control that opens the icon picker
(DES-130), a system page's is not a control at all and is therefore not a
button. Everything else, the geometry included, is written once here:

- **It grows over a cover rather than shrinking**, 32px bare to 40px plated.
  A cover is the one place identity has competition and the one place it
  should be loudest; the old header did the reverse.
- **The scrim is the plate's replacement.** A dark glyph on a dark photograph
  is what a container was solving, and the answer is to give the mark ground
  rather than a fence, the same trick a caption over an image uses. On a bare
  page there is nothing to separate from and the scrim is simply absent.
- **A control says so on hover**, with a disc that reads on both grounds,
  painted over the scrim rather than under it.
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
      {hasCover ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-2 rounded-full bg-[radial-gradient(closest-side,var(--color-graphite-0)_35%,color-mix(in_oklab,var(--color-graphite-0)_70%,transparent)_65%,transparent_100%)]"
        />
      ) : null}
      {interactive ? (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 rounded-full bg-[var(--color-graphite-100)] opacity-0 transition-opacity group-hover/mark:opacity-100 group-focus-visible/mark:opacity-100",
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
    "relative flex shrink-0 items-center justify-center text-[var(--color-graphite-800)]",
    hasCover ? "z-40 -ml-1.5 -mt-9 size-14" : "-ml-1.5 size-10",
    className,
  )

  if (!interactive) return <div className={shape}>{body}</div>

  return (
    <button type="button" className={cn("group/mark rounded-full", shape, FOCUS)} {...rest}>
      {body}
    </button>
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
  The second S25 seam, and the only one in this file's body.

  RFC 0005 change control item 9 recorded the gap and it is still open: 9.4
  writes the head as carrying an "editable description", 4.20 stores a cover
  and its crop and nothing else, and no column anywhere holds a person's own
  wording for a place page. Adding one is a frozen section 4 change and
  therefore the owner's, so this row escalates it rather than improvising.

  What that leaves is a choice between drawing the affordance over nothing
  and not drawing it, and the second is the only honest one: a rewrite that
  is accepted, blurs, and comes back unchanged is worse than a sentence,
  because it tells a person their wording was saved. So a place page passes
  false and gets Dana's own sentence as prose; a folder page has somewhere
  to put one and passes nothing.
  */
  descriptionEditable?: boolean
  children?: ReactNode
}) {
  const hasCover = usePageHasCover(storageName)

  return (
    <header className={cn("group/head", hasCover ? "pt-0" : "pt-2")}>
      {/*
      **Seam, S25: the band is drawn here rather than by the page above.**

      The composition this file's own header diagrams opens with `[cover]`,
      and the prototype nonetheless renders `PageCover` from its shell, for
      the reason its shell renders everything: it is the thing that knows
      which page is showing. This client's pages each know their own spine, so
      the band belongs to the head, and it has to be the head's for a reason
      that is not tidiness: `PageMark` rides up over the band on a negative
      margin, which only works while the two are adjacent in one flow, and a
      page putting them in a `space-y-*` stack would open a gap between them.

      The negative inset undoes the shell's own measure and nothing else.
      `app-shell.tsx` wraps every page in `px-10 py-6`, and a cover is a band
      across the page rather than a picture inside its column.
      */}
      <div className="-mx-10 -mt-6">
        <PageCover storageName={storageName} />
      </div>
      {/* Not pickable, and therefore not a button: My Day's sun is Dana's,
          not the person's, and a popover on it would promise a choice that
          does not exist. Same mark, same geometry, see PageMark. */}
      <PageMark icon={Icon} hasCover={hasCover} />

      <div className="mt-1">
        <AddCoverAction storageName={storageName} />
      </div>

      <div className="mt-1.5 flex items-baseline gap-3">
        <h1 className="min-w-0 truncate text-2xl leading-8 font-semibold text-foreground">
          {title}
        </h1>
        {fact ? (
          <span className="shrink-0 text-xs leading-4 text-muted-foreground tabular-nums">
            {fact}
          </span>
        ) : null}
      </div>

      {descriptionEditable ? (
        <PageDescription
          storageName={storageName}
          fallback={description}
          label={`${title} description`}
        />
      ) : description ? (
        /* The same tier, the same measure and the same offset as the field
           above draws at rest: what changes is that it is prose. */
        <p className="mt-1 max-w-xl text-[12px] leading-5 text-[var(--color-graphite-600)]">
          {description}
        </p>
      ) : null}

      {children}
    </header>
  )
}


/*
A place's description, in its own words or in Dana's.

Imran, 2026-08-22: every native page should carry "a short, memorable, catchy
and natural sentence" a person can edit later. `nav-model` has documented that
editing fallback since F4 and nothing built it, the six pages rendered their
sentence as a paragraph, so the shipped wording was the only wording there
could ever be, and the note described a feature that did not exist.

It exists now, and it is the folder page's own control rather than a second
one: that page has had an editable description since DES-130, and the head was
extracted from it precisely so the places would stop being written twice
(DES-149). Both call this.

**Clearing it restores the shipped sentence**, which is what a fallback means
and is why there is no separate reset. A folder has no shipped sentence, so
clearing one there leaves it empty and the ghost comes back, the same rule,
reading differently because the two have different defaults.

Lane 2 travels with the cover: no page has a description column either, so a
person's wording sits in the prototype's identity store beside the covers,
keyed by the same name.
*/
export function PageDescription({
  storageName,
  fallback,
  label,
  offer = false,
}: {
  storageName: string
  /* Dana's own sentence for this place, from `pageQuestion`. Undefined for a
     folder, which has nothing to fall back to. */
  fallback?: string
  label: string
  /* Show the ghost without being hovered, for a page nobody has touched, 
     where a hidden affordance is one nobody discovers. */
  offer?: boolean
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

  if (!value && !editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          "-mx-1 mt-1 flex h-6 items-center gap-1.5 rounded-md px-1 text-[12px] leading-5 text-[var(--color-graphite-400)] transition-[opacity,background-color,color]",
          T_FAST,
          FOCUS,
          "hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-600)]",
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
      autoFocus={editing}
      onBlur={(event) => commit(event.target.value)}
      className={cn(
        "-mx-1 mt-1 block w-[calc(100%+0.5rem)] max-w-xl resize-none rounded-md bg-transparent px-1 py-0.5 text-[12px] leading-5 text-[var(--color-graphite-600)] outline-none transition-colors [field-sizing:content]",
        T_FAST,
        "placeholder:text-[var(--color-graphite-400)] hover:bg-[var(--color-graphite-50)] focus:bg-card focus:ring-1 focus:ring-[var(--color-dana-accent-600)]",
      )}
    />
  )
}
