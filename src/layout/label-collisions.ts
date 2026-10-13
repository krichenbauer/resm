import type { Diagram } from '../diagram/diagram.ts';
import { type Point, STATE_RADIUS, arcPoints, loopPoints } from './geometry.ts';
import type { DiagramLayout } from './layout.ts';
import { buildScene } from './scene.ts';

/** Half the height of the box that the text of a label fills. */
const LABEL_HALF_HEIGHT = 7;

/**
 * Lists everything that makes a label hard to read in a layout: another edge
 * that runs through it, another label on top of it, or a state under it. This
 * check is written for tests and deliberately simple: it samples the curves
 * densely instead of sharing the geometry that the layout itself uses.
 */
export function findLabelCollisions(diagram: Diagram, layout: DiagramLayout): string[] {
  const scene = buildScene(diagram, layout.positions, layout.shapes);
  const position = (state: number): Point => layout.positions[state] ?? { x: 0, y: 0 };
  const name = (index: number) => scene.edges[index]?.id ?? '?';

  const boxes = scene.edges.map(({ label }) => ({
    minX: label.x - label.width / 2,
    maxX: label.x + label.width / 2,
    minY: label.y - LABEL_HALF_HEIGHT,
    maxY: label.y + LABEL_HALF_HEIGHT,
  }));
  const curves = diagram.edges.map(({ from, to }, index) => {
    const shape = layout.shapes[index];
    if (!shape) return [];
    if (shape.kind === 'loop') return loopPoints(position(from), shape.angle, 40);
    const samples = Math.max(16, Math.ceil(Math.hypot(position(to).x - position(from).x, position(to).y - position(from).y) / 2));
    return arcPoints(position(from), position(to), shape.bend, samples);
  });

  const collisions: string[] = [];
  boxes.forEach((box, index) => {
    curves.forEach((curve, other) => {
      if (other === index) return;
      if (curve.some(({ x, y }) => x > box.minX && x < box.maxX && y > box.minY && y < box.maxY)) {
        collisions.push(`edge ${name(other)} runs through the label of ${name(index)}`);
      }
    });
    boxes.forEach((otherBox, other) => {
      if (other <= index) return;
      if (box.minX < otherBox.maxX && otherBox.minX < box.maxX && box.minY < otherBox.maxY && otherBox.minY < box.maxY) {
        collisions.push(`the labels of ${name(index)} and ${name(other)} overlap`);
      }
    });
    layout.positions.forEach((center, state) => {
      const dx = Math.max(box.minX - center.x, 0, center.x - box.maxX);
      const dy = Math.max(box.minY - center.y, 0, center.y - box.maxY);
      if (Math.hypot(dx, dy) < STATE_RADIUS) {
        collisions.push(`the label of ${name(index)} lies on ${diagram.states[state]?.name}`);
      }
    });
  });
  return collisions;
}
