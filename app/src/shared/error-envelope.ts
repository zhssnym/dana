/*
The section 7.0 error envelope as code: every non-2xx API answer carries
exactly this shape, both sides import it, and no route invents a variant.
The code vocabulary is small and canonical, one code per taxonomy status
(see src/server/http/errors.ts); 409's rule conflicts gain their specific
codes as the section 5 tables land.
*/
import { z } from 'zod'

export interface ApiError {
  code: string
  message: string
}

export interface ErrorEnvelope {
  error: ApiError
}

/*
The same envelope as a schema, so a client can tell an error answer from a
success answer by parsing rather than by guessing from the status, and so a
test can assert the shape of every refusal without restating it. The server
builds envelopes through src/server/http/errors.ts and never parses them; this
is for the reading side.
*/
export const errorEnvelope = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
})
