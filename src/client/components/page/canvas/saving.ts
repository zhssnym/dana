import type { PageActionBody, PageView } from '../../../../shared/pages.js'
import { baselineOf, canvasOperations, restoreCanvas } from './adapters.js'
import type { CanvasDocument } from './adapters.js'

export type DocumentRequest = Extract<PageActionBody, { action: 'document_transaction' }>
export type SaveState = 'saved' | 'changed' | 'saving' | 'failed'
/** A task or sub-page made in the same transaction as the writing that places it. */
export type Creation = Extract<DocumentRequest['operations'][number], { op: 'create_task' | 'create_page' }>

/** One gesture in flight; retry keeps its exact identity and payload. No offline replay. */
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
    private readonly committed: (page: PageView, checkpoint: boolean, operations: DocumentRequest['operations']) => void,
  ) {
    this.acknowledged = document
    this.latest = document
    this.revision = revision
  }
  /**
   * Whether this document would write anything, asked the same way `canvasOperations`
   * does (after `restoreCanvas`), so autosave never sends no-op transactions.
   */
  private settled(document: CanvasDocument): boolean {
    return JSON.stringify(restoreCanvas(this.acknowledged, document)) === JSON.stringify(this.acknowledged)
  }
  change(document: CanvasDocument): void {
    this.latest = document
    if (this.state !== 'failed' && this.state !== 'saving') this.state = this.settled(document) ? 'saved' : 'changed'
    this.notify()
  }
  async flush(creation?: Creation): Promise<void> {
    if (this.inFlight) return this.inFlight
    if (this.state === 'failed') return
    if (this.state === 'saved' && !creation) return
    if (!this.pending) {
      const operations: DocumentRequest['operations'] = canvasOperations(this.acknowledged, this.latest)
      if (creation) operations.unshift(creation)
      this.pending = { request: { action: 'document_transaction', mutation_id: crypto.randomUUID(), base_revision: this.revision, operations }, document: this.latest }
    }
    const pending = this.pending
    this.state = 'saving'
    this.notify()
    this.inFlight = (async () => {
      try {
        const page = await this.send(pending.request)
        // No revision means no safe base for the next write, so fail visibly. Retry re-sends
        // the same mutation id, which the server replays.
        if (!page.revision) throw new Error('The page saved without a version. Retry to confirm it.')
        this.revision = page.revision
        // The new baseline is what was sent, through `baselineOf`.
        this.acknowledged = baselineOf(page, pending.document)
        this.pending = null
        const checkpoint = pending.request.operations.some((op) => op.op === 'create_task' || op.op === 'create_page')
        // The receipt can carry newer state; keep the local draft and stop rather than base a
        // write on state the editor never saw.
        if (page.mutation && page.mutation.committed_revision !== page.revision) {
          this.state = 'failed'
          this.error = new Error('Your edit was saved, but the page changed again. Keep a copy of your writing and load the latest page before continuing.')
          return
        }
        this.state = this.settled(this.latest) ? 'saved' : 'changed'
        this.error = undefined
        this.committed(page, checkpoint, pending.request.operations)
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
  /** Leaving the editor: wait out a save in flight, then send what came after it. */
  async drain(): Promise<void> {
    await this.flush()
    if (this.state === 'changed') await this.flush()
  }
  /** A newer revision this editor already shows (its own task went to Trash): nothing to send. */
  adopt(page: PageView, document: CanvasDocument): void {
    if (!page.revision) return
    this.revision = page.revision
    this.acknowledged = baselineOf(page, document)
    this.change(document)
  }
  async retry(): Promise<void> {
    if (this.state !== 'failed' || !this.pending) return
    this.state = 'changed'
    await this.flush()
  }
}
