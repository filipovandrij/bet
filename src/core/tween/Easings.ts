export type EasingFn = (t: number) => number;

// Smooth casual/slot-style set (fast to evaluate, no allocations).
export const Easings = {
  linear: (t: number) => t,

  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  inOutCubic: (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,

  outQuint: (t: number) => 1 - Math.pow(1 - t, 5),
  outBack: (t: number) => {
    // Overshoot curve, good for UI.
    const c1 = 1.7;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },

  outBounce: (t: number) => {
    // "Robert Penner" bounce.
    const n1 = 7.56;
    const d1 = 2.7;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.93;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
} satisfies Record<string, EasingFn>;

