import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { TweenManager } from '../core/tween/TweenManager';
import { Easings } from '../core/tween/Easings';
import { SpriteUiButton } from './SpriteUiButton';
import type { UiButtonTextures } from '../assets/UiButtonTextures';

export interface HudOptions {
  tweens: TweenManager;
  width?: number;
  uiButtons: UiButtonTextures;
  barTexture?: Texture;
}

export class Hud extends Container {
  private readonly tweens: TweenManager;
  private readonly bar: Sprite | null;

  private readonly shadow: Graphics;
  private readonly bg: Graphics;
  private readonly innerGlow: Graphics;
  private readonly sectionTints: Graphics[] = [];
  private readonly dividers: Graphics;

  private readonly balanceLabel: Text;
  private readonly balanceValue: Text;
  private readonly balanceAdd: SpriteUiButton;

  private readonly betLabel: Text;
  private readonly betValue: Text;
  private readonly betMinus: SpriteUiButton;
  private readonly betPlus: SpriteUiButton;

  private readonly winLabel: Text;
  private readonly winValue: Text;

  private readonly freeSpinsLabel: Text;
  private readonly freeSpinsValue: Text;

  private readonly spinsLabel: Text;
  private readonly spinsValue: Text;

  private readonly lastSpinText: Text;

  private readonly spinBtn: SpriteUiButton;

  private panelW: number;
  private panelH = 112;
  private readonly padX = 28;
  private readonly sectionPad = 18;
  private readonly spinW = 260;
  private readonly spinH = 78;
  private readonly spinGap = 22;

  // bar.PNG original size (measured)
  private readonly barSrcW = 1518;
  private readonly barSrcH = 364;

  private balance = -1;
  private bet = -1;
  private win = -1;
  private freeSpins = -1;
  private spins = -1;
  private lastSpin = '';

  onBetMinus: (() => void) | null = null;
  onBetPlus: (() => void) | null = null;
  onBalanceAdd: (() => void) | null = null;
  onSpin: (() => void) | null = null;

  constructor(opts: HudOptions) {
    super();
    this.tweens = opts.tweens;

    this.bar = opts.barTexture ? new Sprite(opts.barTexture) : null;
    if (this.bar) {
      (this.bar as any).eventMode = 'none';
      this.bar.anchor.set(0, 0);
      this.addChild(this.bar);
    }

    this.shadow = new Graphics();
    this.bg = new Graphics();
    this.innerGlow = new Graphics();
    this.panelW = Math.max(640, Math.floor(opts.width ?? 1220));

    // If we use the bar image, size it immediately to match panelW.
    if (this.bar) {
      const texW = this.bar.texture.width || 1;
      const texH = this.bar.texture.height || 1;
      const scale = this.panelW / texW;
      this.panelH = Math.round(texH * scale);
      this.bar.width = this.panelW;
      this.bar.height = this.panelH;
    }
    for (let i = 0; i < 4; i++) this.sectionTints.push(new Graphics());
    this.dividers = new Graphics();

    // Background visuals should sit behind everything and must not steal pointer events.
    (this.shadow as any).eventMode = 'none';
    (this.bg as any).eventMode = 'none';
    (this.innerGlow as any).eventMode = 'none';
    // If bar texture is provided, hide procedural background.
    if (this.bar) {
      this.shadow.visible = false;
      this.bg.visible = false;
      this.innerGlow.visible = false;
    } else {
      this.addChild(this.shadow, this.bg);
    }

    for (let i = 0; i < this.sectionTints.length; i++) {
      (this.sectionTints[i]! as any).eventMode = 'none';
      if (!this.bar) this.addChild(this.sectionTints[i]!);
    }
    (this.dividers as any).eventMode = 'none';
    if (!this.bar) this.addChild(this.dividers, this.innerGlow);

    const labelStyle = {
      fontFamily: 'system-ui, Segoe UI, Arial',
      fontSize: 13,
      fontWeight: '800',
      fill: 0xbfefff,
      letterSpacing: 0.5,
    } as const;

    const valueStyle = {
      fontFamily: 'system-ui, Segoe UI, Arial',
      fontSize: 32,
      fontWeight: '900',
      fill: 0xffffff,
    } as const;

    this.balanceLabel = new Text({ text: 'BALANCE', style: labelStyle });
    this.balanceValue = new Text({ text: '0', style: valueStyle });

    this.betLabel = new Text({ text: 'BET', style: labelStyle });
    this.betValue = new Text({ text: '0', style: valueStyle });

    this.winLabel = new Text({ text: 'WIN', style: labelStyle });
    this.winValue = new Text({
      text: '0',
      style: {
        ...valueStyle,
        fill: 0xffc857,
      },
    });

    this.freeSpinsLabel = new Text({ text: 'FREE SPINS', style: labelStyle });
    this.freeSpinsValue = new Text({ text: '0', style: valueStyle });

    this.spinsLabel = new Text({ text: 'SPINS', style: labelStyle });
    this.spinsValue = new Text({ text: '0', style: valueStyle });

    this.balanceLabel.alpha = this.bar ? 0 : 0.85;
    this.betLabel.alpha = this.bar ? 0 : 0.85;
    this.winLabel.alpha = this.bar ? 0 : 0.85;
    this.spinsLabel.alpha = this.bar ? 0 : 0.85;
    this.freeSpinsLabel.alpha = this.bar ? 0 : 0.85;

    this.lastSpinText = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, Segoe UI, Arial',
        fontSize: 12,
        fontWeight: '700',
        fill: 0xe9f0ff,
      },
    });
    this.lastSpinText.alpha = 0.55;

    // Text should never capture pointer events (keeps button hover stable).
    (this.balanceLabel as any).eventMode = 'none';
    (this.balanceValue as any).eventMode = 'none';
    (this.betLabel as any).eventMode = 'none';
    (this.betValue as any).eventMode = 'none';
    (this.winLabel as any).eventMode = 'none';
    (this.winValue as any).eventMode = 'none';
    (this.freeSpinsLabel as any).eventMode = 'none';
    (this.freeSpinsValue as any).eventMode = 'none';
    (this.spinsLabel as any).eventMode = 'none';
    (this.spinsValue as any).eventMode = 'none';
    (this.lastSpinText as any).eventMode = 'none';

    const btnTextStyle = {
      fontFamily: 'system-ui, Segoe UI, Arial',
      fontSize: 20,
      fontWeight: '900',
      fill: 0xffffff,
    } as const;

    this.balanceAdd = new SpriteUiButton({
      label: '',
      textures: opts.uiButtons.plus,
      textStyle: { ...btnTextStyle, fontSize: 18 },
      width: 32,
      height: 28,
      hoverScale: 1.03,
      pressScale: 0.93,
    });

    this.betMinus = new SpriteUiButton({
      label: '',
      textures: opts.uiButtons.minus,
      textStyle: btnTextStyle,
      width: 36,
      height: 32,
    });
    this.betPlus = new SpriteUiButton({
      label: '',
      textures: opts.uiButtons.plus,
      textStyle: btnTextStyle,
      width: 36,
      height: 32,
    });

    this.spinBtn = new SpriteUiButton({
      label: '',
      textures: opts.uiButtons.spin,
      textStyle: {
        fontFamily: 'system-ui, Segoe UI, Arial',
        fontSize: 30,
        fontWeight: '900',
        fill: 0x0b0f1a,
        letterSpacing: 0.5,
      },
      width: this.spinW,
      height: this.spinH,
      hoverScale: 1.03,
      pressScale: 0.96,
    });
    // When using the bar artwork, the SPIN text is baked into the PNG.
    // Hide the Text layer to avoid black overlay text.
    if (this.bar) this.spinBtn.textView.visible = false;

    this.balanceAdd.onClick = () => this.onBalanceAdd?.();
    this.betMinus.onClick = () => this.onBetMinus?.();
    this.betPlus.onClick = () => this.onBetPlus?.();
    this.spinBtn.onClick = () => this.onSpin?.();

    this.addChild(
      this.balanceLabel,
      this.balanceValue,
      this.balanceAdd.view!,
      this.betLabel,
      this.betValue,
      this.betMinus.view!,
      this.betPlus.view!,
      this.winLabel,
      this.winValue,
      this.freeSpinsLabel,
      this.freeSpinsValue,
      this.spinsLabel,
      this.spinsValue,
      this.lastSpinText,
      this.spinBtn.view!,
    );

    this.layout();
    if (!this.bar) this.redrawBg();
  }

  setSize(width: number): void {
    const next = Math.max(640, Math.floor(width));
    if (next === this.panelW) return;
    this.panelW = next;
    if (this.bar) {
      // Keep bar aspect ratio.
      const texW = this.bar.texture.width || 1;
      const texH = this.bar.texture.height || 1;
      const scale = this.panelW / texW;
      this.panelH = Math.round(texH * scale);
      this.bar.width = this.panelW;
      this.bar.height = this.panelH;
    }
    this.layout();
    if (!this.bar) this.redrawBg();
  }

  getWidth(): number {
    return this.panelW;
  }

  getHeight(): number {
    return this.panelH;
  }

  setInteractionEnabled(v: boolean): void {
    this.betMinus.setEnabled(v);
    this.betPlus.setEnabled(v);
  }

  setControlsVisible(v: boolean): void {
    this.spinBtn.view!.visible = v;
    this.betMinus.view!.visible = v;
    this.betPlus.view!.visible = v;
    this.balanceAdd.view!.visible = v;
  }

  setSpinEnabled(v: boolean): void {
    this.spinBtn.setEnabled(v);
  }

  setSpinLabel(text: string): void {
    // If we use the bar art, the label is part of the texture.
    if (this.bar) return;
    this.spinBtn.setLabel(text);
  }

  setBalance(v: number): void {
    if (v === this.balance) return;
    this.balance = v;
    this.balanceValue.text = String(v);
  }

  setBet(v: number): void {
    if (v === this.bet) return;
    this.bet = v;
    this.betValue.text = String(v);
  }

  setWin(v: number): void {
    if (v === this.win) return;
    this.win = v;
    this.winValue.text = String(v);
  }

  setFreeSpins(v: number): void {
    if (v === this.freeSpins) return;
    this.freeSpins = v;
    this.freeSpinsValue.text = String(v);
    const show = v > 0;
    this.freeSpinsLabel.visible = show;
    this.freeSpinsValue.visible = show;
    this.layout();
    this.redrawBg();
  }

  setSpins(v: number): void {
    if (v === this.spins) return;
    this.spins = v;
    this.spinsValue.text = String(v);
  }

  setLastSpinText(text: string): void {
    if (text === this.lastSpin) return;
    this.lastSpin = text;
    this.lastSpinText.text = text;
  }

  /**
   * Animates the WIN value to target, returning a Promise when finished.
   * Designed to be awaited in the game flow.
   */
  animateWin(from: number, to: number, duration = 0.95): Promise<void> {
    if (to === from) {
      this.setWin(to);
      return Promise.resolve();
    }

    const counter = { v: from };
    this.setWin(from);

    return new Promise((resolve) => {
      this.tweens.killTweensOf(counter);
      this.tweens.to(counter, { v: to }, duration, {
        ease: Easings.outCubic,
        onUpdate: () => this.setWin(Math.round(counter.v)),
        onComplete: () => {
          this.setWin(to);
          resolve();
        },
      });
    });
  }

  private layout(): void {
    const panelW = this.panelW;

    if (this.bar) {
      const s = panelW / this.barSrcW;
      // Micro-tuning for this specific bar.png alignment.
      // User feedback: shift right a bit and make elements slightly smaller.
      const dx = 14; // source pixels (bar space)
      const btnK = 0.92;
      const valK = 0.92;

      // Source-space rects (x,y,w,h) for bar.PNG.
      const rBalance = { x: 130, y: 140, w: 360, h: 92 };
      const rBet = { x: 460, y: 140, w: 170, h: 92 };
      const rWin = { x: 660, y: 140, w: 280, h: 92 };
      const rSpins = { x: 906, y: 140, w: 330, h: 92 };

      const rMinus = { x: 830, y: 246, w: 82, h: 70 };
      const rPlus = { x: 933, y: 248, w: 82, h: 70 };
      const rSpin = { x: 1080, y: 250, w: 220, h: 80 };
      const rAddCredits = { x: 160, y: 60, w: 70, h: 60 };

      const rMsg = { x: 300, y: 250, w: 820, h: 80 };

      const midY = (r: { x: number; y: number; w: number; h: number }) => (r.y + r.h * 0.5) * s;

      // Values inside their boxes
      const setValue = (t: Text, r: { x: number; y: number; w: number; h: number }, pad = 18) => {
        // anchor is supported in Pixi v8 Text, but guard just in case.
        (t as any).anchor?.set?.(0, 0.5);
        t.x = (r.x + dx + pad) * s;
        t.y = midY(r);
        t.scale.set(valK);
      };
      setValue(this.balanceValue, rBalance, 20);
      setValue(this.betValue, rBet, 16);
      setValue(this.winValue, rWin, 16);
      setValue(this.spinsValue, rSpins, 16);

      // Free spins can reuse WIN box (smaller, right aligned) when visible.
      (this.freeSpinsValue as any).anchor?.set?.(1, 0.5);
      this.freeSpinsValue.x = (rSpins.x + dx + rSpins.w - 18) * s;
      this.freeSpinsValue.y = midY(rSpins);
      this.freeSpinsValue.scale.set(valK);
      this.freeSpinsLabel.visible = false;

      // Hide labels (art has them baked)
      this.balanceLabel.visible = false;
      this.betLabel.visible = false;
      this.winLabel.visible = false;
      this.spinsLabel.visible = false;

      // Buttons positioned over their frames
      this.betMinus.view!.x = (rMinus.x + dx + rMinus.w * 0.5) * s;
      this.betMinus.view!.y = (rMinus.y + rMinus.h * 0.5) * s;
      this.betMinus.resize(rMinus.w * s * btnK, rMinus.h * s * btnK);

      this.betPlus.view!.x = (rPlus.x + dx + rPlus.w * 0.5) * s;
      this.betPlus.view!.y = (rPlus.y + rPlus.h * 0.5) * s;
      this.betPlus.resize(rPlus.w * s * btnK, rPlus.h * s * btnK);

      this.spinBtn.view!.x = (rSpin.x + dx + rSpin.w * 0.5) * s;
      this.spinBtn.view!.y = (rSpin.y + rSpin.h * 0.5) * s;
      this.spinBtn.resize(rSpin.w * s * btnK, rSpin.h * s * btnK);

      this.balanceAdd.view!.x = (rAddCredits.x + dx + rAddCredits.w * 0.5) * s;
      this.balanceAdd.view!.y = (rAddCredits.y + rAddCredits.h * 0.5) * s;
      this.balanceAdd.resize(rAddCredits.w * s * btnK, rAddCredits.h * s * btnK);

      // Message text inside the long bottom strip
      (this.lastSpinText as any).anchor?.set?.(0, 0.5);
      this.lastSpinText.x = (rMsg.x + dx + 12) * s;
      this.lastSpinText.y = (rMsg.y + rMsg.h * 0.5) * s;
      this.lastSpinText.alpha = 0.70;
      this.lastSpinText.scale.set(1);

      // Ensure layout doesn't use the old section math.
      return;
    }

    const leftW = panelW - this.padX * 2 - this.spinW - this.spinGap;
    const sectionW = leftW / 4;
    const yLabel = this.bar ? 68 : 14;
    const yValue = this.bar ? 128 : 34;

    const s0 = this.padX + sectionW * 0;
    const s1 = this.padX + sectionW * 1;
    const s2 = this.padX + sectionW * 2;
    const s3 = this.padX + sectionW * 3;

    // Section 1: Balance
    this.balanceLabel.x = s0 + this.sectionPad;
    this.balanceLabel.y = yLabel;
    this.balanceValue.x = s0 + this.sectionPad;
    this.balanceValue.y = yValue;
    this.balanceAdd.view!.x = s0 + sectionW - this.sectionPad - 16;
    this.balanceAdd.view!.y = yValue + 12;

    // Section 2: Bet
    this.betLabel.x = s1 + this.sectionPad;
    this.betLabel.y = yLabel;
    this.betValue.x = s1 + this.sectionPad;
    this.betValue.y = yValue;
    this.betMinus.view!.x = s1 + sectionW - this.sectionPad - 56;
    this.betMinus.view!.y = yValue + 14;
    this.betPlus.view!.x = s1 + sectionW - this.sectionPad - 16;
    this.betPlus.view!.y = yValue + 14;

    // Section 3: Win
    this.winLabel.x = s2 + this.sectionPad;
    this.winLabel.y = yLabel;
    this.winValue.x = s2 + this.sectionPad;
    this.winValue.y = yValue;

    // Section 4: Spins (+ optional Free Spins small)
    this.spinsLabel.x = s3 + this.sectionPad;
    this.spinsLabel.y = yLabel;
    this.spinsValue.x = s3 + this.sectionPad;
    this.spinsValue.y = yValue;

    // Free spins as a compact right-side block when visible.
    const freeX = s3 + sectionW * 0.58;
    this.freeSpinsLabel.x = freeX;
    this.freeSpinsLabel.y = yLabel;
    this.freeSpinsValue.x = freeX;
    this.freeSpinsValue.y = yValue;

    this.lastSpinText.x = this.padX;
    this.lastSpinText.y = this.bar ? this.panelH - 44 : this.panelH - 22;

    // Spin button on the right side (inside HUD).
    const spinX = this.padX + leftW + this.spinGap + this.spinW * 0.5;
    this.spinBtn.view!.x = this.bar ? (panelW * 0.84) : spinX;
    this.spinBtn.view!.y = this.bar ? Math.floor(this.panelH * 0.64) : Math.floor(this.panelH * 0.5);

    // If using bar image, override plus/minus positions to match artwork roughly.
    if (this.bar) {
      const pmY = Math.floor(this.panelH * 0.64);
      this.betMinus.view!.x = panelW * 0.64;
      this.betPlus.view!.x = panelW * 0.70;
      this.betMinus.view!.y = pmY;
      this.betPlus.view!.y = pmY;
      this.balanceAdd.view!.x = panelW * 0.18;
      this.balanceAdd.view!.y = Math.floor(this.panelH * 0.36);
    }
  }

  private redrawBg(): void {
    const w = this.panelW;
    const h = this.panelH;
    const r = 26;

    // Shadow (painted, no filters)
    this.shadow
      .clear()
      .roundRect(0, 6, w, h, r)
      .fill({ color: 0x000000, alpha: 0.34 });

    // Base panel (calmer, "premium slot" palette)
    this.bg
      .clear()
      .roundRect(0, 0, w, h, r)
      .fill({ color: 0x0b1024, alpha: 1 });
    this.bg
      .roundRect(0, 0, w, h * 0.58, r)
      .fill({ color: 0x121a38, alpha: 1 });

    // Top accent line (thin, not "cyan bar")
    this.bg.rect(18, 10, w - 36, 2).fill({ color: 0x7cf7ff, alpha: 0.12 });

    // Outer border + soft glow
    this.bg.stroke({ color: 0x7cf7ff, width: 6, alpha: 0.08 });
    this.bg.stroke({ color: 0x9adfff, width: 2.2, alpha: 0.22 });

    // Section tint blocks + dividers
    const leftW = w - this.padX * 2 - this.spinW - this.spinGap;
    const sectionW = leftW / 4;
    const tintA = 0x1b2a62;
    const tintB = 0x3a1b5f;
    for (let i = 0; i < this.sectionTints.length; i++) {
      const x = this.padX + i * sectionW;
      this.sectionTints[i]!
        .clear()
        .roundRect(x, 8, sectionW, 66, 18)
        .fill({ color: i % 2 === 0 ? tintA : tintB, alpha: 0.045 });
    }

    this.dividers.clear();
    for (let i = 1; i <= 3; i++) {
      const x = this.padX + i * sectionW;
      this.dividers
        .moveTo(x, 12)
        .lineTo(x, h - 16)
        .stroke({ width: 1.5, color: 0xffffff, alpha: 0.08, cap: 'round' });
    }
    // Divider between stats area and SPIN area.
    const xSpin = this.padX + leftW + this.spinGap * 0.5;
    this.dividers
      .moveTo(xSpin, 12)
      .lineTo(xSpin, h - 16)
      .stroke({ width: 1.5, color: 0xffffff, alpha: 0.10, cap: 'round' });

    this.innerGlow
      .clear()
      .roundRect(2, 2, w - 4, h - 4, r - 2)
      .stroke({ color: 0xffffff, width: 2, alpha: 0.08 });
  }
}

