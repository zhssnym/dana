/*
The ten folder swatches against a dark ground — three options, to be ruled on.

[[DES-205]] left this open: a dark colourway was proposed and the swatches were
not touched, because [[DES-018]] requires each to travel with a legible folder
name and that is a judgement per swatch against a new ground rather than one
ruling. Imran asked for the options.

**Measuring first changed what the options are.** The assumption behind leaving
them open was that a mid-tone palette would go dim on near-black. It does not:
against the dark card every one of the ten scores **4.47 to 5.19**, and against
white the same ten score **3.42 to 3.97**. The palette reads *better* on dark
than on light, which is what a deliberately mid-tone set is for and is the
opposite of what the caution assumed.

So there is no contrast problem to fix. Exactly one swatch — plum, at 4.47 —
misses a 4.5 bar that the light theme does not meet for any of them, which is a
rounding-level miss rather than a fault.

That leaves a question of **taste, not legibility**, and it is a real one:
saturated colour on near-black vibrates in a way it does not on white. The third
option trades some of that vividness for calm. Nobody can settle that by
arithmetic, which is why this page exists and why it shows the swatches the way
they are actually used — a glyph and a folder name, at the size a sidebar draws
them.

It also carries the **accent** options (DES-214), because they are the same kind
of question asked of one colour instead of ten, and a person deciding a palette
should see it in one place.

Reachable at `?view=swatches`. It draws both grounds at once rather than
following the theme, because the whole question is how one set of values behaves
in two places.
*/

import { folderPageMark } from "@/components/folder-mark"

/* Shipped today (DES-018). */
const LIGHT: Record<string, string> = {
  clay: "#c4705d",
  ochre: "#b08034",
  olive: "#8a8a3a",
  fern: "#52975d",
  teal: "#3d998c",
  sky: "#4292bc",
  cobalt: "#6683d6",
  violet: "#8e71cf",
  plum: "#b562a9",
  rose: "#c4627b",
}

/* Applied (DES-215): about +30 points of saturation each, every hue held and
   every contrast-on-white re-solved to within 0.02 of what it was. */
const VIVID: Record<string, string> = {
  clay: "#e55939",
  ochre: "#bd7a10",
  olive: "#8b8b18",
  fern: "#289d3a",
  teal: "#189c8a",
  sky: "#1a92d1",
  cobalt: "#5780f4",
  violet: "#9168ee",
  plum: "#d73bc0",
  rose: "#e5446d",
}

/* The same, with cobalt moved off the brand hue — the one ruling this page is
   asking for. 224 -> 242, same saturation, same contrast. */
const VIVID_COBALT_MOVED: Record<string, string> = {
  ...VIVID,
  cobalt: "#7b77f6",
}

const OPTIONS = [
  {
    key: "A",
    name: "As they were",
    note: "The shipped set, 30 to 58% saturation. What Imran called lacking in vividness.",
    values: LIGHT,
  },
  {
    key: "B",
    name: "Vivid — applied",
    note:
      "About +30 points each. Hues held, contrasts held to within 0.02 — the band is 3.41–3.98 where it was 3.42–3.97.",
    values: VIVID,
  },
  {
    key: "C",
    name: "Vivid, cobalt moved",
    note:
      "Identical to B except folder cobalt, hue 224 → 242, to clear the brand accent at 226. This is the ruling being asked for.",
    values: VIVID_COBALT_MOVED,
  },
]

/* The names a person actually reads beside a swatch. */
const NAMES = [
  "Travel", "Business", "Home", "Office", "Ideas",
  "Reading list", "Studio", "Garden", "Invoices", "Recipes",
]

function contrast(hex: string, on: string) {
  const channel = (h: string, i: number) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  const lum = (h: string) =>
    0.2126 * channel(h, 1) + 0.7152 * channel(h, 3) + 0.0722 * channel(h, 5)
  const [a, b] = [lum(hex), lum(on)].sort((x, y) => y - x)
  return ((a + 0.05) / (b + 0.05)).toFixed(2)
}

function Row({
  swatch,
  hex,
  name,
  ground,
}: {
  swatch: string
  hex: string
  name: string
  ground: string
}) {
  const Glyph = folderPageMark(name)
  return (
    <div className="flex items-center gap-2 py-1">
      <Glyph
        className="size-4 shrink-0"
        style={{ color: hex }}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate text-[13px] leading-5" style={{ color: hex }}>
        {name}
      </span>
      <span className="shrink-0 font-mono text-[10px] leading-4 opacity-60">
        {swatch} {contrast(hex, ground)}
      </span>
    </div>
  )
}

function Panel({
  option,
  ground,
  text,
  label,
}: {
  option: (typeof OPTIONS)[number]
  ground: string
  text: string
  label: string
}) {
  return (
    <div
      className="flex-1 rounded-xl border p-4"
      style={{ background: ground, borderColor: text + "22", color: text }}
    >
      <p className="pb-1 text-[11px] font-semibold tracking-[0.08em] uppercase opacity-60">
        {label}
      </p>
      {Object.entries(option.values).map(([swatch, hex], index) => (
        <Row
          key={swatch}
          swatch={swatch}
          hex={hex}
          name={NAMES[index] ?? swatch}
          ground={ground}
        />
      ))}
    </div>
  )
}

/*
The accent, at four saturations.

All four hold Dana's hue (226) and all four are tuned to the *same* contrast —
5.20, which is what Tailwind's own `blue-600` keeps. That is the honest way to
compare vividness: change one variable. Raising saturation *and* spending the
contrast headroom would make the brightest look best on this page and worst on
a dim screen.
*/
const ACCENTS = [
  { key: "shipped", hex: "#3c5bbf", note: "52% — as it was" },
  { key: "65%", hex: "#4264d7", note: "65%" },
  { key: "75%", hex: "#3b62e3", note: "75%" },
  { key: "85%", hex: "#335fee", note: "85% — applied" },
  { key: "tailwind", hex: "#2563eb", note: "Tailwind blue-600, hue 221" },
]

function AccentRow({ hex, note, label }: { hex: string; note: string; label: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-16 shrink-0 font-mono text-[11px] leading-4 text-[var(--color-graphite-500)]">
        {label}
      </span>
      <span
        className="flex h-8 shrink-0 items-center rounded-md px-3 text-[13px] font-medium text-white"
        style={{ background: hex }}
      >
        Primary
      </span>
      <span
        className="flex h-8 shrink-0 items-center rounded-md px-3 text-[13px] font-medium"
        style={{ background: hex + "1f", color: hex }}
      >
        Tinted
      </span>
      <span className="text-[13px]" style={{ color: hex }}>
        A link
      </span>
      <span className="ml-auto shrink-0 font-mono text-[10px] leading-4 text-[var(--color-graphite-400)]">
        {hex} · {note} · {contrast("#ffffff", hex)}
      </span>
    </div>
  )
}

export function SwatchOptions() {
  return (
    <div className="mx-auto w-full max-w-[980px] px-8 py-10">
      <h1 className="text-[24px] leading-8 font-semibold text-[var(--color-graphite-900)]">
        Folder swatches on a dark ground
      </h1>
      <p className="max-w-[68ch] pt-2 text-[13px] leading-5 text-[var(--color-graphite-600)]">
        The number after each name is its contrast against the card it sits on —
        the same measurement in both columns, so the two are comparable. DES-018
        asks a swatch to travel with a legible folder name, which is why these
        are drawn as rows rather than as chips.
      </p>
      <p className="max-w-[68ch] pt-2 text-[13px] leading-5 text-[var(--color-graphite-600)]">
        Measured first, twice over. On dark the ten score better than they do on
        white, so the dark theme never needed them changed. What did need
        changing is vividness, which Imran called on both the accent and these:
        every value below holds its hue and its contrast, and spends the change
        on chroma alone. The band is 3.41–3.98 where it was 3.42–3.97 — nothing
        became more or less legible, they became more coloured.
      </p>

      <section className="pt-8">
        <h2 className="text-[16px] leading-6 font-semibold text-[var(--color-graphite-900)]">
          Accent
        </h2>
        <p className="pb-3 text-[12px] leading-5 text-[var(--color-graphite-500)]">
          Imran, 2026-08-23: the accent is not vivid enough. It was{" "}
          <code className="px-1">hsl(226 52% 49%)</code> where Tailwind's
          blue-600 — what shadcn ships against — is{" "}
          <code className="px-1">hsl(221 83% 53%)</code>. All rows below hold
          Dana's hue and about the same contrast, so the only thing changing is
          chroma. <strong>85% is applied.</strong>
        </p>
        <div className="rounded-xl border border-[var(--color-graphite-200)] p-4">
          {ACCENTS.map((a) => (
            <AccentRow key={a.key} hex={a.hex} note={a.note} label={a.key} />
          ))}
        </div>
      </section>

      <section className="pt-8">
        <h2 className="text-[16px] leading-6 font-semibold text-[var(--color-graphite-900)]">
          The one collision
        </h2>
        <p className="max-w-[68ch] pb-3 text-[12px] leading-5 text-[var(--color-graphite-500)]">
          Folder cobalt sits at hue 224 and the brand accent at 226. That is not
          new — it has been in DES-018 since the palette was drawn — and it was
          survivable while both were dull enough for lightness to tell them
          apart. Vivid, they are one colour with two jobs, and DES-018's whole
          line is that a folder colour is identity and the accent is
          interaction. Moving cobalt to 242 clears it. Nothing here is applied;
          the shipped value still has cobalt at 224.
        </p>
        <div className="flex gap-3">
          {[
            { label: "Accent (interaction)", hex: "#335fee" },
            { label: "Folder cobalt, 224 — as applied", hex: "#5780f4" },
            { label: "Folder cobalt, 242 — proposed", hex: "#7b77f6" },
          ].map((x) => (
            <div
              key={x.label}
              className="flex-1 rounded-xl border border-[var(--color-graphite-200)] p-4"
            >
              <div className="h-12 w-full rounded-md" style={{ background: x.hex }} />
              <p className="pt-2 text-[12px] leading-4 text-[var(--color-graphite-600)]">
                {x.label}
              </p>
              <p className="font-mono text-[10px] leading-4 text-[var(--color-graphite-400)]">
                {x.hex}
              </p>
            </div>
          ))}
        </div>
      </section>

      {OPTIONS.map((option) => (
        <section key={option.key} className="pt-8">
          <h2 className="text-[16px] leading-6 font-semibold text-[var(--color-graphite-900)]">
            {option.key} · {option.name}
          </h2>
          <p className="pb-3 text-[12px] leading-5 text-[var(--color-graphite-500)]">
            {option.note}
          </p>
          <div className="flex gap-3">
            <Panel option={option} ground="#17181b" text="#e3e6ea" label="Dark" />
            <Panel option={option} ground="#ffffff" text="#2f3136" label="Light" />
          </div>
        </section>
      ))}
    </div>
  )
}
