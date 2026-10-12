import { computeDiagram } from './compute.ts';
import type { WorkerRequest, WorkerResponse } from './diagram-client.ts';

// Parsing, automaton construction, and layout run here, off the main thread, so that
// an expensive expression cannot block typing or animation.
self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const { id, request } = event.data;
  const response: WorkerResponse = { id, result: computeDiagram(request) };
  self.postMessage(response);
});
