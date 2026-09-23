import {
  BasicTextStyleButton, CreateLinkButton, FileCaptionButton, FileReplaceButton,
  FormattingToolbar, useBlockNoteEditor, useComponentsContext, useEditorState,
} from '@blocknote/react'

import { X } from '../../../lib/icons.js'

function ClearFormattingButton(): React.JSX.Element | null {
  const editor = useBlockNoteEditor()
  const components = useComponentsContext()!
  const hasText = useEditorState({
    editor,
    selector: ({ editor: current }) => current.isEditable &&
      (current.getSelection()?.blocks ?? [current.getTextCursorPosition().block])
        .some((block) => current.schema.blockSchema[block.type]?.content === 'inline'),
  })
  if (!hasText) return null
  return (
    <components.FormattingToolbar.Button
      label="Clear formatting"
      mainTooltip="Clear formatting"
      icon={<X size={16} />}
      onClick={() => {
        editor.focus()
        editor.removeStyles({ bold: true, italic: true })
      }}
    />
  )
}

function ImageCaptionButton(): React.JSX.Element | null {
  const editor = useBlockNoteEditor()
  const imageSelected = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      (current.getSelection()?.blocks ?? [
        current.getTextCursorPosition().block,
      ]).some((block) => block.type === 'image'),
  })
  return imageSelected ? <ImageCaptionButton /> : null
}

/** Compose supported upstream controls; BlockNote owns selection and popover behavior. */
export function CanvasFormattingToolbar(): React.JSX.Element {
  return (
    <FormattingToolbar>
      <BasicTextStyleButton basicTextStyle="bold" />
      <BasicTextStyleButton basicTextStyle="italic" />
      <CreateLinkButton />
      <ClearFormattingButton />
      <FileCaptionButton />
      <FileReplaceButton />
    </FormattingToolbar>
  )
}
