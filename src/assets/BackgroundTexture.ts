import { Assets, type Texture } from 'pixi.js';

const SRC = new URL('../img/Background.png', import.meta.url).href;

let cached: Texture | null = null;

export async function preloadBackgroundTexture(): Promise<Texture> {
  if (cached) return cached;

  const alias = 'bg:main';
  // Register once.
  if (!(Assets.cache as any)?.has?.(alias)) {
    Assets.add({ alias, src: SRC });
  }

  await Assets.load(alias);
  const tex = Assets.get(alias) as Texture | undefined;
  if (!tex) throw new Error('Failed to load Background.png');
  cached = tex;
  return tex;
}

