import { Container, Graphics, Text } from 'pixi.js';
import type { SlotMachineView } from './SlotMachineView';

export interface HoldOverlayOptions {
  machine: SlotMachineView;
}

/**
 * Shows which reels are HELD for the next spin.
 * Lightweight (no filters), batching-friendly.
 */
export class HoldOverlay extends Container {
  private readonly machine: SlotMachineView;
  private readonly boxes: Graphics[] = [];
  private readonly labels: Text[] = [];
  private t = 0;

  constructor(opts: HoldOverlayOptions) {
    super();
    this.machine = opts.machine;
    this.visible = false;
    this.blendMode = 'add';
  }

  setHeld(held: boolean[]): void {
    const count = held.reduce((a, v) => a + (v ? 1 : 0), 0);
    this.visible = count > 0;

    const reels = held.length;
    while (this.boxes.length < reels) {
      const g = new Graphics();
      const txt = new Text({
        text: 'HOLD',
        style: {
          fontFamily: 'system-ui, Segoe UI, Arial',
          fontSize: 18,
          fontWeight: '900',
          fill: 0xffffff,
        },
      });
      txt.anchor.set(0.5);
      this.addChild(g, txt);
      this.boxes.push(g);
      this.labels.push(txt);
    }

    for (let r = 0; r < reels; r++) {
      const g = this.boxes[r]!;
      const txt = this.labels[r]!;

      if (!held[r]) {
        g.visible = false;
        txt.visible = false;
        continue;
      }

      g.visible = true;
      txt.visible = true;

      // Reel bounds based on top and bottom symbol centers.
      const top = this.machine.getSymbolCenter(r, 0);
      const bot = this.machine.getSymbolCenter(r, 2);
      const x = top.x;
      const y = (top.y + bot.y) * 0.5;

      const w = 156;
      const h = 3 * 158;

      g
        .clear()
        .roundRect(x - w / 2, y - h / 2, w, h, 20)
        .stroke({ width: 6, color: 0xfff3b0, alpha: 0.22 })
        .roundRect(x - w / 2, y - h / 2, w, h, 20)
        .stroke({ width: 2, color: 0xffffff, alpha: 0.55 });

      txt.x = x;
      txt.y = y - h / 2 - 14;
    }
  }

  update(dt: number): void {
    if (!this.visible) return;
    this.t += dt;
    const pulse = 0.5 + Math.sin(this.t * 3.8) * 0.5;
    const a = 0.08 + pulse * 0.08;
    this.alpha = a;
  }
}

