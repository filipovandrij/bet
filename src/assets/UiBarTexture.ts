import { Assets, type Texture } from 'pixi.js';

const SRC = new URL('../img/bar.PNG', import.meta.url).href;

let cached: Texture | null = null;

export async function preloadUiBarTexture(): Promise<Texture> {
  if (cached) return cached;
  const alias = 'ui:bar';
  if (!(Assets.cache as any)?.has?.(alias)) {
    Assets.add({ alias, src: SRC });
  }
  await Assets.load(alias);
  const tex = Assets.get(alias) as Texture | undefined;
  if (!tex) throw new Error('Failed to load bar.PNG');
  cached = tex;
  return tex;
}

