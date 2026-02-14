import { Container, Graphics, Text } from 'pixi.js';
import type { TweenManager } from '../core/tween/TweenManager';
import { Easings } from '../core/tween/Easings';
import type { WinLine } from './evaluators';
import type { SlotMachineView } from './slot/SlotMachineView';
import type { Hud } from '../ui/Hud';

export interface WinPresenterOptions {
  machine: SlotMachineView;
  hud: Hud;
  tweens: TweenManager;
  effects: Container; // overlay in cabinet coordinates
  ui: Container; // for popups
}

export class WinPresenter {
  private readonly machine: SlotMachineView;
  private readonly hud: Hud;
  private readonly tweens: TweenManager;
  private readonly effects: Container;
  private readonly ui: Container;

  private readonly linePool: Graphics[] = [];
  private readonly bigWin: Container;
  private readonly bigWinBg: Graphics;
  private readonly bigWinText: Text;

  private readonly temp: { a: number } = { a: 0 }; // tweened alpha/scalars

  constructor(opts: WinPresenterOptions) {
    this.machine = opts.machine;
    this.hud = opts.hud;
    this.tweens = opts.tweens;
    this.effects = opts.effects;
    this.ui = opts.ui;

    // Reusable "big win" popup.
    this.bigWin = new Container();
    this.bigWin.visible = false;
    this.bigWinBg = new Graphics();
    this.bigWinText = new Text({
      text: 'BIG WIN',
      style: {
        fontFamily: 'system-ui, Segoe UI, Arial',
        fontSize: 62,
        fontWeight: '900',
        fill: 0xffffff,
        dropShadow: {
          color: 0x0b0f1a,
          alpha: 0.65,
          blur: 8,
          distance: 0,
        },
      },
    });
    this.bigWinText.anchor.set(0.5);

    this.bigWin.addChild(this.bigWinBg, this.bigWinText);
    this.ui.addChild(this.bigWin);
  }

  clear(): void {
    for (let i = 0; i < this.linePool.length; i++) this.linePool[i]!.visible = false;
    this.bigWin.visible = false;
  }

  async present(params: {
    winLines: WinLine[];
    totalWin: number;
    bet: number;
    bigWinThresholdXBet?: number;
    extraHighlights?: { reel: number; row: number }[];
  }): Promise<void> {
    this.clear();

    const { winLines, totalWin, bet } = params;
    if (totalWin <= 0) return;

    // 1) Highlight symbols (lightweight: existing SymbolView punch/glow).
    for (let i = 0; i < winLines.length; i++) {
      const line = winLines[i]!;
      for (let p = 0; p < line.positions.length; p++) {
        const pos = line.positions[p]!;
        this.machine.getSymbol(pos.reel, pos.row).playWin();
      }
    }
    if (params.extraHighlights) {
      const list = params.extraHighlights;
      for (let i = 0; i < list.length; i++) {
        const pos = list[i]!;
        this.machine.getSymbol(pos.reel, pos.row).playWin();
      }
    }

    // 2) Draw line overlays (pool to avoid allocations).
    for (let i = 0; i < winLines.length; i++) {
      const g = this.getLineGfx(i);
      g.visible = true;
      g.alpha = 0;
      g.blendMode = 'add';
      g.clear();

      const line = winLines[i]!;
      const points: { x: number; y: number }[] = [];
      for (let r = line.fromReel; r <= line.toReel; r++) {
        points.push(this.machine.getSymbolCenter(r, line.pathRows[r]!));
      }

      // Double stroke = "glow + core" without filters.
      if (points.length >= 2) {
        g.moveTo(points[0]!.x, points[0]!.y);
        for (let p = 1; p < points.length; p++) g.lineTo(points[p]!.x, points[p]!.y);
        g.stroke({ width: 14, color: 0xffe7a3, alpha: 0.22, cap: 'round' });

        g.moveTo(points[0]!.x, points[0]!.y);
        for (let p = 1; p < points.length; p++) g.lineTo(points[p]!.x, points[p]!.y);
        g.stroke({ width: 6, color: 0xffffff, alpha: 0.85, cap: 'round' });
      }

      // Animate in/out.
      this.tweens.to(g, { alpha: 1 }, 0.14, { ease: Easings.outCubic, delay: i * 0.06 });
      this.tweens.to(g, { alpha: 0 }, 0.28, {
        ease: Easings.outCubic,
        delay: 0.55 + i * 0.06,
        onComplete: () => (g.visible = false),
      });
    }

    // 3) Win counter animation.
    const winPromise = this.hud.animateWin(0, totalWin, 1.05);

    // 4) Optional Big Win.
    const bigWinThreshold = bet * (params.bigWinThresholdXBet ?? 10);
    const bigWinPromise = totalWin >= bigWinThreshold ? this.showBigWin(totalWin) : Promise.resolve();

    await Promise.all([winPromise, bigWinPromise]);
  }

  private getLineGfx(index: number): Graphics {
    while (this.linePool.length <= index) {
      const g = new Graphics();
      g.visible = false;
      this.effects.addChild(g);
      this.linePool.push(g);
    }
    return this.linePool[index]!;
  }

  private showBigWin(amount: number): Promise<void> {
    this.bigWin.visible = true;
    this.bigWin.x = 640;
    this.bigWin.y = 230;
    this.bigWin.alpha = 0;
    this.bigWin.scale.set(0.86);

    const w = 640;
    const h = 190;
    this.bigWinBg
      .clear()
      .roundRect(-w / 2, -h / 2, w, h, 42)
      .fill({ color: 0xffffff, alpha: 0.14 })
      .stroke({ color: 0xffc857, width: 3, alpha: 0.65 });

    this.bigWinText.text = `BIG WIN\n+${amount}`;
    this.bigWinText.style.align = 'center';

    return new Promise((resolve) => {
      this.tweens.killTweensOf(this.bigWin);
      this.tweens.to(this.bigWin, { alpha: 1 }, 0.12, { ease: Easings.outCubic });
      this.tweens.to(this.bigWin.scale, { x: 1, y: 1 }, 0.28, { ease: Easings.outBack });
      this.tweens.to(this.bigWin, { alpha: 0 }, 0.22, {
        ease: Easings.outCubic,
        delay: 0.95,
        onComplete: () => {
          this.bigWin.visible = false;
          resolve();
        },
      });
    });
  }
}

