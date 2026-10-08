import {
  BasicTextStyleButton, CreateLinkButton, FileCaptionButton, FileDownloadButton, FileReplaceButton,
  FormattingToolbar, TableCellMergeButton, useBlockNoteEditor, useEditorState,
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

/** Bold, italic and link only. No "Clear formatting": its ✕ read as "close". */
export function CanvasFormattingToolbar(): React.JSX.Element {
  return (
    <FormattingToolbar>
      <BasicTextStyleButton basicTextStyle="bold" />
      <BasicTextStyleButton basicTextStyle="italic" />
      <CreateLinkButton />
      <TableCellMergeButton />
      <ImageCaptionButton />
      <FileReplaceButton />
      <FileDownloadButton />
    </FormattingToolbar>
  )
}
