import { GameApp } from './app/GameApp';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');

declare global {
  interface Window {
    __pixiSlotGame?: GameApp;
  }
}

// Prevent multiple canvases / instances during Vite HMR.
window.__pixiSlotGame?.destroy();
const game = new GameApp(root);
window.__pixiSlotGame = game;
game.start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.__pixiSlotGame?.destroy();
    window.__pixiSlotGame = undefined;
  });
}

