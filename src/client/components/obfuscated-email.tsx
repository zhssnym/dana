// The support address, written so scrapers do not find it; it becomes a mailto only on click.
import { SUPPORT_EMAIL } from '../../shared/support.js'

export function obfuscatedEmail(address: string = SUPPORT_EMAIL): string {
  const [name = '', domain = ''] = address.split('@')
  return `${name} [at] ${domain.replace(/\./g, ' [dot] ')}`
}
