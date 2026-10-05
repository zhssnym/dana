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

const MEDIA_ACCEPT = [...RASTER_MIMES, ...AUDIO_MIMES, ...VIDEO_MIMES].join(',')

/** Uses the server's allowlists; anything else is a generic File. */
export function mediaKindOf(mime: string): CanvasMediaKind {
  if ((RASTER_MIMES as readonly string[]).includes(mime)) return 'image'
  if ((AUDIO_MIMES as readonly string[]).includes(mime)) return 'audio'
  if ((VIDEO_MIMES as readonly string[]).includes(mime)) return 'video'
  return 'file'
}

/**
 * Upload panel for the Media and File commands. Media detects image, audio or
 * video by MIME; File always stays a File. No embed link: the CSP cannot fetch one.
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
  const isFile = block.type === 'file'

  return (
    <div className="w-80 space-y-2 rounded-lg bg-popover p-3 text-sm text-popover-foreground shadow-md">
      <input
        ref={input}
        className="sr-only"
        type="file"
        {...(isFile ? {} : { accept: MEDIA_ACCEPT })}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file === undefined) return
          const kind: CanvasMediaKind = isFile ? 'file' : mediaKindOf(file.type)
          setBusy(true)
          setError('')
          void onUpload(kind, file)
            .then((uploaded) => {
              const props = { url: uploaded.url, name: uploaded.name }
              if (kind === block.type) editor.updateBlock(blockId, { props })
              else editor.updateBlock(blockId, { type: kind, props })
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
        {busy ? 'Uploading…' : block.props.url ? 'Replace file' : 'Upload file'}
      </Button>
      {error === '' ? null : (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
