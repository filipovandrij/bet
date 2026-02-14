import { Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { TweenManager } from '../../core/tween/TweenManager';
import { Easings } from '../../core/tween/Easings';
import { SlotConfig } from '../slot/SlotConfig';
import type { SlotMachineView } from '../slot/SlotMachineView';

export type ChainLockFxOptions = {
  machine: SlotMachineView;
  tweens: TweenManager;
};

function makePlaceholderChainTexture(): Texture {
  return Texture.WHITE;
}

type LockView = {
  root: Container;
  chain: Sprite;
  glow: Graphics;
};

export class ChainLockFx extends Container {
  private readonly machine: SlotMachineView;
  private readonly tweens: TweenManager;

  private chainTex: Texture | null = null;

  private readonly locks: LockView[] = [];

  constructor(opts: ChainLockFxOptions) {
    super();
    this.machine = opts.machine;
    this.tweens = opts.tweens;
    (this as any).eventMode = 'none';
  }

  /**
   * Tries to load real textures from `public/img/effects/`.
   * - chain: `/img/effects/chain.png`
   *
   * Safe to call multiple times.
   */
  async preloadPublicTextures(): Promise<void> {
    const results: { chain?: boolean } = {};

    // NOTE: files in /public are served from site root in Vite.
    const chainSrc = '/img/effects/chain.png';

    // Chain
    try {
      const chainAlias = 'fx:chain';
      if (!(Assets.cache as any)?.has?.(chainAlias)) Assets.add({ alias: chainAlias, src: chainSrc });
      await Assets.load(chainAlias);
      const t = Assets.get(chainAlias) as Texture | undefined;
      if (t) {
        (t as any).__key = chainAlias;
        this.chainTex = t;
        results.chain = true;
      }
    } catch {
      results.chain = false;
    }

    // Apply textures to any existing views.
    for (let i = 0; i < this.locks.length; i++) {
      const v = this.locks[i]!;
      if (this.chainTex) v.chain.texture = this.chainTex;
    }

    if (results.chain) {
      console.log('[ChainLockFx] public textures loaded:', {
        chain: results.chain ? chainSrc : '(missing)',
      });
    } else {
      console.log('[ChainLockFx] public textures not found, using placeholders');
    }
  }

  /**
   * Call once you have a renderer context that can generate textures.
   * If you later drop real textures into `public/img/effects/chain.png`,
   * you can swap this loader to use them.
   */
  initWithGeneratedTextures(generateTexture: (g: Graphics) => Texture): void {
    if (this.chainTex) return;

    // Chain texture
    const chainG = new Graphics();
    chainG.roundRect(0, 0, 64, 256, 10).fill({ color: 0x6e7b8d, alpha: 1 });
    for (let y = 18; y < 256; y += 42) {
      chainG.roundRect(10, y, 44, 16, 8).stroke({ color: 0xe7edf7, width: 3, alpha: 0.65 });
    }
    this.chainTex = generateTexture(chainG);
    chainG.destroy();

    console.log('[ChainLockFx] generated placeholder chain texture');
  }

  setHeld(held: boolean[] | undefined): void {
    const reels = SlotConfig.reels.count;
    const flags = held ?? new Array(reels).fill(false);
    for (let i = 0; i < reels; i++) {
      if (flags[i]) this.showLock(i + 1, { animate: false });
      else this.hideLock(i + 1);
    }
    this.updatePositions();
  }

  showLock(reelIndex1Based: number, opts?: { animate?: boolean }): void {
    const i = reelIndex1Based - 1;
    const v = this.ensureLockView(i);
    v.root.visible = true;
    this.updateOne(i);

    console.log('[ChainLockFx] lock ON:', reelIndex1Based);

    if (opts?.animate === false) return;
    this.playLockPop(v);
  }

  hideLock(reelIndex1Based: number): void {
    const i = reelIndex1Based - 1;
    const v = this.locks[i];
    if (!v) return;
    if (!v.root.visible) return;
    v.root.visible = false;
    console.log('[ChainLockFx] lock OFF:', reelIndex1Based);
  }

  updatePositions(): void {
    for (let i = 0; i < this.locks.length; i++) this.updateOne(i);
  }

  private ensureLockView(reelIndex0: number): LockView {
    while (this.locks.length <= reelIndex0) {
      const root = new Container();
      (root as any).eventMode = 'none';

      const chain = new Sprite(this.chainTex ?? makePlaceholderChainTexture());
      (chain as any).eventMode = 'none';
      chain.anchor.set(0.5);

      const glow = new Graphics();
      glow.blendMode = 'add';
      glow.alpha = 0.18;
      (glow as any).eventMode = 'none';

      root.addChild(glow, chain);
      root.visible = false;
      this.addChild(root);

      this.locks.push({ root, chain, glow });
    }
    return this.locks[reelIndex0]!;
  }

  private updateOne(reelIndex0: number): void {
    const v = this.locks[reelIndex0];
    if (!v || !v.root.visible) return;

    const rows = SlotConfig.reels.rows;
    const top = this.machine.getSymbolCenter(reelIndex0, 0);
    const bot = this.machine.getSymbolCenter(reelIndex0, rows - 1);

    const reelH = Math.abs(bot.y - top.y) + SlotConfig.reels.symbolSize; // include symbol height
    const reelW = SlotConfig.reels.symbolSize;

    const x = top.x;
    const y = (top.y + bot.y) + 25;

    v.root.x = x;
    v.root.y = y;

    v.chain.width = reelW ;
    v.chain.height = reelH + 100 ;

  }

  private playLockPop(v: LockView): void {
    v.root.scale.set(1);
    this.tweens.killTweensOf(v.root.scale);
    this.tweens.to(v.root.scale, { x: 1.06, y: 1.06 }, 0.10, { ease: Easings.outBack });
    this.tweens.to(v.root.scale, { x: 1, y: 1 }, 0.18, { ease: Easings.outCubic, delay: 0.10 });

    // Small shake on the chain sprite (subtle).
    this.tweens.killTweensOf(v.chain);
    const baseX = v.chain.x;
    v.chain.x = baseX;
    this.tweens.to(v.chain, { x: baseX + 4 }, 0.06, { ease: Easings.outCubic });
    this.tweens.to(v.chain, { x: baseX - 3 }, 0.06, { ease: Easings.outCubic, delay: 0.06 });
    this.tweens.to(v.chain, { x: baseX }, 0.08, { ease: Easings.outCubic, delay: 0.12 });
  }
}

