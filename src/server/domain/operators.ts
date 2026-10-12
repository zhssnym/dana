/** `DANA_OPERATORS`: a comma-separated list of emails allowed to read stats and feedback. */
export function operatorEmails(raw: string | undefined): ReadonlySet<string> {
  return new Set(
    (raw ?? '').split(',').map((email) => email.trim().toLowerCase()).filter((email) => email !== ''),
  )
}
