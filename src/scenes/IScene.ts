import type { Container } from 'pixi.js';
import type { SceneContext } from './SceneContext';

export interface IScene {
  readonly view: Container;
  enter(ctx: SceneContext): Promise<void> | void;
  exit(): void;
  update(dt: number): void;
  resize?(): void;
}

