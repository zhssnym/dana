/*
The Diagram block's language and layout (#222). Pure functions, no DOM.

**The source text is the diagram.** It is what `page_blocks.text` stores and
what a person edits; the picture is derived from it on every render and is
never stored, so a reload, a duplicate, an export and a workflow file all carry
the one editable representation.

The language is the arrow subset of Mermaid's flowchart syntax, because that is
what people already type and paste, and it is small enough to own here rather
than add a dependency:

  flowchart LR          optional first line; TD/TB (default) or LR
  Idea -> Draft         an arrow; `->` and `-->` both work
  Draft -> Review: send an arrow with a label (also `A -->|send| B`)
  A -> B -> C           a chain
  R[Ready to ship]      a box with an id and a label; `R(…)`/`R{…}` too
  % comment             `%` or `#` starts a comment line

Anything else on a line is a box named by that text. Nothing here builds markup
from strings: the renderer draws these records as React SVG elements, so every
label reaches the page as a text node and there is nothing to sanitize.
*/

export interface DiagramNode { id: string; label: string; x: number; y: number; w: number; h: number }
/** A quadratic curve: start, control, end, and where its label sits. */
export interface DiagramEdge { from: string; to: string; label: string; path: string; labelAt: [number, number]; labelAnchor: 'start' | 'middle' | 'end' }
export interface DiagramLayout { nodes: DiagramNode[]; edges: DiagramEdge[]; minX: number; minY: number; width: number; height: number; direction: 'TD' | 'LR' }
export type DiagramResult = { ok: true; layout: DiagramLayout } | { ok: false; message: string }

export const MAX_DIAGRAM_NODES = 60
export const MAX_DIAGRAM_EDGES = 120
const MAX_LABEL = 40
const NODE_H = 36
const GAP_MAIN = 56
const GAP_CROSS = 24
const PAD = 8

const shaped = /^([^\s[\](){}|:>-][^[\](){}|:]*?)\s*[[({](.*)[\])}]$/

function measure(label: string): number {
  return Math.max(72, Math.min(240, Math.round(label.length * 7.2) + 28))
}

function clip(label: string): string {
  const text = label.trim().replace(/\s+/g, ' ')
  return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text
}

export function parseDiagram(source: string): { direction: 'TD' | 'LR'; nodes: Map<string, string>; edges: { from: string; to: string; label: string }[] } {
  let direction: 'TD' | 'LR' = 'TD'
  const nodes = new Map<string, string>()
  const edges: { from: string; to: string; label: string }[] = []
  const node = (raw: string): string | null => {
    const text = raw.trim()
    if (!text) return null
    const match = shaped.exec(text)
    const id = clip(match ? match[1]! : text)
    if (!id) return null
    const label = match ? clip(match[2]!.replace(/^["']|["']$/g, '')) : ''
    if (!nodes.has(id) || (label && nodes.get(id) === id)) nodes.set(id, label || nodes.get(id) || id)
    return id
  }
  source.split(/\r?\n|;/).forEach((line, index) => {
    const text = line.trim()
    if (!text || text.startsWith('%') || text.startsWith('#')) return
    const header = /^(?:graph|flowchart)\b\s*(\w+)?$/i.exec(text)
    if (index === 0 && header) {
      direction = /^(LR|RL)$/i.test(header[1] ?? '') ? 'LR' : 'TD'
      return
    }
    // Split into segments on arrows, keeping each arrow's inline |label|.
    const parts = text.split(/\s*-{1,2}>\s*(?:\|([^|]*)\|\s*)?/)
    if (parts.length === 1) { node(text); return }
    let previous: string | null = null
    for (let i = 0; i < parts.length; i += 2) {
      let segment = parts[i] ?? ''
      let tail = ''
      const last = i === parts.length - 1
      if (last) {
        const colon = segment.indexOf(':')
        if (colon > 0) { tail = segment.slice(colon + 1); segment = segment.slice(0, colon) }
      }
      const id = node(segment)
      const inline = i > 0 ? parts[i - 1] ?? '' : ''
      if (previous !== null && id !== null) edges.push({ from: previous, to: id, label: clip(inline || tail) })
      previous = id
    }
  })
  return { direction, nodes, edges }
}

/** Longest-path layers, one ordering pass, arrows between box edges. */
export function layoutDiagram(source: string): DiagramResult {
  const { direction, nodes, edges } = parseDiagram(source)
  if (nodes.size === 0) return { ok: false, message: 'Type a line such as “Idea -> Draft” to draw a box and an arrow.' }
  if (nodes.size > MAX_DIAGRAM_NODES) return { ok: false, message: `A diagram holds at most ${MAX_DIAGRAM_NODES} boxes.` }
  if (edges.length > MAX_DIAGRAM_EDGES) return { ok: false, message: `A diagram holds at most ${MAX_DIAGRAM_EDGES} arrows.` }
  const ids = [...nodes.keys()]
  const outgoing = new Map(ids.map((id) => [id, [] as string[]]))
  for (const edge of edges) outgoing.get(edge.from)!.push(edge.to)
  // Back edges (cycles) are found by DFS and ignored for ranking only.
  const state = new Map<string, 1 | 2>()
  const back = new Set<string>()
  const visit = (id: string): void => {
    state.set(id, 1)
    for (const next of outgoing.get(id)!) {
      if (state.get(next) === 1) back.add(`${id}\u0000${next}`)
      else if (!state.has(next)) visit(next)
    }
    state.set(id, 2)
  }
  for (const id of ids) if (!state.has(id)) visit(id)
  const rank = new Map(ids.map((id) => [id, 0]))
  for (let pass = 0; pass < ids.length; pass++) {
    let moved = false
    for (const edge of edges) {
      if (edge.from === edge.to || back.has(`${edge.from}\u0000${edge.to}`)) continue
      const want = rank.get(edge.from)! + 1
      if (rank.get(edge.to)! < want) { rank.set(edge.to, want); moved = true }
    }
    if (!moved) break
  }
  // A box with no arrow in sits just above the nearest box it points to,
  // rather than at the top with one long arrow down the whole picture.
  const forward = edges.filter((e) => e.from !== e.to && !back.has(`${e.from}\u0000${e.to}`))
  for (const id of ids) {
    if (forward.some((e) => e.to === id)) continue
    const next = forward.filter((e) => e.from === id).map((e) => rank.get(e.to)!)
    if (next.length > 0) rank.set(id, Math.min(...next) - 1)
  }
  const layers: string[][] = []
  for (const id of ids) (layers[rank.get(id)!] ??= []).push(id)
  const order = new Map<string, number>()
  layers.forEach((layer, index) => {
    if (index > 0) {
      const parentsOf = (id: string): number[] => edges.filter((e) => e.to === id && order.has(e.from)).map((e) => order.get(e.from)!)
      const score = new Map(layer.map((id, at) => {
        const parents = parentsOf(id)
        return [id, parents.length ? parents.reduce((a, b) => a + b, 0) / parents.length : at]
      }))
      layer.sort((a, b) => score.get(a)! - score.get(b)!)
    }
    layer.forEach((id, at) => order.set(id, at))
  })
  const vertical = direction === 'TD'
  const placed = new Map<string, DiagramNode>()
  const extents = layers.map((layer) => layer.reduce((sum, id) => sum + (vertical ? measure(nodes.get(id)!) : NODE_H), 0) + GAP_CROSS * (layer.length - 1))
  const widest = Math.max(...extents)
  const thickness = layers.map((layer) => Math.max(...layer.map((id) => vertical ? NODE_H : measure(nodes.get(id)!))))
  let main = PAD
  layers.forEach((layer, index) => {
    let cross = PAD + (widest - extents[index]!) / 2
    for (const id of layer) {
      const label = nodes.get(id)!
      const w = measure(label)
      const size = vertical ? w : NODE_H
      const node = vertical
        ? { id, label, x: cross, y: main, w, h: NODE_H }
        : { id, label, x: main + (thickness[index]! - w) / 2, y: cross, w, h: NODE_H }
      placed.set(id, node)
      cross += size + GAP_CROSS
    }
    main += thickness[index]! + GAP_MAIN
  })
  const border = (n: DiagramNode, tx: number, ty: number): [number, number] => {
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2
    const dx = tx - cx, dy = ty - cy
    if (dx === 0 && dy === 0) return [cx, cy]
    const scale = Math.min(Math.abs(dx) > 0 ? (n.w / 2) / Math.abs(dx) : Infinity, Math.abs(dy) > 0 ? (n.h / 2) / Math.abs(dy) : Infinity)
    return [cx + dx * scale, cy + dy * scale]
  }
  const controls: [number, number][] = []
  const pairs = new Set(edges.map((e) => `${e.from}\u0000${e.to}`))
  const laidEdges = edges.filter((e) => e.from !== e.to).map((edge): DiagramEdge => {
    const a = placed.get(edge.from)!, b = placed.get(edge.to)!
    const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2
    // Bend an arrow that would otherwise lie on another: a cycle's return, one
    // half of a two-way pair, or one that skips a layer and would cross a box.
    const span = Math.abs(rank.get(edge.to)! - rank.get(edge.from)!)
    // A two-way pair only needs to part; a long or returning arrow must clear boxes.
    const paired = pairs.has(`${edge.to}\u0000${edge.from}`) && span === 1
    const bend = paired ? 10 : back.has(`${edge.from}\u0000${edge.to}`) || span > 1 ? 36 + 12 * Math.max(0, span - 2) : 0
    const length = Math.hypot(bx - ax, by - ay) || 1
    const cx = (ax + bx) / 2 + (-(by - ay) / length) * bend * 2
    const cy = (ay + by) / 2 + ((bx - ax) / length) * bend * 2
    if (bend > 0) controls.push([(ax + 2 * cx + bx) / 4, (ay + 2 * cy + by) / 4])
    const [x1, y1] = border(a, cx, cy)
    const [x2, y2] = border(b, cx, cy)
    const r = (n: number): number => Math.round(n * 10) / 10
    // A label sits beside its curve, on the side it bends to, so the two
    // labels of a two-way pair never share a spot.
    const side = bend === 0 ? 0 : Math.sign(-(by - ay))
    const anchor = Math.abs(by - ay) > Math.abs(bx - ax) && side !== 0 ? (side > 0 ? 'start' : 'end') : 'middle'
    const shift = anchor === 'start' ? 4 : anchor === 'end' ? -4 : 0
    return { ...edge, path: `M ${r(x1)} ${r(y1)} Q ${r(cx)} ${r(cy)} ${r(x2)} ${r(y2)}`, labelAt: [r((x1 + 2 * cx + x2) / 4 + shift), r((y1 + 2 * cy + y2) / 4)], labelAnchor: anchor }
  })
  const all = [...placed.values()]
  // The drawing's box: every box, and every bent arrow's control point, which
  // bounds its curve. A bend may reach left of or above the first box.
  const xs = [...all.flatMap((n) => [n.x, n.x + n.w]), ...controls.map(([x]) => x)]
  const ys = [...all.flatMap((n) => [n.y, n.y + n.h]), ...controls.map(([, y]) => y)]
  const minX = Math.floor(Math.min(...xs) - PAD), minY = Math.floor(Math.min(...ys) - PAD)
  return {
    ok: true,
    layout: {
      direction,
      nodes: all,
      edges: laidEdges,
      minX,
      minY,
      width: Math.ceil(Math.max(...xs) + PAD) - minX,
      height: Math.ceil(Math.max(...ys) + PAD) - minY,
    },
  }
}
