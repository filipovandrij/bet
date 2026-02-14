import type { EnvMathSpec } from './math/EnvMathSpec';

export function shouldTriggerBonus(scatterCount: number, math: EnvMathSpec): boolean {
  return math.bonusEnabled && scatterCount >= math.bonusTriggerCount;
}

export function getBonusFreeSpinsAward(scatterCount: number, math: EnvMathSpec): number {
  return shouldTriggerBonus(scatterCount, math) ? math.freeSpinsAward : 0;
}

export function getRetriggerFreeSpinsAward(scatterCount: number, math: EnvMathSpec): number {
  if (!math.freeSpinsRetriggerEnabled) return 0;
  return scatterCount >= math.freeSpinsRetriggerCount ? math.freeSpinsRetriggerAward : 0;
}

