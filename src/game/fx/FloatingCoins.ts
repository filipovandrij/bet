import { Container, Sprite, Texture } from 'pixi.js';

export interface FloatingCoinsOptions {
  texture: Texture;
  count: number;
  // Bounds in local space.
  x: number;
  y: number;
  width: number;
  height: number;
  alphaMin?: number;
  alphaMax?: number;
  scaleMin?: number;
  scaleMax?: number;
  rng: () => number;
}

type Coin = {
  s: Sprite;
  x0: number;
  y0: number;
  a: number;
  spd: number;
  amp: number;
  rot: number;
  rotSpd: number;
  par: number;
  alpha: number;
  scale: number;
};

/**
 * Low-contrast decorative coin field:
 * - single texture (batching-friendly)
 * - no filters
 * - no allocations in update
 */
export class FloatingCoins extends Container {
  private readonly coins: Coin[];
  private t = 0;

  constructor(opts: FloatingCoinsOptions) {
    super();

    const alphaMin = opts.alphaMin ?? 0.06;
    const alphaMax = opts.alphaMax ?? 0.14;
    const scaleMin = opts.scaleMin ?? 0.18;
    const scaleMax = opts.scaleMax ?? 0.34;

    this.coins = new Array(opts.count);

    for (let i = 0; i < opts.count; i++) {
      const s = new Sprite(opts.texture);
      s.anchor.set(0.5);
      s.blendMode = 'add';

      const x0 = opts.x + opts.rng() * opts.width;
      const y0 = opts.y + opts.rng() * opts.height;
      const alpha = alphaMin + (alphaMax - alphaMin) * opts.rng();
      const scale = scaleMin + (scaleMax - scaleMin) * opts.rng();

      const coin: Coin = {
        s,
        x0,
        y0,
        a: opts.rng() * Math.PI * 2,
        spd: 0.35 + opts.rng() * 0.65,
        amp: 8 + opts.rng() * 18,
        rot: opts.rng() * Math.PI * 2,
        rotSpd: (opts.rng() * 2 - 1) * 0.25,
        par: 0.6 + opts.rng() * 0.8,
        alpha,
        scale,
      };

      s.x = x0;
      s.y = y0;
      s.alpha = alpha;
      s.scale.set(scale);
      s.rotation = coin.rot;

      this.addChild(s);
      this.coins[i] = coin;
    }
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t;

    for (let i = 0; i < this.coins.length; i++) {
      const c = this.coins[i]!;
      const s = c.s;
      const ph = c.a + t * c.spd;

      // gentle floating + parallax drift
      s.x = c.x0 + Math.sin(ph * 0.9) * c.amp * 0.7;
      s.y = c.y0 + Math.cos(ph) * c.amp;
      c.rot += c.rotSpd * dt;
      s.rotation = c.rot;

      // subtle shimmer
      s.alpha = c.alpha * (0.85 + (Math.sin(ph * 1.6) * 0.5 + 0.5) * 0.3);
    }
  }
}

