import type { CanvasBlock, CanvasEditor } from './schema.js'
import type { CanvasInput } from './adapters.js'
import { ancestorsOf } from './commands.js'

const internalFile = /^\/api\/v1\/files\/[0-9a-f-]{36}$/i

/**
 * Normalize the pasted fragment only. Existing surrounding content is never
 * adopted. Purpose uses presentation headings, so pasted headings stay flat;
 * Main keeps the explicit Work-heading parentage it already used.
 */
export function normalizeCanvasPaste(
  blocks: readonly CanvasBlock[],
  parentLevel: number,
  presentationHeadings = false,
): CanvasInput[] {
  const result: CanvasInput[] = []
  let top: CanvasInput | undefined
  let subgroup: CanvasInput | undefined

  function structured(block: CanvasBlock, id: string): CanvasInput {
    if (block.type === 'bulletListItem') {
      return {
        id,
        type: 'bulletListItem',
        content: block.content,
        children: block.children.map((child) =>
          structured(child, crypto.randomUUID()),
        ),
      }
    }
    if (block.type === 'numberedListItem') {
      return {
        id,
        type: 'numberedListItem',
        content: block.content,
        children: block.children.map((child) =>
          structured(child, crypto.randomUUID()),
        ),
      }
    }
    if (block.type === 'checkListItem') {
      return {
        id,
        type: 'checkListItem',
        props: { checked: block.props.checked },
        content: block.content,
        children: block.children.map((child) =>
          structured(child, crypto.randomUUID()),
        ),
      }
    }
    if (block.type === 'quote') {
      return {
        id,
        type: 'quote',
        content: block.content,
        children: [],
      }
    }
    if (block.type === 'callout') {
      return {
        id,
        type: 'callout',
        content: block.content,
        children: [],
      }
    }
    if (block.type === 'codeBlock') {
      return {
        id,
        type: 'codeBlock',
        content: block.content,
        children: [],
      }
    }
    if (
      block.type === 'image' ||
      block.type === 'file' ||
      block.type === 'audio' ||
      block.type === 'video'
    ) {
      if (internalFile.test(block.props.url)) {
        return {
          ...block,
          id,
          children: [],
        } as CanvasInput
      }
      const label =
        block.type === 'image'
          ? block.props.caption || block.props.url || 'Image'
          : block.props.name || block.props.url || 'File'
      return {
        id,
        type: 'paragraph',
        content: label,
        children: [],
      }
    }
    return {
      id,
      type: 'paragraph',
      content: Array.isArray(block.content) ? block.content : '',
      children: [],
    }
  }

  function visit(source: readonly CanvasBlock[]): void {
    for (const block of source) {
      if (block.type === 'danaTask') {
        throw new Error(
          'Task references cannot be duplicated by paste. Move the original Task with its block menu.',
        )
      }
      const id = crypto.randomUUID()

      if (block.type === 'heading') {
        if (presentationHeadings) {
          result.push({
            id,
            type: 'heading',
            props: {
              level: Math.max(1, Math.min(3, block.props.level)) as 1 | 2 | 3,
              isToggleable: false,
            },
            content: block.content,
            children: [],
          })
          visit(block.children)
          continue
        }

        if (parentLevel < 3) {
          if (
            parentLevel === 1 ||
            block.props.level === 1 ||
            top === undefined
          ) {
            top = {
              id,
              type: 'heading',
              props: {
                level: Math.min(3, parentLevel + 1) as 1 | 2 | 3,
                isToggleable: true,
              },
              content: block.content,
              children: [],
            }
            result.push(top)
            subgroup = undefined
          } else {
            subgroup = {
              id,
              type: 'heading',
              props: {
                level: Math.min(3, parentLevel + 1) as 1 | 2 | 3,
                isToggleable: true,
              },
              content: block.content,
              children: [],
            }
            top.children!.push(subgroup)
          }
          visit(block.children)
          continue
        }
      }

      const node = structured(block, id)
      const destination = presentationHeadings ? undefined : subgroup ?? top
      if (destination) destination.children!.push(node)
      else result.push(node)
    }
  }

  visit(blocks)
  return result
}

export function pasteIntoCanvas(
  editor: CanvasEditor,
  event: ClipboardEvent,
  explain: (text: string) => void,
  presentationHeadings = false,
): boolean | undefined {
  if (event.clipboardData?.files.length) return undefined
  const html = event.clipboardData?.getData('text/html')
  if (!html) return undefined
  try {
    const current = editor.getTextCursorPosition().block
    const parent = ancestorsOf(editor.document, current.id)?.at(-1)
    const level =
      parent?.type === 'heading' && parent.props.isToggleable !== false
        ? parent.props.level
        : 0
    const normalized = normalizeCanvasPaste(
      editor.tryParseHTMLToBlocks(html),
      level,
      presentationHeadings,
    )
    editor.pasteHTML(editor.blocksToFullHTML(normalized), true)
    return true
  } catch (error) {
    explain(
      error instanceof Error
        ? error.message
        : 'This content could not be pasted. Try pasting plain text.',
    )
    return true
  }
}
