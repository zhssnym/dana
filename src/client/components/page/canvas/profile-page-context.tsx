import { createContext, useContext } from 'react'

import type { Folder } from '../../../../shared/folders.js'

interface ProfilePageContextValue {
  readonly pages: readonly Folder[]
  readonly pending: boolean
  readonly open: (id: string) => void
  readonly href: (id: string) => string
}

export const ProfilePageContext = createContext<ProfilePageContextValue | null>(null)
export const useProfilePageContext = () => useContext(ProfilePageContext)
