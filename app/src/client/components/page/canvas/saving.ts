import type { PageActionBody, PageView } from '../../../../shared/pages.js'
import { baselineOf, canvasOperations, restoreCanvas } from './adapters.js'
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
    private readonly committed: (page: PageView, checkpoint: boolean, operations: DocumentRequest['operations']) => void,
  ) {
    this.acknowledged = document
    this.latest = document
    this.revision = revision
  }
  /**
   * Whether this document would write anything, which is not whether it equals
   * the baseline byte for byte.
   *
   * The baseline carries kinds, ticks and list parents this editor cannot
   * draw, so the projection it hands back never equals it and a plain
   * comparison reads "unsaved" forever — and the 450 ms autosave then sends
   * one no-op transaction after another for as long as the page is open. What
   * "unchanged" means here is unchanged *after* restoration, and `restoreCanvas`
   * is idempotent over a baseline built by `baselineOf`, which is what makes
   * this the same question `canvasOperations` answers.
   */
  private settled(document: CanvasDocument): boolean {
    return JSON.stringify(restoreCanvas(this.acknowledged, document)) === JSON.stringify(this.acknowledged)
  }
  change(document: CanvasDocument): void {
    this.latest = document
    if (this.state !== 'failed' && this.state !== 'saving') this.state = this.settled(document) ? 'saved' : 'changed'
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
        // No revision means no safe base for the next write; fail visibly.
        // Retry re-sends the same mutation id, which the server replays.
        if (!page.revision) throw new Error('The page saved without a version. Retry to confirm it.')
        this.revision = page.revision
        // Re-based on what the server now holds, not on the projection that was
        // sent. The projection expresses none of the structured kinds, so a
        // baseline taken from it is flat from the second save onward and the
        // next one destroys exactly what the first one preserved.
        this.acknowledged = baselineOf(page, pending.document)
        this.pending = null
        const checkpoint = pending.request.operations.some((op) => op.op === 'create_task')
        // A matching receipt can return newer state. Preserve the local draft and
        // stop instead of basing another write on a state the editor never saw.
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
  async retry(): Promise<void> {
    if (this.state !== 'failed' || !this.pending) return
    this.state = 'changed'
    await this.flush()
  }
}
