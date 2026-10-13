import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE_LIMIT, type DiagramRequest } from '../diagram/pipeline.ts';
import { type ComputeResult, computeDiagram } from './compute.ts';
import { DiagramClient, type DiagramWorker, type WorkerRequest, type WorkerResponse } from './diagram-client.ts';

/** A worker stand-in that computes real results but answers only when the test says so. */
class FakeWorker implements DiagramWorker {
  readonly received: WorkerRequest[] = [];
  terminated = false;
  private listeners: { message: ((event: { data: WorkerResponse }) => void)[]; error: (() => void)[] } = {
    message: [],
    error: [],
  };

  postMessage(message: WorkerRequest): void {
    this.received.push(message);
  }

  addEventListener(type: 'message' | 'error', listener: never): void {
    this.listeners[type].push(listener);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Answers the oldest request that has not been answered yet. */
  answerNext(): void {
    const message = this.received[this.answered++];
    if (!message) throw new Error('No request to answer');
    const data = { id: message.id, result: computeDiagram(message.request) };
    for (const listener of this.listeners.message) listener({ data });
  }

  fail(): void {
    this.answered++;
    for (const listener of this.listeners.error) listener();
  }

  private answered = 0;
}

const request = (regex: string): DiagramRequest => ({
  regex,
  representation: 'dfa',
  showSink: false,
  stateLimit: DEFAULT_STATE_LIMIT,
  alphabet: 'ascii',
});

function setup() {
  const worker = new FakeWorker();
  const results: ComputeResult[] = [];
  const client = new DiagramClient(worker, (result) => results.push(result));
  const stateCounts = () => results.map((result) => (result.ok ? result.diagram.states.length : result.error.kind));
  return { worker, client, results, stateCounts };
}

describe('diagram client', () => {
  it('delivers the result of a request', () => {
    const { worker, client, stateCounts } = setup();
    client.request(request('ab'));
    expect(stateCounts()).toEqual([]);
    worker.answerNext();
    expect(stateCounts()).toEqual([3]);
  });

  it('reports which request a result belongs to', () => {
    const worker = new FakeWorker();
    const regexes: string[] = [];
    const client = new DiagramClient(worker, (_result, answered) => regexes.push(answered.regex));
    client.request(request('a'));
    client.request(request('ab'));
    worker.answerNext();
    worker.answerNext();
    expect(regexes).toEqual(['ab']);
  });

  it('delivers errors like any other result', () => {
    const { worker, client, stateCounts } = setup();
    client.request(request('a('));
    worker.answerNext();
    expect(stateCounts()).toEqual(['syntax']);
  });

  it('sends one request at a time and skips requests that were replaced while waiting', () => {
    const { worker, client, stateCounts } = setup();
    client.request(request('a'));
    client.request(request('ab'));
    client.request(request('abc'));
    expect(worker.received.map((message) => message.request.regex)).toEqual(['a']);

    worker.answerNext();
    expect(worker.received.map((message) => message.request.regex)).toEqual(['a', 'abc']);
    worker.answerNext();
    expect(worker.received).toHaveLength(2);
    expect(stateCounts()).toEqual([4]);
  });

  it('ignores a result that a newer request has superseded', () => {
    const { worker, client, stateCounts } = setup();
    client.request(request('a'));
    client.request(request('abcd'));
    worker.answerNext();
    expect(stateCounts()).toEqual([]);
    worker.answerNext();
    expect(stateCounts()).toEqual([5]);
  });

  it('delivers consecutive results when the worker keeps up', () => {
    const { worker, client, stateCounts } = setup();
    client.request(request('a'));
    worker.answerNext();
    client.request(request('ab'));
    worker.answerNext();
    expect(stateCounts()).toEqual([2, 3]);
  });

  it('reports a failed worker and keeps working', () => {
    const { worker, client, results, stateCounts } = setup();
    client.request(request('a'));
    worker.fail();
    expect(results).toEqual([
      { ok: false, error: { kind: 'internal', message: 'The diagram could not be computed because of an internal error.' } },
    ]);
    client.request(request('ab'));
    worker.answerNext();
    expect(stateCounts()).toEqual(['internal', 3]);
  });

  it('stops the worker and delivers nothing after disposal', () => {
    const { worker, client, stateCounts } = setup();
    client.request(request('a'));
    client.dispose();
    expect(worker.terminated).toBe(true);
    worker.answerNext();
    expect(stateCounts()).toEqual([]);
  });
});
