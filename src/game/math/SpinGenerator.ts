import type { SymbolId } from '../slot/SymbolIds';
import type { PayCount } from './EnvMathSpec';
import type { EnvMathSpec } from './EnvMathSpec';

type Grid = SymbolId[][];

export interface GeneratedSpin {
  grid: Grid;
  forcedWin: boolean;
  forcedScatter: boolean;
}

export function generateSpin(
  rng: () => number,
  math: EnvMathSpec,
  reels: number,
  rows: number,
  overrides?: { hitRate?: number; bonusTargetFrequency?: number },
): GeneratedSpin {
  const hitRate = overrides?.hitRate ?? math.hitRate;
  const bonusFreq = overrides?.bonusTargetFrequency ?? math.bonusTargetFrequency;

  const forceScatter = math.qaForceBonus || rng() < bonusFreq;
  const forceWin = math.qaForceWin || rng() < hitRate;

  // Start with a random grid.
  const grid = createWeightedGrid(rng, math, reels, rows);

  if (math.qaForceSymbol) {
    for (let r = 0; r < reels; r++) for (let y = 0; y < rows; y++) grid[r]![y] = math.qaForceSymbol;
  }

  if (forceWin) applyForcedWinLine(rng, math, grid);
  else breakAccidentalWins(rng, math, grid);

  if (forceScatter) applyForcedScatter(rng, math, grid, math.bonusTriggerCount);
  else limitScatterBelow(rng, math, grid, math.bonusTriggerCount);

  return { grid, forcedWin: forceWin, forcedScatter: forceScatter };
}

function createWeightedGrid(rng: () => number, math: EnvMathSpec, reels: number, rows: number): Grid {
  const grid: Grid = new Array(reels);
  for (let r = 0; r < reels; r++) {
    const col: SymbolId[] = new Array(rows);
    for (let y = 0; y < rows; y++) col[y] = pickWeightedSymbol(rng, math);
    grid[r] = col;
  }
  return grid;
}

function pickWeightedSymbol(rng: () => number, math: EnvMathSpec): SymbolId {
  const w = math.weights;
  const symbols = math.symbols;
  // Manual tight loop (no allocations).
  let total = 0;
  for (let i = 0; i < symbols.length; i++) total += w[symbols[i]!] ?? 0;
  let roll = rng() * total;
  for (let i = 0; i < symbols.length; i++) {
    const id = symbols[i]!;
    roll -= w[id] ?? 0;
    if (roll <= 0) return id;
  }
  return 'A';
}

function pickMatchCount(rng: () => number): PayCount {
  // Default distribution: mostly 3, sometimes 4, rarely 5
  const w3 = 82;
  const w4 = 16;
  const w5 = 2;
  const total = w3 + w4 + w5;
  let roll = rng() * total;
  roll -= w3;
  if (roll <= 0) return 3;
  roll -= w4;
  if (roll <= 0) return 4;
  return 5;
}

function applyForcedWinLine(rng: () => number, math: EnvMathSpec, grid: Grid): void {
  const reels = grid.length;
  const rows = grid[0]!.length;

  const row = (rng() * rows) | 0;
  const count = pickMatchCount(rng);

  // Pick a non-scatter, non-wild symbol (keeps wins readable as "fruits").
  let sym: Exclude<SymbolId, 'SCATTER' | 'WILD'> = 'A';
  for (let tries = 0; tries < 10; tries++) {
    const s = pickWeightedSymbol(rng, math);
    if (s !== math.scatterSymbol && s !== 'WILD') {
      sym = s as any;
      break;
    }
  }

  const maxCount = Math.min(reels, count);
  for (let r = 0; r < maxCount; r++) grid[r]![row] = sym;

  // Note: we do NOT inject WILD here anymore.
  // Injecting WILD inside forced wins conflicts with the Sticky-Wild feature
  // (it would reset respins too often and feel buggy).
  // Important: do NOT call breakAccidentalWins here,
  // otherwise we can accidentally destroy the forced win itself.
}

function breakAccidentalWins(rng: () => number, math: EnvMathSpec, grid: Grid): void {
  const reels = grid.length;
  const rows = grid[0]!.length;

  for (let row = 0; row < rows; row++) {
    const first = grid[0]![row]!;
    if (first === math.scatterSymbol) continue;

    let count = 1;
    for (let r = 1; r < reels; r++) {
      if (grid[r]![row] === first) count++;
      else break;
    }
    if (count >= 3) {
      // Break the run by changing reel 2 (3rd symbol) to a different symbol.
      const breakReel = 2;
      grid[breakReel]![row] = pickDifferentNonScatter(rng, math, first);
    }
  }
}

function pickDifferentNonScatter(
  rng: () => number,
  math: EnvMathSpec,
  notThis: SymbolId,
): Exclude<SymbolId, 'SCATTER'> {
  // Pick until different and not scatter.
  for (let i = 0; i < 20; i++) {
    const s = pickWeightedSymbol(rng, math);
    if (s !== math.scatterSymbol && s !== notThis) return s as any;
  }
  return notThis === 'A' ? 'K' : 'A';
}

function countScatter(grid: Grid, scatterSymbol: SymbolId): number {
  let c = 0;
  for (let r = 0; r < grid.length; r++) {
    const col = grid[r]!;
    for (let y = 0; y < col.length; y++) if (col[y] === scatterSymbol) c++;
  }
  return c;
}

function applyForcedScatter(rng: () => number, math: EnvMathSpec, grid: Grid, desired: number): void {
  const reels = grid.length;
  const rows = grid[0]!.length;

  // Ensure at least desired scatters anywhere.
  let c = countScatter(grid, math.scatterSymbol);
  let guard = 0;
  while (c < desired && guard++ < 200) {
    const r = (rng() * reels) | 0;
    const y = (rng() * rows) | 0;
    if (grid[r]![y] !== math.scatterSymbol) {
      grid[r]![y] = math.scatterSymbol;
      c++;
    }
  }
}

function limitScatterBelow(rng: () => number, math: EnvMathSpec, grid: Grid, limit: number): void {
  // If we accidentally got 3+ scatters, reduce them.
  let c = countScatter(grid, math.scatterSymbol);
  if (c < limit) return;

  const reels = grid.length;
  const rows = grid[0]!.length;

  let guard = 0;
  while (c >= limit && guard++ < 300) {
    const r = (rng() * reels) | 0;
    const y = (rng() * rows) | 0;
    if (grid[r]![y] === math.scatterSymbol) {
      grid[r]![y] = pickDifferentNonScatter(rng, math, math.scatterSymbol) as any;
      c--;
    }
  }
}

