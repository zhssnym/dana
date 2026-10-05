/*
 * The global offline banner. Offline comes from `state/connectivity.ts`, never `navigator.onLine`, which reads
 * true for a page served from the worker cache.
 */
import { OfflineBanner as OfflineBannerCard } from '../components/index.js'
import { useOnline } from '../state/useOnline.js'

export function OfflineBanner(): React.JSX.Element | null {
  const online = useOnline()
  if (online) return null
  return <OfflineBannerCard />
}
