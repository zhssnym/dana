---
name: impeccable
description: >
  Design quality floor for frontend work: checks to run on the built UI and defaults to
  refuse. Use for any UI change, design review, polish or audit of a screen.
license: Apache-2.0
---

# Impeccable

Condensed from [pbakaus/impeccable](https://github.com/pbakaus/impeccable)
(`SKILL.md` and `reference/craft-floor.md`). Changed: Dana-only scope, the CLI, hooks and
sub-commands removed. The Design section of `AGENTS.md` overrides this file.

Dana is app UI: the user completes a task. Scanability, consistency and native behavior
come before expression. Refinement keeps the existing look, behavior and copy outside its
scope. Verify in bounded passes: build fully, inspect once (desktop and mobile, light and
dark), fix everything in one batch, confirm once, and stop.

## Verify

Check the built result, not the intention.

- **Contrast:** body and placeholder text at least 4.5:1, large text at least 3:1.
- **Spacing:** tight groups, generous separation, more space above a heading than below it.
  Read the computed values.
- **Type:** body measure 65–75ch, clear steps in size and weight. Run real copy at every
  breakpoint and fix what overflows.
- **Motion:** few, purposeful transitions. Ease out from a visible default. Respect
  `prefers-reduced-motion`.
- **States:** hover, focus, disabled, loading, error, empty. Real content, working
  controls, keyboard focus.
- **Browser surfaces:** text selection, caret, focus rings, scrollbars, underline offset
  and tabular numerals follow the tokens, not browser defaults.
- **Copy:** controls name their action. Errors name the problem and the recovery.
- **Coverage:** every requirement is present and easy to find.

## Refuse

- Same-size cards of icon, heading and text as page structure. Nested cards.
- The hero-metric template: big number, small label, supporting stats.
- A kicker or eyebrow label above a heading.
- Section numbers (01 / 02 / 03) unless the sequence is information.
- A modal for a task that needs neither interruption nor protected focus.
- Gradient text, glass or blur as decoration, glow.
- A colored `border-left` or `border-right` wider than 1px on cards, list items or alerts.
- Hard offset shadows (`box-shadow: 4px 4px 0`).
- Sparklines, progress rings or rounded boxes that stand in for content.
- Monospace as decoration. Use it only for code, data or measurement.
- Emoji or Unicode glyphs in place of icons. Use one icon set with one stroke weight.
- Both a border and a wide soft shadow on one element. Declare elevation once.
- Fake illustration made of sketch-style SVG. Real illustration or none.
- Made-up claims or values. Label example values as examples.
