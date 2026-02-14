import { Assets, type Texture } from 'pixi.js';
import type { SpriteUiButtonTextures } from '../ui/SpriteUiButton';

export interface UiButtonTextures {
  spin: SpriteUiButtonTextures;
  plus: SpriteUiButtonTextures;
  minus: SpriteUiButtonTextures;
}

const SOURCES = {
  // User-provided single-state PNGs. We reuse the same texture for all states
  // (still keep hover/press feedback via scaling).
  spin: new URL('../img/spin_btn.PNG', import.meta.url).href,
  plus: new URL('../img/plus_btn.PNG', import.meta.url).href,
  minus: new URL('../img/minus_btn.PNG', import.meta.url).href,
} as const;

let cached: UiButtonTextures | null = null;

export async function preloadUiButtonTextures(): Promise<UiButtonTextures> {
  if (cached) return cached;

  const aliases: string[] = [];

  (['spin', 'plus', 'minus'] as const).forEach((kind) => {
    const src = SOURCES[kind];
    (['default', 'hover', 'pressed', 'disabled'] as const).forEach((state) => {
      const alias = `ui-btn:${kind}:${state}`;
      aliases.push(alias);
      if (!(Assets.cache as any)?.has?.(alias)) {
        Assets.add({ alias, src });
      }
    });
  });

  await Assets.load(aliases);

  function get(alias: string): Texture {
    const t = Assets.get(alias) as Texture | undefined;
    if (!t) throw new Error(`Missing UI texture: ${alias}`);
    return t;
  }

  cached = {
    spin: {
      default: get('ui-btn:spin:default'),
      hover: get('ui-btn:spin:hover'),
      pressed: get('ui-btn:spin:pressed'),
      disabled: get('ui-btn:spin:disabled'),
    },
    plus: {
      default: get('ui-btn:plus:default'),
      hover: get('ui-btn:plus:hover'),
      pressed: get('ui-btn:plus:pressed'),
      disabled: get('ui-btn:plus:disabled'),
    },
    minus: {
      default: get('ui-btn:minus:default'),
      hover: get('ui-btn:minus:hover'),
      pressed: get('ui-btn:minus:pressed'),
      disabled: get('ui-btn:minus:disabled'),
    },
  };

  return cached;
}

