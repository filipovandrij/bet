import { Assets, type Texture } from 'pixi.js';
import type { SymbolId } from './SymbolIds';

export type SymbolTextures = Record<SymbolId, Texture>;

const SYMBOL_SOURCES: Record<SymbolId, string> = {
  A: new URL('../../img/symbol_A.PNG', import.meta.url).href,
  K: new URL('../../img/symbol_K.PNG', import.meta.url).href,
  Q: new URL('../../img/symbol_Q.PNG', import.meta.url).href,
  J: new URL('../../img/symbol_J.PNG', import.meta.url).href,
  T: new URL('../../img/symbol_T.PNG', import.meta.url).href,

  CROWN: new URL('../../img/symbol_CROWN.PNG', import.meta.url).href,
  SKULL: new URL('../../img/symbol_SKULL.PNG', import.meta.url).href,
  PARROT: new URL('../../img/symbol_PARROT.PNG', import.meta.url).href,
  CANNON: new URL('../../img/symbol_CANNON.PNG', import.meta.url).href,
  CHEST_GOLD: new URL('../../img/symbol_CHEST_GOLD.PNG', import.meta.url).href,
  COMPASS: new URL('../../img/symbol_COMPASS.PNG', import.meta.url).href,

  WILD: new URL('../../img/symbol_WILD.PNG', import.meta.url).href,
  SCATTER: new URL('../../img/symbol_SCATTER.PNG', import.meta.url).href,
};

let cached: SymbolTextures | null = null;

/**
 * Loads all symbol textures once and returns a shared dictionary.
 * - Uses Pixi `Assets` cache (preferred).
 * - Textures are shared; Symbol instances must reuse these textures.
 */
export async function preloadSymbolTextures(): Promise<SymbolTextures> {
  if (cached) return cached;

  // Register aliases once (safe to call multiple times).
  (Object.keys(SYMBOL_SOURCES) as SymbolId[]).forEach((id) => {
    const alias = `sym:${id}`;
    if (!(Assets.cache as any)?.has?.(alias)) {
      Assets.add({ alias, src: SYMBOL_SOURCES[id] });
    }
  });

  // Load all textures.
  const aliases = (Object.keys(SYMBOL_SOURCES) as SymbolId[]).map((id) => `sym:${id}`);
  await Assets.load(aliases);

  const textures = {} as SymbolTextures;
  (Object.keys(SYMBOL_SOURCES) as SymbolId[]).forEach((id) => {
    const tex = Assets.get(`sym:${id}`) as Texture | undefined;
    if (!tex) throw new Error(`Missing texture for ${id}`);
    (tex as any).__key = `sym:${id}`;
    textures[id] = tex;
  });

  cached = textures;
  return textures;
}

