import { Container, Graphics, RenderTexture, Spritesheet, type Renderer, type Texture } from 'pixi.js';

export interface UiButtonTextures {
  small: {
    default: Texture;
    hover: Texture;
    pressed: Texture;
    disabled: Texture;
  };
  big: {
    default: Texture;
    hover: Texture;
    pressed: Texture;
    disabled: Texture;
  };
}

let cached: { sheet: Spritesheet; textures: UiButtonTextures; rt: RenderTexture } | null = null;

/**
 * Builds a runtime spritesheet atlas (one big texture + frames) for UI buttons.
 * This gives us a real "spritesheet pipeline" without needing external PNG/JSON yet.
 * Later you can swap to Assets.load('atlas.json') and keep the same button code.
 */
export function getUiSpritesheet(renderer: Renderer): { sheet: Spritesheet; textures: UiButtonTextures } {
  if (cached) return { sheet: cached.sheet, textures: cached.textures };

  // Frame sizes
  const bigW = 260;
  const bigH = 78;
  const bigR = 28;

  const smallW = 36;
  const smallH = 32;
  const smallR = 10;

  // Atlas layout
  const pad = 16;
  const cellW = Math.max(bigW, smallW) + pad * 2;
  const cellH = Math.max(bigH, smallH) + pad * 2;

  // 2 columns (states grid) x 4 rows (big 2x2 + small 2x2)
  const atlasW = cellW * 2;
  const atlasH = cellH * 4;

  const rt = RenderTexture.create({ width: atlasW, height: atlasH, resolution: 2 });

  const atlas = new Container();

  const panelBtnColors = {
    top: 0x263a7a,
    bottom: 0x16264f,
    topHover: 0x2c4490,
    bottomHover: 0x1a2d61,
    topPressed: 0x1f2f62,
    bottomPressed: 0x131f45,
    stroke: 0x9adfff,
    strokeAlpha: 0.18,
    glow: 0x7cf7ff,
    glowAlpha: 0.10,
    shine: 0xffffff,
    shineAlpha: 0.10,
    shadow: 0x000000,
    shadowAlpha: 0.20,
  } as const;

  const spinColors = {
    top: 0xffd36b,
    bottom: 0xf0a41e,
    topHover: 0xffde88,
    bottomHover: 0xf6b23a,
    topPressed: 0xe0a02b,
    bottomPressed: 0xc47b14,
    stroke: 0xfff0c2,
    strokeAlpha: 0.30,
    glow: 0x7cf7ff,
    glowAlpha: 0.10,
    shine: 0xffffff,
    shineAlpha: 0.14,
    shadow: 0x000000,
    shadowAlpha: 0.28,
  } as const;

  // Frame mapping helper (2 columns)
  function frameXY(col: 0 | 1, row: number): { x: number; y: number } {
    return { x: col * cellW + pad, y: row * cellH + pad };
  }

  const frames: Record<string, { x: number; y: number; w: number; h: number }> = {};

  function addSkinFrame(
    name: string,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    kind: 'default' | 'hover' | 'pressed' | 'disabled',
    colors: typeof panelBtnColors | typeof spinColors,
  ): void {
    const g = drawButtonSkin(w, h, r, kind, colors);
    g.x = x + w / 2;
    g.y = y + h / 2;
    atlas.addChild(g);
    frames[name] = { x, y, w, h };
  }

  // BIG 2x2 (rows 0,1)
  {
    const p = frameXY(0, 0);
    addSkinFrame('btn_big_default', p.x, p.y, bigW, bigH, bigR, 'default', spinColors);
  }
  {
    const p = frameXY(1, 0);
    addSkinFrame('btn_big_hover', p.x, p.y, bigW, bigH, bigR, 'hover', spinColors);
  }
  {
    const p = frameXY(0, 1);
    addSkinFrame('btn_big_pressed', p.x, p.y, bigW, bigH, bigR, 'pressed', spinColors);
  }
  {
    const p = frameXY(1, 1);
    addSkinFrame('btn_big_disabled', p.x, p.y, bigW, bigH, bigR, 'disabled', spinColors);
  }

  // SMALL 2x2 (rows 2,3)
  {
    const p = frameXY(0, 2);
    addSkinFrame('btn_small_default', p.x, p.y, smallW, smallH, smallR, 'default', panelBtnColors);
  }
  {
    const p = frameXY(1, 2);
    addSkinFrame('btn_small_hover', p.x, p.y, smallW, smallH, smallR, 'hover', panelBtnColors);
  }
  {
    const p = frameXY(0, 3);
    addSkinFrame('btn_small_pressed', p.x, p.y, smallW, smallH, smallR, 'pressed', panelBtnColors);
  }
  {
    const p = frameXY(1, 3);
    addSkinFrame('btn_small_disabled', p.x, p.y, smallW, smallH, smallR, 'disabled', panelBtnColors);
  }

  // Render atlas to one texture
  renderer.render({ container: atlas, target: rt, clear: true });

  const data = {
    frames: Object.fromEntries(
      Object.entries(frames).map(([k, f]) => [
        k,
        {
          frame: { x: f.x, y: f.y, w: f.w, h: f.h },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h },
          sourceSize: { w: f.w, h: f.h },
        },
      ]),
    ),
    meta: { scale: '1' },
  } as const;

  const sheet = new Spritesheet(rt, data as any);
  sheet.parseSync();

  const textures: UiButtonTextures = {
    small: {
      default: sheet.textures['btn_small_default'],
      hover: sheet.textures['btn_small_hover'],
      pressed: sheet.textures['btn_small_pressed'],
      disabled: sheet.textures['btn_small_disabled'],
    },
    big: {
      default: sheet.textures['btn_big_default'],
      hover: sheet.textures['btn_big_hover'],
      pressed: sheet.textures['btn_big_pressed'],
      disabled: sheet.textures['btn_big_disabled'],
    },
  };

  cached = { sheet, textures, rt };
  return { sheet, textures };
}

function drawButtonSkin(
  w: number,
  h: number,
  r: number,
  kind: 'default' | 'hover' | 'pressed' | 'disabled',
  c: {
    top: number;
    bottom: number;
    topHover?: number;
    bottomHover?: number;
    topPressed: number;
    bottomPressed: number;
    topDisabled?: number;
    bottomDisabled?: number;
    stroke: number;
    strokeAlpha: number;
    glow: number;
    glowAlpha: number;
    shine: number;
    shineAlpha: number;
    shadow: number;
    shadowAlpha: number;
  },
): Graphics {
  const top = kind === 'pressed'
    ? c.topPressed
    : kind === 'disabled'
      ? (c.topDisabled ?? desaturate(c.top, 0.65))
      : kind === 'hover'
        ? (c.topHover ?? brighten(c.top, 0.10))
        : c.top;

  const bottom = kind === 'pressed'
    ? c.bottomPressed
    : kind === 'disabled'
      ? (c.bottomDisabled ?? desaturate(c.bottom, 0.65))
      : kind === 'hover'
        ? (c.bottomHover ?? brighten(c.bottom, 0.08))
        : c.bottom;

  const g = new Graphics();

  // Shadow
  g.roundRect(-w / 2, -h / 2 + 5, w, h, r).fill({ color: c.shadow, alpha: c.shadowAlpha });

  // Body base + gradient strips (rects)
  g.roundRect(-w / 2, -h / 2, w, h, r).fill({ color: top, alpha: 1 });
  const steps = 12;
  const y0 = -h / 2;
  const stepH = h / steps;
  for (let i = 0; i < steps; i++) {
    const tt = i / (steps - 1);
    const col = lerpColor(top, bottom, tt);
    g.rect(-w / 2, y0 + i * stepH, w, stepH + 0.9).fill({ color: col, alpha: 0.95 });
  }

  // Glow then crisp stroke
  g.stroke({ color: c.glow, width: 6, alpha: c.glowAlpha });
  g.stroke({ color: c.stroke, width: 2.2, alpha: c.strokeAlpha });

  // Shine
  g.roundRect(-w / 2 + 6, -h / 2 + 6, w - 12, h * 0.44, r * 0.75).fill({
    color: c.shine,
    alpha: c.shineAlpha,
  });

  return g;
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const rr = ar + (br - ar) * t;
  const rg = ag + (bg - ag) * t;
  const rb = ab + (bb - ab) * t;
  return ((rr & 0xff) << 16) | ((rg & 0xff) << 8) | (rb & 0xff);
}

function brighten(color: number, amt: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const rr = Math.min(255, r + (255 - r) * amt);
  const rg = Math.min(255, g + (255 - g) * amt);
  const rb = Math.min(255, b + (255 - b) * amt);
  return ((rr & 0xff) << 16) | ((rg & 0xff) << 8) | (rb & 0xff);
}

function desaturate(color: number, amt: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const gray = (r * 0.3 + g * 0.59 + b * 0.11) | 0;
  const rr = r + (gray - r) * amt;
  const rg = g + (gray - g) * amt;
  const rb = b + (gray - b) * amt;
  return ((rr & 0xff) << 16) | ((rg & 0xff) << 8) | (rb & 0xff);
}

