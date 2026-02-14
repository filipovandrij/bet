import type { Renderer } from 'pixi.js';
import type { TweenManager } from '../core/tween/TweenManager';

export interface SceneContext {
  renderer: Renderer;
  tweens: TweenManager;
}

