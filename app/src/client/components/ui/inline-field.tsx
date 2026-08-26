import * as React from "react"

import { cn } from "./utils.js"

/*
The field that does not look like a field.

Dana has two kinds and only one of them had a primitive. `Input` and
`Textarea` are the boxed kind: a bordered thing that announces itself as
somewhere to type. This is the other kind, the one that renders as the text
it edits, shows a soft ground when you point at it, and grows a ring only once
you are actually in it. A page title, a folder's name, a section's name, a
task's title, a description, a paragraph: all of them are content first and
fields second, and boxing them would turn a document into a form.

It was written out by hand every time it was needed: the row's rename, the
folder page's title, its description, its paragraphs, its section names, the
card's notes, each with its own idea of the hover wash, the focus ring and
whether there was padding. Same control, seven spellings, which is how a
description ends up with a different focus ring from the paragraph directly
under it.

Two shapes, because the DOM has two: `InlineInput` for one line and
`InlineTextarea` for many. They share their appearance by construction rather
than by two people remembering the same class string.

`[field-sizing:content]` is what lets the multi-line one grow with what is
typed into it and stop at the height of its own content, no scroll bar, no
resize handle, no measuring in JavaScript. It is the reason this is worth
being a primitive rather than a class you paste.
*/
const inlineFieldClass =
  "-mx-1 w-[calc(100%+0.5rem)] min-w-0 rounded-md bg-transparent px-1 outline-none transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] placeholder:text-[var(--color-graphite-400)] hover:bg-[var(--color-graphite-50)] focus:bg-card focus:ring-1 focus:ring-[var(--color-dana-accent-600)]"

function InlineInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="inline-input"
      className={cn(inlineFieldClass, className)}
      {...props}
    />
  )
}

function InlineTextarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="inline-textarea"
      className={cn(
        inlineFieldClass,
        "block resize-none [field-sizing:content]",
        className,
      )}
      {...props}
    />
  )
}

export { InlineInput, InlineTextarea, inlineFieldClass }
