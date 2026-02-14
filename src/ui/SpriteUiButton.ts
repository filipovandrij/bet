import { Button } from '@pixi/ui';
import { Container, isMobile, Rectangle, Sprite, Text, type Texture, type TextStyleOptions } from 'pixi.js';

export interface SpriteUiButtonTextures {
  default: Texture;
  hover: Texture;
  pressed: Texture;
  disabled: Texture;
}

export interface SpriteUiButtonOptions {
  label: string;
  textures: SpriteUiButtonTextures;
  textStyle: TextStyleOptions;
  disabled?: boolean;
  // Force background sprite size (recommended when using HD UI PNGs).
  width?: number;
  height?: number;
  // Small offset for "pressed" feel (like real slots)
  pressTextOffsetY?: number;
  pressScale?: number;
  hoverScale?: number;
}

/**
 * PixiUI Button that uses sprites from a spritesheet (atlas).
 * Mirrors the PixiUI example pattern: swap bg textures in down/up/hover/out.
 */
export class SpriteUiButton extends Button {
  readonly buttonView = new Container();
  readonly buttonBg = new Sprite();
  readonly textView: Text;

  private readonly textures: SpriteUiButtonTextures;
  private over = false;

  onClick: (() => void) | null = null;

  private readonly pressTextOffsetY: number;
  private readonly pressScale: number;
  private readonly hoverScale: number;

  constructor(opts: SpriteUiButtonOptions) {
    super();
    this.textures = opts.textures;

    this.pressTextOffsetY = opts.pressTextOffsetY ?? 2;
    this.pressScale = opts.pressScale ?? 0.94;
    this.hoverScale = opts.hoverScale ?? 1.04;

    this.textView = new Text({ text: opts.label, style: opts.textStyle });
    this.textView.anchor.set(0.5);

    this.buttonBg.anchor.set(0.5);

    // If textures are very large, clamp to intended UI size.
    if (opts.width && opts.height) {
      this.buttonBg.width = opts.width;
      this.buttonBg.height = opts.height;
    }

    // Make hit-testing stable: don't let pointer move between bg/text
    // and generate hover/out flicker.
    this.buttonView.interactiveChildren = false;
    (this.buttonBg as any).eventMode = 'none';
    (this.textView as any).eventMode = 'none';

    const fw = opts.width ?? this.buttonBg.width ?? this.buttonBg.texture.frame.width;
    const fh = opts.height ?? this.buttonBg.height ?? this.buttonBg.texture.frame.height;
    this.buttonView.hitArea = new Rectangle(-fw / 2, -fh / 2, fw, fh);

    this.buttonView.addChild(this.buttonBg, this.textView);
    this.view = this.buttonView;

    // Set enabled AFTER view is assigned (PixiUI requirement).
    this.enabled = !opts.disabled;
    this.buttonBg.texture = this.enabled ? this.textures.default : this.textures.disabled;

    this.onPress.connect(() => this.onClick?.());
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    this.buttonBg.texture = v ? this.textures.default : this.textures.disabled;
    this.buttonView.alpha = v ? 1 : 0.55;
    if (!v) {
      this.over = false;
      this.buttonView.scale.set(1);
      this.textView.y = 0;
    }
  }

  setLabel(text: string): void {
    this.textView.text = text;
  }

  /**
   * Resize the visual + hit area (useful when UI is scaled).
   */
  resize(width: number, height: number): void {
    this.buttonBg.width = width;
    this.buttonBg.height = height;
    this.buttonView.hitArea = new Rectangle(-width / 2, -height / 2, width, height);
  }

  override down(): void {
    if (!this.enabled) return;
    this.buttonBg.texture = this.textures.pressed;
    this.buttonView.scale.set(this.pressScale);
    this.textView.y = this.pressTextOffsetY;
  }

  override up(): void {
    if (!this.enabled) return;
    this.buttonBg.texture = isMobile.any ? this.textures.default : (this.over ? this.textures.hover : this.textures.default);
    this.buttonView.scale.set(1);
    this.textView.y = 0;
  }

  override upOut(): void {
    if (!this.enabled) return;
    this.over = false;
    this.buttonBg.texture = this.textures.default;
    this.buttonView.scale.set(1);
    this.textView.y = 0;
  }

  override out(): void {
    if (!this.enabled) return;
    this.over = false;
    if (!this.isDown) this.buttonBg.texture = this.textures.default;
    this.buttonView.scale.set(1);
  }

  override hover(): void {
    if (!this.enabled) return;
    this.over = true;
    if (!this.isDown) this.buttonBg.texture = this.textures.hover;
    this.buttonView.scale.set(this.hoverScale);
  }
}

