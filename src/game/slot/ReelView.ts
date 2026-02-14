import { Container, type Texture } from 'pixi.js';
import type { TweenManager } from '../../core/tween/TweenManager';
import { Easings } from '../../core/tween/Easings';
import type { SymbolId } from './SymbolIds';
import { randomSymbol } from './SymbolIds';
import { SymbolView } from './SymbolView';

export interface ReelViewOptions {
  index: number;
  rows: number;
  buffer: number;
  symbolSize: number;
  symbolGap: number;
  textures: Record<SymbolId, Texture>;
  tweens: TweenManager;
  rng: () => number;
}

/**
 * Reel with a fixed pool of SymbolViews.
 * Uses a "position" scalar that is tweened; update consumes integer steps from a queue.
 */
export class ReelView extends Container {
  readonly index: number;

  private readonly rows: number;
  private readonly buffer: number;
  private readonly stepHeight: number;
  private readonly tweens: TweenManager;
  private readonly rng: () => number;

  private readonly symbols: SymbolView[];
  private topIndex = 0;

  private readonly queue: SymbolId[] = [];
  private queueRead = 0;

  spinPos = 0;
  private prevSpinPos = 0;
  kick = 0;

  constructor(opts: ReelViewOptions) {
    super();
    this.index = opts.index;
    this.rows = opts.rows;
    this.buffer = opts.buffer;
    this.stepHeight = opts.symbolSize + opts.symbolGap;
    this.tweens = opts.tweens;
    this.rng = opts.rng;

    const total = this.rows + this.buffer * 2;
    this.symbols = new Array(total);

    for (let i = 0; i < total; i++) {
      const s = new SymbolView({
        size: opts.symbolSize,
        textures: opts.textures,
        tweens: opts.tweens,
      });
      s.x = 0;
      s.y = (i - this.buffer) * this.stepHeight;
      s.setId(randomSymbol(this.rng));
      this.symbols[i] = s;
      this.addChild(s);
    }

    this.pivot.set(0, 0);
  }

  /** Visible grid row (0..rows-1) mapped to SymbolView instance. */
  getVisibleSymbol(row: number): SymbolView {
    const idx = this.buffer + row;
    return this.symbols[(this.topIndex + idx) % this.symbols.length]!;
  }

  getVisibleColumn(): SymbolId[] {
    const col: SymbolId[] = new Array(this.rows);
    for (let r = 0; r < this.rows; r++) col[r] = this.getVisibleSymbol(r).id;
    return col;
  }

  /**
   * Applies the final stopped column directly to the visible cells (top->bottom).
   * This guarantees that what we evaluate (grid[col][row]) matches what is rendered,
   * independent of strip buffer offsets.
   */
  applyFinalColumn(finalColumn: SymbolId[], debugTag?: string): void {
    for (let r = 0; r < this.rows; r++) {
      const s = this.getVisibleSymbol(r);
      const id = finalColumn[r]!;
      if (debugTag) s.setIdDebug(id, this.index, r, debugTag);
      else s.setId(id);
    }
  }

  prepareSpin(finalColumn: SymbolId[], randomSteps: number): void {
    this.queue.length = 0;
    this.queueRead = 0;

    // Random steps first.
    for (let i = 0; i < randomSteps; i++) this.queue.push(randomSymbol(this.rng));
    // Then final landing symbols (top -> bottom).
    // IMPORTANT: because we have a visual buffer above/below the visible window,
    // we must push extra trailing symbols so that when the spin stops,
    // the visible rows match finalColumn exactly (no post-stop "swap").
    for (let i = 0; i < finalColumn.length; i++) this.queue.push(finalColumn[i]!);
    for (let i = 0; i < this.buffer; i++) this.queue.push(randomSymbol(this.rng));
  }

  spin(duration: number, onComplete: () => void): void {
    const steps = this.queue.length - this.queueRead;
    if (steps <= 0) {
      onComplete();
      return;
    }

    // Kill any previous spin.
    this.tweens.killTweensOf(this);

    // Add a little "kick" at start for feel.
    this.kick = 0;
    this.tweens.to(this, { kick: 1 }, 0.12, { ease: Easings.outBack });
    this.tweens.to(this, { kick: 0 }, 0.18, { ease: Easings.outCubic, delay: 0.12 });

    const target = this.spinPos + steps;
    this.tweens.to(this, { spinPos: target }, duration, {
      ease: Easings.outQuint,
      // Critical: apply queued symbol ids during tween update,
      // so when tween completes (inside TweenManager.update) the visible sprites already match the final grid.
      onUpdate: () => this.syncStrip(),
      onComplete,
    });
  }

  update(dt: number): void {
    // Update symbol idle animations (small count; keep loop tight).
    for (let i = 0; i < this.symbols.length; i++) this.symbols[i]!.update(dt);

    this.scale.x = 1 + this.kick * 0.03;

    this.syncStrip();
  }

  clearFeedback(): void {
    for (let i = 0; i < this.symbols.length; i++) this.symbols[i]!.clearFeedback();
  }

  private shiftOne(): void {
    const total = this.symbols.length;

    // Logical shift: increment circular top index.
    this.topIndex = (this.topIndex + 1) % total;

    // Assign incoming symbol to the new "bottom" cell.
    const bottom = this.symbols[(this.topIndex + total - 1) % total]!;
    const nextId = this.queue[this.queueRead++];
    if (nextId) bottom.setId(nextId);
  }

  /**
   * Syncs the visual strip to current `spinPos`:
   * - consumes integer step crossings by applying queued symbol ids (setId → sprite.texture)
   * - updates y positions for smooth fractional offset
   *
   * Safe to call multiple times per frame; uses `prevSpinPos` to avoid double-shifting.
   */
  private syncStrip(): void {
    // Consume integer steps when crossing boundaries.
    const curr = this.spinPos;
    const prev = this.prevSpinPos;
    const crossed = (curr | 0) - (prev | 0);
    if (crossed > 0) {
      for (let n = 0; n < crossed; n++) this.shiftOne();
    }

    this.prevSpinPos = curr;

    // Smooth visual offset based on fractional position.
    const frac = curr - (curr | 0);
    const offsetY = -frac * this.stepHeight;

    const total = this.symbols.length;
    for (let i = 0; i < total; i++) {
      const s = this.symbols[(this.topIndex + i) % total]!;
      s.y = (i - this.buffer) * this.stepHeight + offsetY;
    }
  }
}

