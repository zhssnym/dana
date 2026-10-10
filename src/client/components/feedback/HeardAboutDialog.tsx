// Asked once: "How did you hear about Dana?". One click answers; Skip also counts as asked.
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { z } from 'zod'

import type { HeardAbout } from '../../../shared/feedback.js'
import type { MeResponse } from '../../../shared/me.js'
import { mutateApi } from '../../api/http.js'
import { queryKeys } from '../../api/keys.js'
import { useMe } from '../../api/queries.js'
import { Button } from '../ui/button.js'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog.js'

export const HEARD_ABOUT_LABELS: Record<HeardAbout, string> = {
  friend: 'A friend or colleague',
  whatsapp: 'WhatsApp or another chat app',
  google: 'Google search',
  ai: 'ChatGPT or another AI',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X (Twitter)',
  reddit: 'Reddit',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  invite: 'An invite to a page',
  other: 'Somewhere else',
  skipped: 'Skipped',
}

const CHOICES = (Object.keys(HEARD_ABOUT_LABELS) as HeardAbout[]).filter((answer) => answer !== 'skipped')

export function HeardAboutDialog(): React.JSX.Element | null {
  const me = useMe()
  const client = useQueryClient()
  const [closed, setClosed] = useState(false)
  if (closed || me.data === undefined || me.data.user.heard_about !== null) return null

  function answer(value: HeardAbout): void {
    setClosed(true)
    client.setQueryData<MeResponse>(queryKeys.me(), (old) =>
      old === undefined ? old : { ...old, user: { ...old.user, heard_about: value } })
    // A failed save only means the question comes back next time.
    void mutateApi(z.unknown(), { method: 'PUT', path: '/me/heard-about', body: { answer: value } }).catch(() => undefined)
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) answer('skipped') }}>
      <DialogContent className="w-[min(520px,calc(100vw-32px))]">
        <DialogHeader>
          <DialogTitle>How did you hear about Dana?</DialogTitle>
          <DialogDescription>One click. It helps us find more people like you.</DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid grid-cols-2 gap-2 max-sm:grid-cols-1">
          {CHOICES.map((choice) => (
            <Button key={choice} variant="outline" className="justify-start" onClick={() => answer(choice)}>
              {HEARD_ABOUT_LABELS[choice]}
            </Button>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" className="text-muted-foreground" onClick={() => answer('skipped')}>Skip</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
