import type { EasingFn } from './Easings';
import { Easings } from './Easings';

export type TweenProps = Record<string, number>;

export interface TweenOptions {
  ease?: EasingFn;
  delay?: number;
  onUpdate?: () => void;
  onComplete?: () => void;
}

interface TweenItem {
  target: any;
  from: TweenProps;
  to: TweenProps;
  duration: number;
  elapsed: number;
  delay: number;
  ease: EasingFn;
  onUpdate?: () => void;
  onComplete?: () => void;
  active: boolean;
}

/**
 * Small, production-friendly tween runner:
 * - time-based
 * - no allocations in update loop (beyond property writes)
 * - supports delays + easing
 */
export class TweenManager {
  private readonly tweens: TweenItem[] = [];

  to<T extends object>(
    target: T,
    to: TweenProps,
    duration: number,
    options: TweenOptions = {},
  ): void {
    const from: TweenProps = {};
    for (const k in to) from[k] = (target as any)[k] as number;

    const item: TweenItem = {
      target,
      from,
      to,
      duration: Math.max(0.0001, duration),
      elapsed: 0,
      delay: Math.max(0, options.delay ?? 0),
      ease: options.ease ?? Easings.outCubic,
      onUpdate: options.onUpdate,
      onComplete: options.onComplete,
      active: true,
    };

    this.tweens.push(item);
  }

  killTweensOf(target: object): void {
    // Mark inactive; compact during update to avoid O(n) splices each kill.
    for (let i = 0; i < this.tweens.length; i++) {
      const t = this.tweens[i];
      if (t.active && t.target === target) t.active = false;
    }
  }

  update(dt: number): void {
    const list = this.tweens;

    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (!t.active) continue;

      if (t.delay > 0) {
        t.delay -= dt;
        continue;
      }

      t.elapsed += dt;
      const p = Math.min(1, t.elapsed / t.duration);
      const e = t.ease(p);

      const target = t.target;
      const from = t.from;
      const to = t.to;
      for (const k in to) {
        (target as any)[k] = from[k]! + (to[k]! - from[k]!) * e;
      }

      t.onUpdate?.();

      if (p >= 1) {
        // Snap exactly to the final values to avoid float drift.
        // This matters for integer-like tweens (e.g. reel spinPos steps).
        for (const k in to) {
          (target as any)[k] = to[k]!;
        }
        t.active = false;
        t.onComplete?.();
      }
    }

    // Compact occasionally (cheap linear pass, avoids churn).
    // Heuristic: if there are many inactive items, rebuild.
    let dead = 0;
    for (let i = 0; i < list.length; i++) if (!list[i]!.active) dead++;
    if (dead > 0 && dead >= Math.max(8, (list.length * 0.35) | 0)) {
      let w = 0;
      for (let r = 0; r < list.length; r++) {
        const t = list[r]!;
        if (t.active) list[w++] = t;
      }
      list.length = w;
    }
  }
}

