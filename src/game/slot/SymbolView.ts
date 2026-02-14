import { Container, Sprite, Texture } from 'pixi.js';
import type { TweenManager } from '../../core/tween/TweenManager';
import { Easings } from '../../core/tween/Easings';
import type { SymbolId } from './SymbolIds';

export interface SymbolViewOptions {
  size: number;
  textures: Record<SymbolId, Texture>;
  tweens: TweenManager;
}

/**
 * Reusable animated symbol component.
 * - idle: subtle float + breathing scale
 * - feedback: win punch + glow flash
 */
export class SymbolView extends Container {
  private readonly sprite: Sprite;
  private readonly tweens: TweenManager;
  private readonly size: number;
  private readonly textures: Record<SymbolId, Texture>;

  private _id: SymbolId = 'A';
  private idleT = 0;

  // Tweened (numbers only) to avoid per-frame allocations.
  private punch = 0; // 0..1
  private flash = 0; // 0..1

  constructor(opts: SymbolViewOptions) {
    super();
    this.size = opts.size;
    this.textures = opts.textures;
    this.tweens = opts.tweens;

    this.sprite = new Sprite(Texture.WHITE);
    this.sprite.anchor.set(0.5);
    this.sprite.width = this.size;
    this.sprite.height = this.size;

    // Use a single sprite per symbol (textures are shared globally).
    this.addChild(this.sprite);
    this.setId(this._id);
  }

  get id(): SymbolId {
    return this._id;
  }

  get textureKey(): string {
    return ((this.sprite.texture as any)?.__key as string) ?? '(unknown)';
  }

  setId(id: SymbolId): void {
    this._id = id;
    const tex = this.textures[id];
    this.sprite.texture = tex;
  }

  /**
   * Debug-only setter that logs at the exact moment texture is assigned.
   * Keeps the log close to the "single source of truth" for rendering.
   */
  setIdDebug(id: SymbolId, col: number, row: number, tag: string): void {
    this._id = id;
    const tex = this.textures[id];
    this.sprite.texture = tex;
    // eslint-disable-next-line no-console
    console.log(`[${tag}] applyTexture col=${col + 1} row=${row} id=${id} tex=${((tex as any)?.__key as string) ?? '(unknown)'}`);
  }

  update(dt: number): void {
    // Idle loop: subtle float + breathing scale, time-based.
    this.idleT += dt;
    const t = this.idleT;
    const breathe = 1 + Math.sin(t * 1.2) * 0.008;

    // Punch adds a short overshoot; combined in one write.
    const punchScale = 1 + this.punch * 0.14;
    this.scale.set(breathe * punchScale);

    // Win flash (kept light: alpha boost only, no filters).
    this.sprite.alpha = 1 - this.flash * 0.12;
  }

  playWin(): void {
    this.tweens.killTweensOf(this);
    this.punch = 0;
    this.flash = 0;

    // Flash quickly, then fade.
    this.tweens.to(this, { flash: 1 }, 0.10, { ease: Easings.outQuint });
    this.tweens.to(this, { flash: 0 }, 0.28, { ease: Easings.outCubic, delay: 0.12 });

    // Punch/bounce.
    this.tweens.to(this, { punch: 1 }, 0.14, { ease: Easings.outBack });
    this.tweens.to(this, { punch: 0 }, 0.22, { ease: Easings.outBounce, delay: 0.14 });
  }

  clearFeedback(): void {
    this.punch = 0;
    this.flash = 0;
    this.sprite.alpha = 1;
  }
}

