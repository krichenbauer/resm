import { type DiagramError, type DiagramInfo, type DiagramRequest, buildDiagram } from '../diagram/pipeline.ts';
import { type DiagramLayout, layoutDiagram } from '../layout/layout.ts';

/** A diagram with its layout, or the reason why there is none. */
export type ComputeResult =
  | ({ readonly ok: true; readonly layout: DiagramLayout } & DiagramInfo)
  | { readonly ok: false; readonly error: DiagramError };

/** Everything that is computed off the main thread for one request. */
export function computeDiagram(request: DiagramRequest): ComputeResult {
  const result = buildDiagram(request);
  if (!result.ok) return result;
  return { ...result, layout: layoutDiagram(result.diagram) };
}
