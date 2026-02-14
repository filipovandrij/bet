import { defineConfig } from 'vite';

export default defineConfig({
  // Allow non-VITE_ prefixes so we can use "math spec env" files directly.
  envPrefix: [
    'VITE_',
    'MATH_',
    'REELS',
    'ROWS',
    'PAYLINES',
    'PAYLINE_',
    'BET_',
    'COIN_',
    'SYMBOLS',
    'W_',
    'PAY_',
    'WILD_',
    'SCATTER_',
    'BONUS_',
    'FREESPINS_',
    'WIN_',
    'BIG_',
    'MEGA_',
    'EPIC_',
    'MAX_',
    'RNG_',
    'QA_',
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
});

