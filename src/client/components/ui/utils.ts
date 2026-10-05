// `cn`: clsx for conditionals, then tailwind-merge so a caller's `className` wins over a
// variant's own classes.
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
