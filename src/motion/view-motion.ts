import type { View } from '../layout/viewport.ts';

/** Share of the remaining way that the view covers per second, as a rate of exponential decay. */
const RATE = 8;

/** The view is at rest when it is this close to its destination, in screen pixels and relative scale. */
const REST_DISTANCE = 0.25;
const REST_SCALE = 0.0005;

/** Moves the view smoothly to a destination, decelerating as it arrives. */
export class ViewMotion {
  private view: View;
  private target: View;

  constructor(view: View) {
    this.view = view;
    this.target = view;
  }

  get current(): View {
    return this.view;
  }

  /** The view that the motion is heading for; the current view when at rest. */
  get destination(): View {
    return this.target;
  }

  get settled(): boolean {
    return this.view === this.target;
  }

  /** Sets the view at once and ends any motion, as for direct manipulation by the user. */
  jumpTo(view: View): void {
    this.view = view;
    this.target = view;
  }

  glideTo(view: View): void {
    this.target = view;
  }

  /** Advances the motion by the given time in seconds. */
  step(seconds: number): void {
    if (this.settled) return;
    const { view, target } = this;
    const share = 1 - Math.exp(-RATE * seconds);
    // Scale is interpolated geometrically, so zooming looks even at every scale.
    const scale = view.scale * (target.scale / view.scale) ** share;
    const x = view.x + (target.x - view.x) * share;
    const y = view.y + (target.y - view.y) * share;
    const distance = Math.hypot(target.x - x, target.y - y) * scale;
    const arrived = distance < REST_DISTANCE && Math.abs(target.scale / scale - 1) < REST_SCALE;
    this.view = arrived ? target : { x, y, scale };
  }
}
