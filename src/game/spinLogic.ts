import type { SymbolId } from './slot/SymbolIds';
import type { SlotModel } from './slot/SlotModel';

/**
 * spinGrid(previousGrid, heldReels, model)
 *
 * - heldReels[col] == true  -> keep previousGrid column as-is
 * - heldReels[col] == false -> generate new symbols
 */
export function spinGrid(
  model: SlotModel,
  previousGrid: SymbolId[][] | null,
  heldReels: boolean[] | null,
  opts?: { hitRate?: number; bonusTargetFrequency?: number },
): SymbolId[][] {
  const next = model.spin(opts);

  if (!previousGrid || !heldReels) return next;

  const reels = next.length;
  for (let r = 0; r < reels; r++) {
    if (heldReels[r]) next[r] = previousGrid[r]!.slice();
  }
  return next;
}

