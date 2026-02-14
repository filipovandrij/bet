export const DefaultSymbolIds = [
  'A',
  'K',
  'Q',
  'J',
  'T',
  'CROWN',
  'SKULL',
  'PARROT',
  'CANNON',
  'CHEST_GOLD',
  'COMPASS',
  'WILD',
  'SCATTER',
] as const;
export type SymbolId = (typeof DefaultSymbolIds)[number];

export function randomSymbol(rng: () => number): SymbolId {
  const i = (rng() * DefaultSymbolIds.length) | 0;
  return DefaultSymbolIds[i]!;
}

export function displaySymbolLabel(id: SymbolId): string {
  // Debug-only. Rendering uses textures now.
  return id;
}

