import type { SymbolId } from './slot/SymbolIds';
import type { EnvMathSpec, PayCount } from './math/EnvMathSpec';
import { PAYLINES_5X3 } from './paylines';

export interface WinLine {
  lineId: number;
  pathRows: readonly number[];
  fromReel: number;
  toReel: number;
  symbol: Exclude<SymbolId, 'SCATTER'>;
  count: PayCount;
  usedWild: boolean;
  amount: number;
  positions: { reel: number; row: number }[];
}

export interface EvaluatedSpin {
  winAmount: number;
  winLines: WinLine[];
  scatterCount: number;
  scatterWinAmount: number;
  scatterPositions: { reel: number; row: number }[];
  heldReelsNext: boolean[];
}

export function evaluateGrid(
  grid: SymbolId[][],
  bet: number,
  math: EnvMathSpec,
  inFreeSpins: boolean,
): EvaluatedSpin {
  const reels = grid.length;
  const rows = grid[0]?.length ?? 0;
  // SCATTER is not part of line wins and always breaks matching.
  // Keep math.scatterSymbol for bonus configuration, but line evaluation must ALWAYS break on SCATTER.
  const scatter = 'SCATTER' as const;

  let scatterCount = 0;
  const scatterPositions: { reel: number; row: number }[] = [];
  for (let r = 0; r < reels; r++) {
    for (let y = 0; y < rows; y++) {
      if (grid[r]![y] === math.scatterSymbol) {
        scatterCount++;
        scatterPositions.push({ reel: r, row: y });
      }
    }
  }

  const winLines: WinLine[] = [];
  let winAmount = 0;

  // Paylines: left-to-right.
  for (let li = 0; li < PAYLINES_5X3.length; li++) {
    const line = PAYLINES_5X3[li]!;
    const path = line.rows;

    const symbols: SymbolId[] = new Array(reels);
    for (let r = 0; r < reels; r++) symbols[r] = grid[r]![path[r]!]!;

    // Algorithm (strict):
    // - base is ONE symbol (normal or WILD)
    // - count contiguous left-to-right
    // - SCATTER breaks and never participates
    const s0 = symbols[0]!;
    if (s0 === scatter) continue;

    let base: SymbolId = s0;
    if (s0 === 'WILD') {
      base = 'WILD';
      for (let r = 1; r < reels; r++) {
        const s = symbols[r]!;
        if (s === scatter) break;
        if (s !== 'WILD') {
          base = s;
          break;
        }
      }
      if (base === 'WILD' && !math.wildPaysItself) continue;
    }

    let count = 0;
    let usedWild = false;
    const positions: { reel: number; row: number }[] = [];

    for (let r = 0; r < reels; r++) {
      const s = symbols[r]!;
      if (s === scatter) break;

      if (s === base) {
        if (s === 'WILD' && base === 'WILD') usedWild = true;
        count++;
        positions.push({ reel: r, row: path[r]! });
        continue;
      }

      // WILD substitutes only for regular symbols; never for scatter.
      const wildOk = math.wildSubstitutes && s === 'WILD' && base !== 'WILD';
      if (wildOk) {
        usedWild = true;
        count++;
        positions.push({ reel: r, row: path[r]! });
        continue;
      }

      break;
    }

    if (count >= 3) {
      const c = (Math.min(5, count) as PayCount);
      const baseSym = base as Exclude<SymbolId, 'SCATTER'>;
      const mult = (math.paytable as any)?.[baseSym]?.[c] ?? 0;
      const amount = bet * mult;
      if (amount > 0) {
        winAmount += amount;
        winLines.push({
          lineId: line.id,
          pathRows: path,
          fromReel: 0,
          toReel: count - 1,
          symbol: baseSym,
          count: c,
          usedWild,
          amount,
          positions,
        });
      }
    }
  }

  let scatterWinAmount = 0;
  if (math.scatterPays && scatterCount >= 3) {
    const c = (Math.min(5, scatterCount) as PayCount);
    const mult = math.scatterPay[c] ?? 0;
    scatterWinAmount = bet * mult;
  }

  const total = (winAmount + scatterWinAmount) * (inFreeSpins ? math.freeSpinsWinMult : 1);

  // Reel hold: if a column contains at least one WILD -> held next spin.
  const heldReelsNext: boolean[] = new Array(reels).fill(false);
  for (let r = 0; r < reels; r++) {
    for (let y = 0; y < rows; y++) {
      if (grid[r]![y] === 'WILD') {
        heldReelsNext[r] = true;
        break;
      }
    }
  }

  return {
    winAmount: Math.round(total),
    winLines,
    scatterCount,
    scatterWinAmount,
    scatterPositions,
    heldReelsNext,
  };
}

