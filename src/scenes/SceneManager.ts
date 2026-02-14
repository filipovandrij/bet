import type { Container } from 'pixi.js';
import type { IScene } from './IScene';
import type { SceneContext } from './SceneContext';

export class SceneManager {
  private readonly root: Container;
  private readonly ctx: SceneContext;
  private current: IScene | null = null;
  private entering = false;

  constructor(root: Container, ctx: SceneContext) {
    this.root = root;
    this.ctx = ctx;
  }

  async change(next: IScene): Promise<void> {
    if (this.current) {
      this.current.exit();
      this.root.removeChild(this.current.view);
      this.current.view.destroy({ children: true });
    }

    // Avoid updating a scene while it's still entering (async asset loads, etc).
    this.entering = true;
    this.root.addChild(next.view);
    await next.enter(this.ctx);
    this.current = next;
    this.entering = false;
  }

  update(dt: number): void {
    if (this.entering) return;
    this.current?.update(dt);
  }

  destroy(): void {
    if (!this.current) return;
    this.current.exit();
    this.root.removeChild(this.current.view);
    this.current.view.destroy({ children: true });
    this.current = null;
  }
}

