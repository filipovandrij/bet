# PixiJS Slot Prototype (Production-style)

Small game prototype built with **PixiJS (v8)** + **Vite** + **TypeScript**, structured like a commercial casual/slot project:

- Scene management with layered scene roots
- Ticker-based tweening + time-based animation (no `setTimeout` animations)
- Simple state machine driving UI/logic
- Slot-style reel spin with anticipation/overshoot and win/lose feedback
- Reusable animated symbol component with idle + win animations

## Run

```bash
npm install
npm run dev
```

Then open the local URL Vite prints.

## Project structure

- `src/app/GameApp.ts`: Pixi application bootstrap, resize, main update loop
- `src/scenes/*`: scene interfaces, scene manager, and `SlotScene`
- `src/core/state/*`: simple state machine
- `src/core/tween/*`: tween manager + easing functions
- `src/core/layout/*`: design-resolution scaler
- `src/game/slot/*`: slot model + reel/symbol views
- `src/ui/*`: UI components (button)

