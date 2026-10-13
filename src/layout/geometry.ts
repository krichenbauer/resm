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

/**
 * Where the label of an edge between two states sits: `at` the given share of
 * the way along the curve, from 0 at its start to 1 at its end, and on the
 * left (1) or right (-1) `side` of the direction of travel.
 */
export interface LabelPlacement {
  readonly at: number;
  readonly side: 1 | -1;
}

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
  /** The unit vector that points to the left of the direction of travel at `t`. */
  const leftAt = (t: number): Point => {
    const tx = (1 - t) * (control.x - start.x) + t * (end.x - control.x);
    const ty = (1 - t) * (control.y - start.y) + t * (end.y - control.y);
    const speed = Math.hypot(tx, ty);
    return speed > 0 ? { x: ty / speed, y: -tx / speed } : normal;
  };
  return { start, control, end, at, leftAt };
}

/** `count` evenly spaced points along the curve of an edge, including both ends. */
export function arcPoints(from: Point, to: Point, bend: number, count: number): Point[] {
  const { at } = arcCurve(from, to, bend);
  return Array.from({ length: count }, (_, index) => at(index / (count - 1)));
}

/**
 * The geometry of an edge between two different states; see `arcCurve` for
 * `bend`. Unless placed otherwise, the label sits at the middle of the curve
 * on the outer side of the bend.
 */
export function arcGeometry(
  from: Point,
  to: Point,
  bend: number,
  labelWidth: number,
  placement: LabelPlacement = { at: 0.5, side: bend < 0 ? -1 : 1 },
): EdgeGeometry {
  const { start, control, end, at, leftAt } = arcCurve(from, to, bend);
  const anchor = at(placement.at);
  const left = leftAt(placement.at);
  // The more the edge runs vertically, the more of the label's width has to clear the line.
  const offset = placement.side * (LABEL_GAP + (Math.abs(left.x) * labelWidth) / 2);
  return {
    path: `M${formatPoint(start)}Q${formatPoint(control)} ${formatPoint(end)}`,
    label: { x: anchor.x + left.x * offset, y: anchor.y + left.y * offset },
  };
}

/** The cubic Bézier curve of an edge from a state to itself, pointing in the direction `angle`. */
function loopCurve(center: Point, angle: number) {
  const reach = STATE_RADIUS * 2.8;
  return {
    start: polar(center, STATE_RADIUS, angle - LOOP_SPREAD),
    control1: polar(center, reach, angle - LOOP_SPREAD * 1.25),
    control2: polar(center, reach, angle + LOOP_SPREAD * 1.25),
    end: polar(center, STATE_RADIUS, angle + LOOP_SPREAD),
    // Distance of the outermost point of the loop from the center: the curve at its middle.
    apex: (2 * STATE_RADIUS * Math.cos(LOOP_SPREAD) + 6 * reach * Math.cos(LOOP_SPREAD * 1.25)) / 8,
  };
}

/** `count` evenly spaced points along the loop of a state, including both ends. */
export function loopPoints(center: Point, angle: number, count: number): Point[] {
  const { start, control1, control2, end } = loopCurve(center, angle);
  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    const weights = [(1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3] as const;
    return {
      x: weights[0] * start.x + weights[1] * control1.x + weights[2] * control2.x + weights[3] * end.x,
      y: weights[0] * start.y + weights[1] * control1.y + weights[2] * control2.y + weights[3] * end.y,
    };
  });
}

/** The geometry of an edge from a state to itself, pointing in the direction `angle`. */
export function loopGeometry(center: Point, angle: number): EdgeGeometry {
  const { start, control1, control2, end, apex } = loopCurve(center, angle);
  return {
    path: `M${formatPoint(start)}C${formatPoint(control1)} ${formatPoint(control2)} ${formatPoint(end)}`,
    label: polar(center, apex + LABEL_GAP, angle),
  };
}
