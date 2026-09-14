import type { CanvasBlock, CanvasEditor } from './schema.js'
import type { CanvasInput } from './adapters.js'
import { ancestorsOf } from './commands.js'

/** Normalize the pasted fragment only. Existing surrounding content is never adopted. */
export function normalizeCanvasPaste(blocks: readonly CanvasBlock[], parentLevel: number): CanvasInput[] {
  const result: CanvasInput[] = []
  let top: CanvasInput | undefined
  let subgroup: CanvasInput | undefined
  function visit(source: readonly CanvasBlock[]): void {
    for (const block of source) {
      if (block.type === 'danaTask') throw new Error('Task references cannot be duplicated by paste. Move the original Task with its block menu.')
      const id = crypto.randomUUID()
      if (block.type === 'heading' && parentLevel < 2) {
        if (parentLevel === 1 || block.props.level === 1 || top === undefined) {
          top = { id, type: 'heading', props: { level: parentLevel + 1, isToggleable: true }, content: block.content, children: [] }
          result.push(top)
          subgroup = undefined
        } else {
          subgroup = { id, type: 'heading', props: { level: 2, isToggleable: true }, content: block.content, children: [] }
          top.children!.push(subgroup)
        }
      } else {
        const node: CanvasInput = block.type === 'image'
          ? /^\/api\/v1\/files\/[0-9a-f-]{36}$/i.test(block.props.url)
            ? { ...block, id, children: [] }
            : { id, type: 'paragraph', content: block.props.caption || block.props.url || 'Image: upload this file to Dana.' }
          : { id, type: 'paragraph', content: block.content, children: [] }
        const destination = subgroup ?? top
        if (destination) destination.children!.push(node)
        else result.push(node)
      }
      visit(block.children)
    }
  }
  visit(blocks)
  return result
}

export function pasteIntoCanvas(editor: CanvasEditor, event: ClipboardEvent, explain: (text: string) => void): boolean | undefined {
  if (event.clipboardData?.files.length) return undefined
  const html = event.clipboardData?.getData('text/html')
  if (!html) return undefined
  try {
    const current = editor.getTextCursorPosition().block
    const parent = ancestorsOf(editor.document, current.id)?.at(-1)
    const level = parent?.type === 'heading' ? parent.props.level : 0
    const normalized = normalizeCanvasPaste(editor.tryParseHTMLToBlocks(html), level)
    editor.pasteHTML(editor.blocksToFullHTML(normalized), true)
    return true
  } catch (error) {
    explain(error instanceof Error ? error.message : 'This content could not be pasted. Try pasting plain text.')
    return true
  }
}
