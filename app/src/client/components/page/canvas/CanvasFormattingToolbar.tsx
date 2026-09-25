import {
  BasicTextStyleButton, CreateLinkButton, FileCaptionButton, FileDownloadButton, FileReplaceButton,
  FormattingToolbar, useBlockNoteEditor, useEditorState,
} from '@blocknote/react'

function ImageCaptionButton(): React.JSX.Element | null {
  const editor = useBlockNoteEditor()
  const imageSelected = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      (current.getSelection()?.blocks ?? [
        current.getTextCursorPosition().block,
      ]).some((block) => block.type === 'image'),
  })
  return imageSelected ? <FileCaptionButton /> : null
}

/** Compose supported upstream controls; BlockNote owns selection and popover behavior.
 * Text has bold, italic and a link. There is no "Clear formatting": its ✕ read
 * as "close", and pressing B or I again undoes either. */
export function CanvasFormattingToolbar(): React.JSX.Element {
  return (
    <FormattingToolbar>
      <BasicTextStyleButton basicTextStyle="bold" />
      <BasicTextStyleButton basicTextStyle="italic" />
      <CreateLinkButton />
      <ImageCaptionButton />
      <FileReplaceButton />
      <FileDownloadButton />
    </FormattingToolbar>
  )
}
