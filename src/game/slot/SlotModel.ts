import { SlotConfig } from './SlotConfig';
import type { SymbolId } from './SymbolIds';
import { generateSpin } from '../math/SpinGenerator';
import type { EnvMathSpec } from '../math/EnvMathSpec';

export class SlotModel {
  private readonly rng: () => number;
  private readonly math: EnvMathSpec;

  constructor(rng: () => number, math: EnvMathSpec) {
    this.rng = rng;
    this.math = math;
  }

  spin(opts?: { hitRate?: number; bonusTargetFrequency?: number }): SymbolId[][] {
    const reels = SlotConfig.reels.count;
    const rows = SlotConfig.reels.rows;
    return generateSpin(this.rng, this.math, reels, rows, opts).grid;
  }
}

