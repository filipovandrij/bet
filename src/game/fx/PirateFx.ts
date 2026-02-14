import { Assets, Container, Graphics, type Texture } from 'pixi.js';
import type { TweenManager } from '../../core/tween/TweenManager';
import { Easings } from '../../core/tween/Easings';
import { parseScmlXml, SpriterScmlPlayer, type ScmlAnimation, type ScmlData } from './SpriterScmlPlayer';

type PirateFxOptions = {
  tweens: TweenManager;
};

type LoadedPirate = {
  data: ScmlData;
  texturesByFolderFile: Map<string, Texture>;
};

let cached: LoadedPirate | null = null;

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to fetch ${url} (${r.status})`);
  return await r.text();
}

async function loadTexture(url: string): Promise<Texture> {
  const alias = `url:${url}`;
  if (!(Assets.cache as any)?.has?.(alias)) {
    Assets.add({ alias, src: url });
  }
  await Assets.load(alias);
  const tex = Assets.get(alias) as Texture | undefined;
  if (!tex) throw new Error(`Missing texture for ${url}`);
  return tex;
}

function fileUrl(fileName: string): string {
  // Keep SCML relative paths intact: do not rename/move the PNG parts.
  return new URL(`../../assets/pirate/${fileName}`, import.meta.url).toString();
}

function scmlUrl(): string {
  return new URL(`../../assets/pirate/2.scml`, import.meta.url).toString();
}

function texKey(folderId: number, fileId: number): string {
  return `${folderId}:${fileId}`;
}

async function preloadPirateOnce(): Promise<LoadedPirate> {
  if (cached) return cached;

  const url = scmlUrl();
  const scmlText = await fetchText(url);
  const data = parseScmlXml(scmlText);

  const texturesByFolderFile = new Map<string, Texture>();

  // Register + load all part textures via Pixi Assets cache.
  const aliases: string[] = [];
  data.folders.forEach((folder) => {
    folder.files.forEach((f) => {
      const alias = `pir:${folder.id}:${f.id}`;
      const src = fileUrl(f.name);
      if (!(Assets.cache as any)?.has?.(alias)) {
        Assets.add({ alias, src });
      }
      aliases.push(alias);
    });
  });

  await Assets.load(aliases);

  data.folders.forEach((folder) => {
    folder.files.forEach((f) => {
      const alias = `pir:${folder.id}:${f.id}`;
      const t = Assets.get(alias) as Texture | undefined;
      if (!t) throw new Error(`Missing pirate texture for ${alias}`);
      (t as any).__key = `pirate:${f.name}`;
      texturesByFolderFile.set(texKey(folder.id, f.id), t);
    });
  });

  cached = { data, texturesByFolderFile };
  console.log('[PirateFx] loaded SCML + textures:', {
    scml: url,
    textures: texturesByFolderFile.size,
    animations: [...data.entity.animations.keys()],
  });
  return cached;
}

function findShotMomentMs(anim: ScmlAnimation): number {
  // For this asset, the "shot" appears on timeline named "shot_000".
  // We trigger lock at the first key time on that timeline.
  for (const tl of anim.timelines.values()) {
    if (tl.type !== 'object') continue;
    if (tl.name.toLowerCase().includes('shot_000') || tl.name.toLowerCase() === 'shot_000') {
      const k0 = tl.keys[0];
      if (k0) return k0.time;
    }
  }
  // Fallback: ~80% into the anim.
  return Math.floor(anim.length * 0.8);
}

export class PirateFx extends Container {
  private readonly tweens: TweenManager;

  private player: SpriterScmlPlayer | null = null;
  private shootAnimName: string = 'ATTACK';
  private shootLenMs = 1000;
  private shotMomentMs = 800;

  private playing = false;
  private tMs = 0;
  private shotFired = false;
  private onShot: (() => void) | null = null;
  private onDone: (() => void) | null = null;

  private readonly flash = new Graphics();

  constructor(opts: PirateFxOptions) {
    super();
    this.tweens = opts.tweens;

    this.visible = false;
    (this as any).eventMode = 'none';

    // Lightweight muzzle flash overlay (add blend, no filters).
    this.flash.blendMode = 'add';
    this.flash.alpha = 0;
    (this.flash as any).eventMode = 'none';
    this.addChild(this.flash);
  }

  async init(): Promise<void> {
    if (this.player) return;
    const loaded = await preloadPirateOnce();
    this.player = new SpriterScmlPlayer({ data: loaded.data, texturesByFolderFile: loaded.texturesByFolderFile, initialAnimation: 'IDLE' });

    // Place the player inside this container so SlotScene can position it.
    this.addChildAt(this.player.view, 0);

    // Normalize pivot once (so scaling/positioning is easier).
    const b = this.player.view.getLocalBounds();
    this.player.view.pivot.set(b.x + b.width * 0.5, b.y + b.height * 0.5);

    // Pick shoot animation name: prefer ATTACK, then SHOOT, else first non-IDLE.
    const animKeys = [...loaded.data.entity.animations.keys()];
    const pick =
      (loaded.data.entity.animations.has('ATTACK') && 'ATTACK') ||
      (loaded.data.entity.animations.has('SHOOT') && 'SHOOT') ||
      animKeys.find((k) => k !== 'IDLE') ||
      animKeys[0] ||
      'IDLE';
    this.shootAnimName = pick;

    const shootAnim = loaded.data.entity.animations.get(this.shootAnimName)!;
    this.shootLenMs = shootAnim.length;
    this.shotMomentMs = findShotMomentMs(shootAnim);

    console.log('[PirateFx] ready:', { shootAnim: this.shootAnimName, lengthMs: this.shootLenMs, shotMomentMs: this.shotMomentMs });
  }

  update(dt: number): void {
    if (!this.playing || !this.player) return;
    this.tMs += dt * 1000;
    this.player.setTimeMs(this.tMs);

    if (!this.shotFired && this.tMs >= this.shotMomentMs) {
      this.shotFired = true;
      console.log('[PirateFx] shot moment fired');
      this.onShot?.();
      this.pulseFlash();
    }

    if (this.tMs >= this.shootLenMs) {
      this.playing = false;
      this.onDone?.();
      this.onShot = null;
      this.onDone = null;
    }
  }

  /**
   * Plays the "hold shoot" presentation.
   * - Pirate appears over reels area
   * - Plays shoot animation
   * - Fires callback exactly at shot moment (to apply chains)
   */
  async playHoldShoot(reels1Based: number[], onShot: () => void): Promise<void> {
    await this.init();
    if (!this.player) return;

    if (!reels1Based.length) return;
    console.log('[PirateFx] playHoldShoot start:', { reels: reels1Based.join(',') });

    this.visible = true;
    this.alpha = 0;
    // IMPORTANT: do not overwrite external sizing (SlotScene sets base scale).
    // We only apply a small "pop" relative to current base scale.
    const baseScaleX = this.scale.x || 1;
    const baseScaleY = this.scale.y || 1;
    this.scale.set(baseScaleX * 0.92, baseScaleY * 0.92);

    // Appear (quick scale/alpha).
    this.tweens.killTweensOf(this);
    await new Promise<void>((resolve) => {
      this.tweens.to(this, { alpha: 1 }, 0.12, { ease: Easings.outCubic });
      this.tweens.to(this.scale, { x: baseScaleX, y: baseScaleY }, 0.22, { ease: Easings.outBack, onComplete: resolve });
    });

    // Start shoot animation.
    this.player.setAnimation(this.shootAnimName);
    this.tMs = 0;
    this.shotFired = false;
    this.onShot = onShot;

    await new Promise<void>((resolve) => {
      this.onDone = resolve;
      this.playing = true;
    });

    // Small linger + hide.
    await new Promise<void>((resolve) => {
      this.tweens.to(this, { alpha: 0 }, 0.18, { ease: Easings.outCubic, delay: 0.10, onComplete: resolve });
    });
    this.visible = false;
    console.log('[PirateFx] playHoldShoot done');
  }

  private pulseFlash(): void {
    // Draw a small flash near the pirate "weapon" area.
    // (This is decorative; chain lock is the real feedback.)
    this.flash
      .clear()
      .circle(0, 0, 26)
      .fill({ color: 0xfff3b0, alpha: 1 })
      .circle(-8, -6, 12)
      .fill({ color: 0xffffff, alpha: 0.65 });
    this.flash.alpha = 0;
    this.flash.x = 120;
    this.flash.y = -40;

    this.tweens.killTweensOf(this.flash);
    this.tweens.to(this.flash, { alpha: 0.9 }, 0.05, { ease: Easings.outCubic });
    this.tweens.to(this.flash, { alpha: 0 }, 0.16, { ease: Easings.outCubic, delay: 0.05 });
  }
}

