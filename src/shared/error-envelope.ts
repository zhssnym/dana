/* The 7.0 error envelope: every non-2xx API answer has exactly this shape. */
import { z } from 'zod'

export interface ApiError {
  code: string
  message: string
}

export interface ErrorEnvelope {
  error: ApiError
}

/* The schema form, for clients and tests; the server builds envelopes in http/errors.ts. */
export const errorEnvelope = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
})
