import { Application, Container, type Ticker } from 'pixi.js';
import { SceneManager } from '../scenes/SceneManager';
import { SlotScene } from '../scenes/SlotScene';
import { FitScaler, type FitScaleMode } from '../core/layout/FitScaler';
import { TweenManager } from '../core/tween/TweenManager';

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;
const SCALE_MODE: FitScaleMode = 'contain';

export class GameApp {
  private readonly host: HTMLElement;
  private readonly app: Application;
  private readonly root: Container;

  private readonly scaler: FitScaler;
  private readonly tweens: TweenManager;
  private scenes: SceneManager | null = null;

  private started = false;

  constructor(host: HTMLElement) {
    this.host = host;

    this.app = new Application();
    this.root = new Container();

    this.scaler = new FitScaler({
      designWidth: DESIGN_WIDTH,
      designHeight: DESIGN_HEIGHT,
      mode: SCALE_MODE,
    });

    this.tweens = new TweenManager();
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    await this.app.init({
      background: '#0b0f1a',
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      resizeTo: this.host,
      powerPreference: 'high-performance',
    });

    // Ensure we don't stack multiple canvases (dev/HMR safety).
    this.host.replaceChildren(this.app.canvas);
    this.app.stage.addChild(this.root);

    this.scenes = new SceneManager(this.root, {
      renderer: this.app.renderer,
      tweens: this.tweens,
    });

    this.handleResize();
    window.addEventListener('resize', this.handleResize, { passive: true });

    // Centralized update loop: delta in seconds.
    this.app.ticker.add(this.update);

    // Boot first scene.
    await this.scenes.change(new SlotScene());
  }

  destroy(): void {
    window.removeEventListener('resize', this.handleResize);
    this.app.ticker.remove(this.update);
    this.scenes?.destroy();
    this.app.destroy(true);
  }

  private readonly update = (ticker: Ticker): void => {
    const dt = ticker.deltaMS / 1000;

    this.tweens.update(dt);
    this.scenes?.update(dt);
  };

  private readonly handleResize = (): void => {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;

    this.scaler.apply(this.root, w, h);
  };
}

