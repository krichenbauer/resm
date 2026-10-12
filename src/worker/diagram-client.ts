import type { DiagramRequest } from '../diagram/pipeline.ts';
import type { ComputeResult } from './compute.ts';

export interface WorkerRequest {
  readonly id: number;
  readonly request: DiagramRequest;
}

export interface WorkerResponse {
  readonly id: number;
  readonly result: ComputeResult;
}

/** The part of a web worker that the client uses. */
export interface DiagramWorker {
  postMessage(message: WorkerRequest): void;
  addEventListener(type: 'message', listener: (event: { readonly data: WorkerResponse }) => void): void;
  addEventListener(type: 'error', listener: () => void): void;
  terminate(): void;
}

/**
 * Computes diagrams in a worker and reports only results that are still
 * current. The worker gets one request at a time; while it is busy, a newer
 * request replaces the waiting one, and the result of a replaced request is
 * dropped. So fast typing never queues up work or shows an outdated diagram.
 */
export class DiagramClient {
  private nextId = 0;
  private inFlight: { readonly id: number; readonly request: DiagramRequest } | null = null;
  private waiting: DiagramRequest | null = null;
  private disposed = false;

  constructor(
    private readonly worker: DiagramWorker,
    private readonly onResult: (result: ComputeResult, request: DiagramRequest) => void,
  ) {
    worker.addEventListener('message', ({ data }) => this.settle(data.id, data.result));
    worker.addEventListener('error', () => {
      if (this.inFlight === null) return;
      this.settle(this.inFlight.id, {
        ok: false,
        error: { kind: 'internal', message: 'The diagram could not be computed because of an internal error.' },
      });
    });
  }

  /** Asks for a diagram. Its result is reported unless another request follows first. */
  request(request: DiagramRequest): void {
    if (this.disposed) return;
    if (this.inFlight === null) this.send(request);
    else this.waiting = request;
  }

  /** Stops the worker. No further results are reported. */
  dispose(): void {
    this.disposed = true;
    this.worker.terminate();
  }

  private send(request: DiagramRequest): void {
    this.inFlight = { id: this.nextId++, request };
    this.worker.postMessage(this.inFlight);
  }

  private settle(id: number, result: ComputeResult): void {
    if (this.disposed || id !== this.inFlight?.id) return;
    const { request } = this.inFlight;
    this.inFlight = null;
    const next = this.waiting;
    this.waiting = null;
    if (next) this.send(next);
    else this.onResult(result, request);
  }
}
