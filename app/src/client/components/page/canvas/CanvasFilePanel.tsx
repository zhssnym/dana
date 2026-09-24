import { useRef, useState } from 'react'
import type { FilePanelProps } from '@blocknote/react'
import { useBlockNoteEditor } from '@blocknote/react'

import {
  AUDIO_MIMES,
  RASTER_MIMES,
  VIDEO_MIMES,
} from '../../../../shared/files.js'
import { Button } from '../../ui/button.js'
import type { CanvasEditor } from './schema.js'

export type CanvasMediaKind = 'image' | 'file' | 'audio' | 'video'

export interface CanvasUploadedFile {
  readonly url: string
  readonly name: string
}

const accepts: Record<CanvasMediaKind, string> = {
  image: RASTER_MIMES.join(','),
  audio: AUDIO_MIMES.join(','),
  video: VIDEO_MIMES.join(','),
  file: '',
}

/**
 * Exact-kind upload panel for Dana media blocks.
 *
 * BlockNote's editor-wide upload hook receives only a File, so it cannot know
 * whether a JPG was inserted through "File" (which must stay a File) or
 * "Image". The selected block does know. This panel is therefore the authority
 * for explicit insertion and replacement: block kind in, matching upload kind
 * out, no extension-based reclassification.
 */
export function CanvasFilePanel({
  blockId,
  onUpload,
}: FilePanelProps & {
  readonly onUpload: (
    kind: CanvasMediaKind,
    file: File,
  ) => Promise<CanvasUploadedFile>
}): React.JSX.Element | null {
  const editor = useBlockNoteEditor() as CanvasEditor
  const input = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const block = editor.getBlock(blockId)

  if (
    block === undefined ||
    (block.type !== 'image' &&
      block.type !== 'file' &&
      block.type !== 'audio' &&
      block.type !== 'video')
  ) {
    return null
  }
  const kind = block.type as CanvasMediaKind

  return (
    <div className="w-72 space-y-2 p-2">
      <input
        ref={input}
        className="sr-only"
        type="file"
        {...(accepts[kind] === '' ? {} : { accept: accepts[kind] })}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file === undefined) return
          setBusy(true)
          setError('')
          void onUpload(kind, file)
            .then((uploaded) => {
              editor.updateBlock(blockId, {
                props: {
                  url: uploaded.url,
                  name: uploaded.name,
                },
              })
            })
            .catch((failure: unknown) => {
              setError(
                failure instanceof Error
                  ? failure.message
                  : 'The file could not be uploaded. Try again.',
              )
            })
            .finally(() => setBusy(false))
        }}
      />
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? 'Uploading…' : block.props.url ? 'Replace file' : 'Choose file'}
      </Button>
      {error === '' ? null : (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
