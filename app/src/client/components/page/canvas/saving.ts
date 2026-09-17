import type { PageActionBody, PageView } from '../../../../shared/pages.js'
import { canvasOperations } from './adapters.js'
import type { CanvasDocument } from './adapters.js'

export type DocumentRequest = Extract<PageActionBody, { action: 'document_transaction' }>
export type SaveState = 'saved' | 'changed' | 'saving' | 'failed'

/** One in-flight gesture; retry retains its exact identity and payload. No offline replay. */
export class CanvasWriter {
  acknowledged: CanvasDocument
  latest: CanvasDocument
  revision: string
  state: SaveState = 'saved'
  error: unknown
  pending: { request: DocumentRequest; document: CanvasDocument } | null = null
  private inFlight: Promise<void> | null = null
  constructor(document: CanvasDocument, revision: string,
    private readonly send: (request: DocumentRequest) => Promise<PageView>,
    private readonly notify: () => void,
    private readonly committed: (page: PageView, checkpoint: boolean) => void,
  ) {
    this.acknowledged = document
    this.latest = document
    this.revision = revision
  }
  change(document: CanvasDocument): void {
    this.latest = document
    if (this.state !== 'failed' && this.state !== 'saving') this.state = JSON.stringify(document) === JSON.stringify(this.acknowledged) ? 'saved' : 'changed'
    this.notify()
  }
  async flush(createTask?: { id: string; title: string }): Promise<void> {
    if (this.inFlight) return this.inFlight
    if (this.state === 'failed') return
    if (this.state === 'saved' && !createTask) return
    if (!this.pending) {
      const operations: DocumentRequest['operations'] = canvasOperations(this.acknowledged, this.latest)
      if (createTask) operations.unshift({ op: 'create_task', ...createTask })
      this.pending = { request: { action: 'document_transaction', mutation_id: crypto.randomUUID(), base_revision: this.revision, operations }, document: this.latest }
    }
    const pending = this.pending
    this.state = 'saving'
    this.notify()
    this.inFlight = (async () => {
      try {
        const page = await this.send(pending.request)
        this.revision = page.revision!
        this.acknowledged = pending.document
        this.pending = null
        const checkpoint = pending.request.operations.some((op) => op.op === 'create_task')
        // A matching receipt can return newer state. Preserve the local draft and
        // stop instead of basing another write on a state the editor never saw.
        if (page.mutation && page.mutation.committed_revision !== page.revision) {
          this.state = 'failed'
          this.error = new Error('Your edit was saved, but the page changed again. Keep a copy of your writing and load the latest page before continuing.')
          return
        }
        this.state = JSON.stringify(this.latest) === JSON.stringify(this.acknowledged) ? 'saved' : 'changed'
        this.error = undefined
        this.committed(page, checkpoint)
      } catch (error) {
        this.error = error
        this.state = 'failed'
      } finally {
        this.inFlight = null
        this.notify()
      }
    })()
    return this.inFlight
  }
  async retry(): Promise<void> {
    if (this.state !== 'failed' || !this.pending) return
    this.state = 'changed'
    await this.flush()
  }
}
