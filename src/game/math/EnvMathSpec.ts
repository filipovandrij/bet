import type { SymbolId } from '../slot/SymbolIds';

export type PayCount = 3 | 4 | 5;

export interface EnvMathSpec {
  reels: number;
  rows: number;

  betMin: number;
  betMax: number;
  betStep: number;

  hitRate: number;
  bonusTargetFrequency: number;

  symbols: SymbolId[];
  weights: Record<SymbolId, number>;

  wildSubstitutes: boolean;
  wildPaysItself: boolean;

  scatterSymbol: SymbolId;
  bonusEnabled: boolean;
  bonusTriggerCount: number;
  scatterPays: boolean;
  scatterPay: Partial<Record<PayCount, number>>;

  paytable: Partial<Record<Exclude<SymbolId, 'SCATTER'>, Partial<Record<PayCount, number>>>>;

  freeSpinsAward: number;
  freeSpinsWinMult: number;
  freeSpinsRetriggerEnabled: boolean;
  freeSpinsRetriggerCount: number;
  freeSpinsRetriggerAward: number;

  bigWinThresholdXBet: number;

  rngSeed: number; // 0 => random
  qaForceBonus: boolean;
  qaForceWin: boolean;
  qaForceSymbol: SymbolId | '';
  qaLog: boolean;
}

function num(v: any, def: number): number {
  if (v === undefined || v === null) return def;
  if (typeof v === 'number') return Number.isFinite(v) ? v : def;

  // Be tolerant to ".env" values that include comments or extra tokens, e.g.:
  // "10 # comment" or "1   PAY_A_4=3" (user accidentally put multiple keys on one line).
  const s = String(v).trim();
  if (!s) return def;
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return def;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : def;
}

function bool(v: any, def = false): boolean {
  if (v === undefined || v === null || v === '') return def;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function symList(v: any, fallback: SymbolId[]): SymbolId[] {
  const s = typeof v === 'string' ? v : '';
  if (!s) return fallback;
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map(mapEnvSymbol)
    .filter((x): x is SymbolId => !!x);
}

function mapEnvSymbol(id: string): SymbolId | null {
  const u = id.toUpperCase();
  if (u === 'T') return 'T';
  if (u === 'A') return 'A';
  if (u === 'K') return 'K';
  if (u === 'Q') return 'Q';
  if (u === 'J') return 'J';
  // Backward-compat: STAR was the old scatter id.
  if (u === 'STAR') return 'SCATTER';
  if (u === 'SCATTER') return 'SCATTER';
  if (u === 'WILD') return 'WILD';
  if (u === '10') return 'T'; // tolerate older IDs
  if (u === 'CROWN') return 'CROWN';
  if (u === 'SKULL') return 'SKULL';
  if (u === 'PARROT') return 'PARROT';
  if (u === 'CANNON') return 'CANNON';
  if (u === 'CHEST_GOLD') return 'CHEST_GOLD';
  if (u === 'COMPASS') return 'COMPASS';
  return null;
}

export function loadEnvMathSpec(): EnvMathSpec {
  const e = import.meta.env as any;

  const symbols = symList(e.SYMBOLS, [
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
  ]);

  const weights: Record<SymbolId, number> = {
    A: num(e.W_A, 18),
    K: num(e.W_K, 18),
    Q: num(e.W_Q, 16),
    J: num(e.W_J, 16),
    T: num(e.W_T, 16),
    CROWN: num(e.W_CROWN, 8),
    SKULL: num(e.W_SKULL, 6),
    PARROT: num(e.W_PARROT, 6),
    CANNON: num(e.W_CANNON, 5),
    CHEST_GOLD: num(e.W_CHEST_GOLD, 4),
    COMPASS: num(e.W_COMPASS, 5),
    // Backward-compat: W_STAR
    SCATTER: num(e.W_SCATTER ?? e.W_STAR, 3),
    WILD: num(e.W_WILD, 2),
  };

  const payCounts: PayCount[] = [3, 4, 5];
  const paytable: EnvMathSpec['paytable'] = {};
  const baseSyms: Array<Exclude<SymbolId, 'SCATTER'>> = [
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
  ];

  for (let i = 0; i < baseSyms.length; i++) {
    const s = baseSyms[i]!;
    const entry: Partial<Record<PayCount, number>> = {};
    for (let j = 0; j < payCounts.length; j++) {
      const c = payCounts[j]!;
      const key = `PAY_${s}_${c}`;
      const v = e[key];
      if (v !== undefined && v !== '') entry[c] = num(v, 0);
    }
    paytable[s] = entry;
  }

  const scatterPay: Partial<Record<PayCount, number>> = {};
  for (let j = 0; j < payCounts.length; j++) {
    const c = payCounts[j]!;
    // Backward-compat: PAY_STAR_*
    const v = e[`PAY_SCATTER_${c}`] ?? e[`PAY_STAR_${c}`];
    if (v !== undefined && v !== '') scatterPay[c] = num(v, 0);
  }

  // Defaults (so game wins even without a .env file).
  const defaults: Record<Exclude<SymbolId, 'SCATTER'>, Record<PayCount, number>> = {
    A: { 3: 1, 4: 3, 5: 8 },
    K: { 3: 1, 4: 3, 5: 8 },
    Q: { 3: 1, 4: 4, 5: 10 },
    J: { 3: 1, 4: 4, 5: 10 },
    T: { 3: 2, 4: 6, 5: 15 },
    CROWN: { 3: 2, 4: 6, 5: 16 },
    SKULL: { 3: 3, 4: 10, 5: 25 },
    PARROT: { 3: 3, 4: 10, 5: 25 },
    CANNON: { 3: 4, 4: 12, 5: 30 },
    CHEST_GOLD: { 3: 5, 4: 15, 5: 40 },
    COMPASS: { 3: 4, 4: 12, 5: 30 },
    WILD: { 3: 5, 4: 20, 5: 100 },
  };
  for (let i = 0; i < baseSyms.length; i++) {
    const s = baseSyms[i]!;
    const entry = paytable[s] ?? (paytable[s] = {});
    for (let j = 0; j < payCounts.length; j++) {
      const c = payCounts[j]!;
      if (entry[c] === undefined) entry[c] = defaults[s][c];
    }
  }
  // Default scatter pay (only used if SCATTER_PAYS=1).
  if (scatterPay[3] === undefined) scatterPay[3] = 2;
  if (scatterPay[4] === undefined) scatterPay[4] = 10;
  if (scatterPay[5] === undefined) scatterPay[5] = 50;

  return {
    reels: num(e.REELS, 5),
    rows: num(e.ROWS, 3),

    betMin: num(e.BET_MIN, 10),
    betMax: num(e.BET_MAX, 1000),
    betStep: num(e.BET_STEP, 10),

    hitRate: num(e.MATH_TARGET_HIT_RATE, 0.32),
    bonusTargetFrequency: num(e.BONUS_TARGET_FREQUENCY, 0.02),

    symbols,
    weights,

    wildSubstitutes: bool(e.WILD_SUBSTITUTES, true),
    wildPaysItself: bool(e.WILD_PAYS_ITSELF, false),

    scatterSymbol: mapEnvSymbol(e.BONUS_SCATTER_SYMBOL ?? 'SCATTER') ?? 'SCATTER',
    bonusEnabled: bool(e.BONUS_ENABLED, true),
    bonusTriggerCount: num(e.BONUS_TRIGGER_COUNT, 3),
    scatterPays: bool(e.SCATTER_PAYS, false),
    scatterPay,

    paytable,

    freeSpinsAward: num(e.FREESPINS_AWARD, 5),
    freeSpinsWinMult: num(e.FREESPINS_WIN_MULT, 1.0),
    freeSpinsRetriggerEnabled: bool(e.FREESPINS_RETRIGGER_ENABLED, true),
    freeSpinsRetriggerCount: num(e.FREESPINS_RETRIGGER_COUNT, 3),
    freeSpinsRetriggerAward: num(e.FREESPINS_RETRIGGER_AWARD, 3),

    bigWinThresholdXBet: num(e.BIG_WIN_THRESHOLD_XBET, 10),

    rngSeed: num(e.RNG_SEED, 0),
    qaForceBonus: bool(e.QA_FORCE_BONUS, false),
    qaForceWin: bool(e.QA_FORCE_WIN, false),
    qaForceSymbol: (mapEnvSymbol(e.QA_FORCE_SYMBOL ?? '') ?? '') as any,
    qaLog: bool(e.QA_LOG, false),
  };
}

