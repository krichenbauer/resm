import { buildDiagram } from '../diagram/pipeline.ts';
import type { WorkerRequest, WorkerResponse } from './diagram-client.ts';

// Parsing and automaton construction run here, off the main thread, so that
// an expensive expression cannot block typing or animation.
self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const { id, request } = event.data;
  const response: WorkerResponse = { id, result: buildDiagram(request) };
  self.postMessage(response);
});
