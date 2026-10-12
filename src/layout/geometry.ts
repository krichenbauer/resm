export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Radius of the circle of a state, in diagram units. */
export const STATE_RADIUS = 22;

/** Distance between an edge and the middle of its label. */
const LABEL_GAP = 11;

/** Approximate width of one label character; labels are set in a monospace font. */
const LABEL_CHAR_WIDTH = 8;

/** Half the angle between the two ends of a loop, seen from the center of its state. */
const LOOP_SPREAD = 0.4;

/** What is needed to draw an edge: the SVG path data and the middle of its label. */
export interface EdgeGeometry {
  readonly path: string;
  readonly label: Point;
}

export function estimateLabelWidth(label: string): number {
  return label.length * LABEL_CHAR_WIDTH;
}

const format = (value: number) => String(Number(value.toFixed(2)));
const formatPoint = ({ x, y }: Point) => `${format(x)} ${format(y)}`;

function polar(center: Point, radius: number, angle: number): Point {
  return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
}

/** The point on the outline of the state at `center` that faces `towards`. */
function onOutline(center: Point, towards: Point): Point {
  return polar(center, STATE_RADIUS, Math.atan2(towards.y - center.y, towards.x - center.x));
}

/**
 * The quadratic Bézier curve of an edge between two different states. `bend`
 * is relative to the distance of the states: 0 is a straight line, and a
 * positive value bends to the left of the direction of travel. So two edges
 * with the same bend in opposite directions curve away from each other.
 */
function arcCurve(from: Point, to: Point, bend: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const normal = { x: dy / length, y: -dx / length };
  const control = {
    x: (from.x + to.x) / 2 + normal.x * 2 * bend * length,
    y: (from.y + to.y) / 2 + normal.y * 2 * bend * length,
  };
  const start = onOutline(from, control);
  const end = onOutline(to, control);
  const at = (t: number): Point => ({
    x: (1 - t) ** 2 * start.x + 2 * (1 - t) * t * control.x + t ** 2 * end.x,
    y: (1 - t) ** 2 * start.y + 2 * (1 - t) * t * control.y + t ** 2 * end.y,
  });
  return { start, control, end, normal, at };
}

/** `count` evenly spaced points along the curve of an edge, including both ends. */
export function arcPoints(from: Point, to: Point, bend: number, count: number): Point[] {
  const { at } = arcCurve(from, to, bend);
  return Array.from({ length: count }, (_, index) => at(index / (count - 1)));
}

/** The geometry of an edge between two different states; see `arcCurve` for `bend`. */
export function arcGeometry(from: Point, to: Point, bend: number, labelWidth: number): EdgeGeometry {
  const { start, control, end, normal, at } = arcCurve(from, to, bend);
  const middle = at(0.5);
  // The label sits on the outer side of the bend. The more the edge runs
  // vertically, the more of the label's width has to clear the line.
  const offset = (bend < 0 ? -1 : 1) * (LABEL_GAP + (Math.abs(normal.x) * labelWidth) / 2);
  return {
    path: `M${formatPoint(start)}Q${formatPoint(control)} ${formatPoint(end)}`,
    label: { x: middle.x + normal.x * offset, y: middle.y + normal.y * offset },
  };
}

/** The geometry of an edge from a state to itself, pointing in the direction `angle`. */
export function loopGeometry(center: Point, angle: number): EdgeGeometry {
  const start = polar(center, STATE_RADIUS, angle - LOOP_SPREAD);
  const end = polar(center, STATE_RADIUS, angle + LOOP_SPREAD);
  const reach = STATE_RADIUS * 2.8;
  const control1 = polar(center, reach, angle - LOOP_SPREAD * 1.25);
  const control2 = polar(center, reach, angle + LOOP_SPREAD * 1.25);
  // Distance of the outermost point of the loop from the center: the curve at its middle.
  const apex = (2 * STATE_RADIUS * Math.cos(LOOP_SPREAD) + 6 * reach * Math.cos(LOOP_SPREAD * 1.25)) / 8;
  return {
    path: `M${formatPoint(start)}C${formatPoint(control1)} ${formatPoint(control2)} ${formatPoint(end)}`,
    label: polar(center, apex + LABEL_GAP, angle),
  };
}
