/*
The section 7.0 error envelope as code: every non-2xx API answer carries
exactly this shape, both sides import it, and no route invents a variant.
The code vocabulary is small and canonical, one code per taxonomy status
(see src/server/http/errors.ts); 409's rule conflicts gain their specific
codes as the section 5 tables land.
*/
export interface ApiError {
  code: string
  message: string
}

export interface ErrorEnvelope {
  error: ApiError
}
