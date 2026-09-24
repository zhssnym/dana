/*
The support address written so a scraper reading the page does not find an
address in it: shown as "name [at] domain [dot] tld", and turned into a real
mailto only when someone clicks it.
*/
import { SUPPORT_EMAIL } from '../../shared/support.js'

export function obfuscatedEmail(address: string = SUPPORT_EMAIL): string {
  const [name = '', domain = ''] = address.split('@')
  return `${name} [at] ${domain.replace(/\./g, ' [dot] ')}`
}

export function ObfuscatedEmail({ className }: { readonly className?: string }): React.JSX.Element {
  return (
    <a
      href="#"
      className={className}
      onClick={(event) => {
        event.preventDefault()
        window.location.href = ['mailto', SUPPORT_EMAIL].join(':')
      }}
    >
      {obfuscatedEmail()}
    </a>
  )
}
