export interface Payline {
  id: number;
  // rows per reel (0..2), length = reels count (5).
  rows: readonly number[];
}

// Exactly 7 paylines for 5x3 (row indices: 0=top,1=mid,2=bot)
export const PAYLINES_5X3: readonly Payline[] = [
  { id: 1, rows: [1, 1, 1, 1, 1] }, // L1 middle
  { id: 2, rows: [0, 0, 0, 0, 0] }, // L2 top
  { id: 3, rows: [2, 2, 2, 2, 2] }, // L3 bottom
  { id: 4, rows: [0, 1, 2, 1, 0] }, // L4 V
  { id: 5, rows: [2, 1, 0, 1, 2] }, // L5 inverted V
  { id: 6, rows: [0, 0, 1, 0, 0] }, // L6 top-center
  { id: 7, rows: [2, 2, 1, 2, 2] }, // L7 bottom-center
] as const;

