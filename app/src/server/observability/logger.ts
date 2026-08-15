import { pino, transport as pinoTransport } from 'pino'
import type { Logger } from 'pino'

export interface AxiomLogEnvironment {
  AXIOM_DATASET?: string
  AXIOM_TOKEN?: string
}

export type AxiomLogStatus =
  | { state: 'disabled' }
  | { state: 'incomplete'; missing: string }
  | { state: 'enabled' }

export interface ApplicationLogger {
  logger: Logger
  axiom: AxiomLogStatus
}

interface AxiomLogConfiguration {
  dataset: string
  token: string
}

export function resolveAxiomConfiguration(
  env: AxiomLogEnvironment,
): AxiomLogConfiguration | AxiomLogStatus {
  const dataset = env.AXIOM_DATASET?.trim() ?? ''
  const token = env.AXIOM_TOKEN?.trim() ?? ''

  if (dataset === '' && token === '') return { state: 'disabled' }

  const missing = [
    ...(dataset === '' ? ['AXIOM_DATASET'] : []),
    ...(token === '' ? ['AXIOM_TOKEN'] : []),
  ]
  if (missing.length > 0) {
    return { state: 'incomplete', missing: missing.join(', ') }
  }

  return { dataset, token }
}

/**
 * Build Dana's process logger.
 *
 * Stdout remains the first destination so Render's own log explorer and
 * deploy diagnostics keep working. When both private Axiom settings exist,
 * the exact same privacy-approved Pino records are mirrored to Axiom over
 * HTTPS by Axiom's official transport. No Axiom setting means no worker and
 * no network request, which keeps local development and CI self-contained.
 */
export function createApplicationLogger(
  env: AxiomLogEnvironment = process.env,
): ApplicationLogger {
  const configuration = resolveAxiomConfiguration(env)

  if ('state' in configuration) {
    return { logger: pino(), axiom: configuration }
  }

  const transport = pinoTransport({
    targets: [
      {
        level: 'info',
        target: 'pino/file',
        options: { destination: 1 },
      },
      {
        level: 'info',
        target: '@axiomhq/pino',
        options: {
          dataset: configuration.dataset,
          token: configuration.token,
          axiomClient: 'dana-server',
        },
      },
    ],
  })

  return { logger: pino(transport), axiom: { state: 'enabled' } }
}
