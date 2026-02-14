import { Container, Graphics, type Texture } from 'pixi.js';
import type { TweenManager } from '../../core/tween/TweenManager';
import { SlotConfig } from './SlotConfig';
import type { SymbolId } from './SymbolIds';
import { ReelView } from './ReelView';
import type { SymbolView } from './SymbolView';

export interface SlotMachineViewOptions {
  textures: Record<SymbolId, Texture>;
  tweens: TweenManager;
  rng: () => number;
}

export class SlotMachineView extends Container {
  private readonly reels: ReelView[];
  private readonly maskGfx: Graphics;
  private readonly reelsContainer: Container;

  readonly windowWidth: number;
  readonly windowHeight: number;
  readonly windowRadius: number;
  private readonly stepX: number;
  private readonly stepY: number;

  constructor(opts: SlotMachineViewOptions) {
    super();

    const { count, rows, buffer, symbolSize, symbolGap } = SlotConfig.reels;

    const reelWidth = symbolSize;
    const reelHeight = rows * symbolSize + (rows - 1) * symbolGap;
    const totalWidth = count * reelWidth + (count - 1) * symbolGap;

    this.reels = new Array(count);

    this.reelsContainer = new Container();
    this.reelsContainer.x = -totalWidth / 2 + reelWidth / 2;
    this.reelsContainer.y = -reelHeight / 2 + symbolSize / 2;
    this.addChild(this.reelsContainer);

    this.windowWidth = totalWidth + 16;
    this.windowHeight = reelHeight + 16;
    this.windowRadius = 22;
    this.stepX = reelWidth + symbolGap;
    this.stepY = symbolSize + symbolGap;

    for (let i = 0; i < count; i++) {
      const reel = new ReelView({
        index: i,
        rows,
        buffer,
        symbolSize,
        symbolGap,
        textures: opts.textures,
        tweens: opts.tweens,
        rng: opts.rng,
      });
      reel.x = i * (reelWidth + symbolGap);
      reel.y = 0;
      this.reelsContainer.addChild(reel);
      this.reels[i] = reel;
    }

    // Mask to reel window (hard edge like slot cabinets).
    this.maskGfx = new Graphics()
      .roundRect(
        -totalWidth / 2 - 8,
        -reelHeight / 2 - 8,
        totalWidth + 16,
        reelHeight + 16,
        22,
      )
      .fill({ color: 0xffffff, alpha: 1 });
    this.reelsContainer.mask = this.maskGfx;
    this.addChild(this.maskGfx);
  }

  update(dt: number): void {
    for (let i = 0; i < this.reels.length; i++) this.reels[i]!.update(dt);
  }

  clearFeedback(): void {
    for (let i = 0; i < this.reels.length; i++) this.reels[i]!.clearFeedback();
  }

  spinTo(
    resultGrid: SymbolId[][],
    onAllComplete: () => void,
    options?: { freezeReels?: boolean[]; speedMul?: number; stepsMul?: number },
  ): void {
    const { baseSteps, stepStagger, baseDuration, durationStagger } = SlotConfig.reels;
    const freeze = options?.freezeReels;
    const speedMul = options?.speedMul ?? 1;
    const stepsMul = options?.stepsMul ?? 1;

    let remaining = this.reels.length;
    const done = () => {
      remaining--;
      if (remaining === 0) onAllComplete();
    };

    for (let i = 0; i < this.reels.length; i++) {
      const reel = this.reels[i]!;
      const finalCol = resultGrid[i]!;

      if (freeze?.[i]) {
        // Frozen reels do not spin; still call done so flow continues.
        done();
        continue;
      }

      reel.prepareSpin(finalCol, Math.max(0, Math.round((baseSteps + i * stepStagger) * stepsMul)));
      reel.spin((baseDuration + i * durationStagger) * speedMul, done);
    }
  }

  highlightLine(row: number, fromReel: number, toReel: number): void {
    for (let i = fromReel; i <= toReel; i++) {
      this.reels[i]!.getVisibleSymbol(row).playWin();
    }
  }

  getSymbol(reelIndex: number, row: number): SymbolView {
    return this.reels[reelIndex]!.getVisibleSymbol(row);
  }

  getColumn(reelIndex: number): SymbolId[] {
    return this.reels[reelIndex]!.getVisibleColumn();
  }

  /**
   * Debug helper to verify rendering matches the data grid.
   * Returns one record per visible cell.
   */
  debugDumpVisible(): Array<{ col: number; row: number; id: SymbolId; textureKey: string }> {
    const out: Array<{ col: number; row: number; id: SymbolId; textureKey: string }> = [];
    const rows = SlotConfig.reels.rows;
    for (let c = 0; c < this.reels.length; c++) {
      for (let r = 0; r < rows; r++) {
        const s = this.reels[c]!.getVisibleSymbol(r);
        out.push({ col: c, row: r, id: s.id, textureKey: s.textureKey });
      }
    }
    return out;
  }

  /**
   * Returns symbol center in SlotMachineView local coordinates.
   * This stays stable even while reels are spinning (presentation happens after stop).
   */
  getSymbolCenter(reelIndex: number, row: number): { x: number; y: number } {
    const x = this.reelsContainer.x + reelIndex * this.stepX;
    const y = this.reelsContainer.y + row * this.stepY;
    return { x, y };
  }
}

