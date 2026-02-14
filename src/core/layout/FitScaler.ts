import type { Container } from 'pixi.js';

export type FitScaleMode = 'contain' | 'cover';

export interface FitScalerOptions {
  designWidth: number;
  designHeight: number;
  mode: FitScaleMode;
}

/**
 * Scales a root container to fit a design resolution into an arbitrary viewport.
 * Keeps the design coordinate system stable for scenes/UI.
 */
export class FitScaler {
  private readonly designWidth: number;
  private readonly designHeight: number;
  private readonly mode: FitScaleMode;

  constructor(opts: FitScalerOptions) {
    this.designWidth = opts.designWidth;
    this.designHeight = opts.designHeight;
    this.mode = opts.mode;
  }

  apply(root: Container, viewportWidth: number, viewportHeight: number): void {
    const dw = this.designWidth;
    const dh = this.designHeight;

    if (dw <= 0 || dh <= 0 || viewportWidth <= 0 || viewportHeight <= 0) return;

    const sx = viewportWidth / dw;
    const sy = viewportHeight / dh;
    const scale = this.mode === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);

    root.scale.set(scale);
    root.x = (viewportWidth - dw * scale) * 0.5;
    root.y = (viewportHeight - dh * scale) * 0.5;
  }
}

