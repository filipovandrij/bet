import { Container } from 'pixi.js';
import type { IScene } from './IScene';
import type { SceneContext } from './SceneContext';

/**
 * Standard layered scene root:
 * background -> game -> effects -> ui
 */
export abstract class BaseScene implements IScene {
  readonly view = new Container();

  protected readonly layers = {
    background: new Container(),
    game: new Container(),
    effects: new Container(),
    ui: new Container(),
  } as const;

  protected ctx!: SceneContext;

  constructor() {
    this.view.addChild(
      this.layers.background,
      this.layers.game,
      this.layers.effects,
      this.layers.ui,
    );
  }

  enter(ctx: SceneContext): Promise<void> | void {
    this.ctx = ctx;
  }

  exit(): void {
    // Override in subclasses if needed.
  }

  update(_dt: number): void {
    // Override in subclasses.
  }
}

