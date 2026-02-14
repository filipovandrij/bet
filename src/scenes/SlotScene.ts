import { BaseScene } from './BaseScene';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { SlotConfig } from '../game/slot/SlotConfig';
import type { SymbolId } from '../game/slot/SymbolIds';
import { createRng } from '../game/slot/SlotRng';
import { SlotModel } from '../game/slot/SlotModel';
import { SlotMachineView } from '../game/slot/SlotMachineView';
import { StateMachine } from '../core/state/StateMachine';
import { Easings } from '../core/tween/Easings';
import type { SceneContext } from './SceneContext';
import { Hud } from '../ui/Hud';
import { evaluateGrid } from '../game/evaluators';
import { getBonusFreeSpinsAward, getRetriggerFreeSpinsAward, shouldTriggerBonus } from '../game/bonus';
import { WinPresenter } from '../game/winPresenter';
import { Text } from 'pixi.js';
import { loadEnvMathSpec, type EnvMathSpec } from '../game/math/EnvMathSpec';
import { PAYLINES_5X3 } from '../game/paylines';
import { HoldOverlay } from '../game/slot/HoldOverlay';
import { spinGrid } from '../game/spinLogic';
import { FloatingCoins } from '../game/fx/FloatingCoins';
import { preloadUiButtonTextures, type UiButtonTextures } from '../assets/UiButtonTextures';
import { displaySymbolLabel } from '../game/slot/SymbolIds';
import { preloadSymbolTextures } from '../game/slot/SymbolTextures';
import { preloadBackgroundTexture } from '../assets/BackgroundTexture';
import { preloadUiBarTexture } from '../assets/UiBarTexture';
import { PirateFx } from '../game/fx/PirateFx';
import { ChainLockFx } from '../game/fx/ChainLockFx';

type SlotState = 'IDLE' | 'SPINNING' | 'RESULT' | 'BONUS' | 'WIN_PRESENTATION';

export class SlotScene extends BaseScene {
  private math!: EnvMathSpec;
  private rng!: () => number;
  private model!: SlotModel;

  private textures!: Record<SymbolId, Texture>;
  private machine!: SlotMachineView;
  private uiButtons!: UiButtonTextures;
  private cabinet!: Container;
  private cabinetFx!: Container;
  private holdOverlay!: HoldOverlay;
  private slotFxLayer!: Container;
  private pirateFx!: PirateFx;
  private chainLockFx!: ChainLockFx;
  private decorCoins!: FloatingCoins;
  private bgTexture!: Texture;
  private uiBarTexture!: Texture;

  private prevGrid: SymbolId[][] | null = null;
  private heldReels: boolean[] | null = null;

  private paylineGuide!: Graphics;

  private hud!: Hud;
  private presenter!: WinPresenter;

  private cabinetBump = 0;
  private shakeStrength = 0;
  private shakeTimeLeft = 0;
  private cabinetBaseX = 0;

  private balance = 1000;
  private bet = 10;
  private lastWin = 0;
  private freeSpins = 0;
  private totalSpins = 0;

  private spinSeq = 0;

  private readonly state = new StateMachine<SlotState>(
    'IDLE',
    {
      IDLE: ['SPINNING'],
      SPINNING: ['RESULT'],
      RESULT: ['BONUS', 'WIN_PRESENTATION', 'IDLE'],
      BONUS: ['WIN_PRESENTATION'],
      WIN_PRESENTATION: ['IDLE', 'SPINNING'],
    },
    {
      onEnter: {
        IDLE: () => this.syncUi(),
        SPINNING: () => this.syncUi(),
        RESULT: () => this.syncUi(),
        BONUS: () => this.syncUi(),
        WIN_PRESENTATION: () => this.syncUi(),
      },
    },
  );

  // Tweened timer value (so we can use the tween system for delays).
  private resultTimer = 0;

  override async enter(ctx: SceneContext): Promise<void> {
    super.enter(ctx);

    // Load UI button textures once.
    this.uiButtons = await preloadUiButtonTextures();
    this.uiBarTexture = await preloadUiBarTexture();

    this.bgTexture = await preloadBackgroundTexture();

    this.math = loadEnvMathSpec() as any;
    // Keep visuals consistent with current prototype dimensions.
    (this.math as any).reels = SlotConfig.reels.count;
    (this.math as any).rows = SlotConfig.reels.rows;

    this.rng = createRng(this.math.rngSeed === 0 ? undefined : this.math.rngSeed);
    this.model = new SlotModel(this.rng, this.math);

    this.bet = clampToStep(this.bet, this.math.betMin, this.math.betMax, this.math.betStep);

    this.buildBackground();
    this.textures = await preloadSymbolTextures();
    this.buildCabinet();
    // Prefer real chain/lock textures from /public if present.
    await this.chainLockFx.preloadPublicTextures();
    this.buildHud();

    this.presenter = new WinPresenter({
      machine: this.machine,
      hud: this.hud,
      tweens: this.ctx.tweens,
      effects: this.cabinetFx,
      ui: this.layers.ui,
    });

    this.syncUi();
    this.syncHud();
  }

  override update(dt: number): void {
    // Scene can be ticked during async `enter()` (asset loads).
    if (!this.machine) return;
    this.machine.update(dt);
    this.holdOverlay?.update(dt);
    this.pirateFx?.update(dt);
    this.decorCoins?.update(dt);

    // Subtle cabinet breathing (polish).
    const t = performance.now() * 0.001;
    this.layers.background.alpha = 0.99 + Math.sin(t * 0.6) * 0.01;

    // Cabinet bump (anticipation) + shake (lose feedback).
    const breathe = 1 + Math.sin(t * 0.7) * 0.004;
    const bump = 1 + this.cabinetBump * 0.02;
    this.cabinet.scale.set(breathe * bump);

    if (this.shakeTimeLeft > 0) {
      this.shakeTimeLeft -= dt;
      const s = this.shakeStrength;
      this.cabinet.x = this.cabinetBaseX + Math.sin(t * 42) * 9 * s;
      if (this.shakeTimeLeft <= 0) this.cabinet.x = this.cabinetBaseX;
    }
  }

  private syncUi(): void {
    const idle = this.state.state === 'IDLE';
    const canManualSpin = idle && this.freeSpins <= 0;

    // Hide all controls while reels are spinning / presenting results.
    this.hud?.setControlsVisible(canManualSpin);

    this.hud?.setSpinEnabled(canManualSpin);
    this.hud?.setSpinLabel(this.freeSpins > 0 ? 'FREE SPINS' : idle ? 'SPIN' : 'SPINNING...');

    // Bet changes only allowed when idle and not in free spins.
    this.hud?.setInteractionEnabled(canManualSpin);
  }

  private buildBackground(): void {
    const w = SlotConfig.design.width;
    const h = SlotConfig.design.height;
    const bg = new Container();

    // Background image (cover).
    const s = new Sprite(this.bgTexture);
    (s as any).eventMode = 'none';
    s.anchor.set(0.5);
    s.x = w * 0.5;
    s.y = h * 0.5;
    const texW = this.bgTexture.width || 1;
    const texH = this.bgTexture.height || 1;
    bg.addChild(s);

    this.layers.background.addChild(bg);
  }

  private buildCabinet(): void {
    const { panelWidth, panelHeight, panelRadius, uiBottomMargin } = SlotConfig.layout;

    this.cabinet = new Container();
    this.cabinet.x = SlotConfig.design.width * 0.5;
    // Move cabinet slightly up (HUD is now bottom bar).
    this.cabinet.y = SlotConfig.design.height * 0.5 - 40;
    this.cabinetBaseX = this.cabinet.x;
    this.layers.game.addChild(this.cabinet);


    this.machine = new SlotMachineView({
      textures: this.textures,
      tweens: this.ctx.tweens,
      rng: this.rng,
    });
    this.machine.y = -16;

    // Decorative layer behind reels (depth, low contrast).
    const coinTex = this.buildCoinTexture();
    this.decorCoins = new FloatingCoins({
      texture: coinTex,
      count: 18,
      x: -this.machine.windowWidth / 2 + 30,
      y: this.machine.y - this.machine.windowHeight / 2 + 24,
      width: this.machine.windowWidth - 60,
      height: this.machine.windowHeight - 48,
      rng: this.rng,
      alphaMin: 0.05,
      alphaMax: 0.12,
      scaleMin: 0.18,
      scaleMax: 0.34,
    });
    this.cabinet.addChild(this.decorCoins);

    // Glass panel behind reels to keep it bright/readable.
    const glass = new Graphics()
      .roundRect(
        -this.machine.windowWidth / 2,
        this.machine.y - this.machine.windowHeight / 2,
        this.machine.windowWidth,
        this.machine.windowHeight,
        this.machine.windowRadius,
      )
      .fill({ color: 0xffffff, alpha: 0.08 })
      .stroke({ color: 0xffffff, width: 2, alpha: 0.10 });
    this.cabinet.addChild(glass);

    this.cabinet.addChild(this.machine);

    this.cabinetFx = new Container();
    // Effects are attached to the machine so coordinate space matches symbol centers.
    this.machine.addChild(this.cabinetFx);

    // Dedicated FX layer above reels (below HUD).
    this.slotFxLayer = new Container();
    (this.slotFxLayer as any).eventMode = 'none';
    this.machine.addChild(this.slotFxLayer);

    this.chainLockFx = new ChainLockFx({ machine: this.machine, tweens: this.ctx.tweens });
    // Generate placeholder textures via renderer.
    this.chainLockFx.initWithGeneratedTextures((g) => this.ctx.renderer.generateTexture({ target: g, resolution: 2 }));
    this.slotFxLayer.addChild(this.chainLockFx);

    this.pirateFx = new PirateFx({ tweens: this.ctx.tweens });
    // Position pirate near top-left of the reels window.
    this.pirateFx.x = -this.machine.windowWidth + 200 ;
    this.pirateFx.y = -this.machine.windowHeight * 0.5 + 90;
    this.pirateFx.scale.set(0.14);
    this.slotFxLayer.addChild(this.pirateFx);

    // Always-on payline guides (very subtle, helps readability).
    this.paylineGuide = new Graphics();
    this.paylineGuide.alpha = 0.03;
    this.paylineGuide.blendMode = 'add';
    this.machine.addChild(this.paylineGuide);
    this.drawPaylineGuides();

    this.holdOverlay = new HoldOverlay({ machine: this.machine });
    this.machine.addChild(this.holdOverlay);

    // SPIN button moved into the bottom HUD panel.
  }

  private drawPaylineGuides(): void {
    const g = this.paylineGuide;
    g.clear();

    for (let i = 0; i < PAYLINES_5X3.length; i++) {
      const line = PAYLINES_5X3[i]!;
      const rows = line.rows;

      const p0 = this.machine.getSymbolCenter(0, rows[0]!);
      g.moveTo(p0.x, p0.y);
      for (let r = 1; r < rows.length; r++) {
        const p = this.machine.getSymbolCenter(r, rows[r]!);
        g.lineTo(p.x, p.y);
      }
      g.stroke({ width: 5, color: 0xffffff, alpha: 0.35, cap: 'round' });
    }
  }

  private buildHud(): void {
    const hudW = SlotConfig.design.width - 640
    this.hud = new Hud({ tweens: this.ctx.tweens, width: hudW, uiButtons: this.uiButtons, barTexture: this.uiBarTexture });
    // Solid top panel centered (dynamic width).
    this.hud.x = 300;
    this.hud.y = SlotConfig.design.height - this.hud.getHeight() - 12;
    this.hud.onBetMinus = () => this.changeBet(-10);
    this.hud.onBetPlus = () => this.changeBet(+10);
    this.hud.onBalanceAdd = () => this.addCredits(1000);
    this.hud.onSpin = () => this.requestSpin();
    this.layers.ui.addChild(this.hud);
  }

  private buildCoinTexture(): Texture {
    const g = new Graphics()
      .circle(0, 0, 46)
      .fill({ color: 0xffd36b, alpha: 1 })
      .circle(-10, -12, 16)
      .fill({ color: 0xffffff, alpha: 0.55 })
      .circle(10, 12, 26)
      .fill({ color: 0xffb13a, alpha: 0.55 })
      .circle(0, 0, 46)
      .stroke({ color: 0xfff0c2, width: 6, alpha: 0.55 });

    const tex = this.ctx.renderer.generateTexture({ target: g, resolution: 2 });
    g.destroy();
    return tex;
  }

  private addCredits(amount: number): void {
    this.balance += amount;
    this.hud.setBalance(this.balance);
    this.hud.setLastSpinText(`CREDITS +${amount} • BAL ${this.balance}`);
  }

  private syncHud(): void {
    this.hud.setBalance(this.balance);
    this.hud.setBet(this.bet);
    this.hud.setWin(this.lastWin);
    this.hud.setFreeSpins(this.freeSpins);
    this.hud.setSpins(this.totalSpins);
  }

  private changeBet(delta: number): void {
    if (this.state.state !== 'IDLE') return;
    if (this.freeSpins > 0) return;
    const next = clampToStep(this.bet + delta, this.math.betMin, this.math.betMax, this.math.betStep);
    if (next === this.bet) return;
    this.bet = next;
    this.hud.setBet(this.bet);
  }

  private requestSpin(forceFree = false): void {
    if (!this.state.can('SPINNING')) return;
    if (this.state.state !== 'IDLE') return;

    const isFreeSpin = this.freeSpins > 0;
    const isRespin = forceFree && this.freeSpins <= 0;
    const isAnyFree = isFreeSpin || isRespin;

    if (!isAnyFree && this.balance < this.bet) {
      // Simple feedback: quick shake to indicate not enough balance.
      this.shakeLose();
      return;
    }

    if (isFreeSpin) {
      this.freeSpins -= 1;
      this.hud.setFreeSpins(this.freeSpins);
    } else if (!isRespin) {
      this.balance -= this.bet;
      this.hud.setBalance(this.balance);
    }

    this.totalSpins += 1;
    this.hud.setSpins(this.totalSpins);

    this.lastWin = 0;
    this.hud.setWin(this.lastWin);
    this.hud.setLastSpinText(
      isRespin
        ? `RESPIN • WIN +0 • BAL ${this.balance}`
        : isFreeSpin
        ? `FREE SPIN • WIN +0 • BAL ${this.balance}`
        : `BET -${this.bet} • WIN +0 • BAL ${this.balance}`,
    );

    if (this.math.qaLog) {
      const seq = ++this.spinSeq;
      const holdNow = (this.heldReels ?? []).map((v, i) => (v ? i + 1 : 0)).filter(Boolean);
      console.groupCollapsed(
        `[SPIN#${seq}] request • ${isFreeSpin ? 'FREE' : isRespin ? 'RESPIN' : 'PAID'} • bet=${this.bet} • bal=${this.balance} • holdNow=${holdNow.join(',') || '-'}`,
      );
      console.log({ state: this.state.state, freeSpins: this.freeSpins, totalSpins: this.totalSpins });
      console.groupEnd();
    }

    this.startSpinFlow();
  }

  private startSpinFlow(): void {
    this.state.set('SPINNING');

    this.machine.clearFeedback();
    this.presenter?.clear();
    this.paylineGuide.visible = false;
    this.shakeTimeLeft = 0;
    this.cabinet.x = this.cabinetBaseX;

    // HOLD applies to THIS spin only (based on previous spin result).
    const freezeReels = this.heldReels ?? undefined;
    // Keep chain overlay visible for reels frozen on THIS spin.
    this.chainLockFx?.setHeld(freezeReels);
    const grid = spinGrid(this.model, this.prevGrid, this.heldReels);

    const seq = this.math.qaLog ? this.spinSeq : 0;
    if (this.math.qaLog) {
      console.groupCollapsed(`[SPIN#${seq}] startSpinFlow`);
      console.log('freezeReels (1-based):', (freezeReels ?? []).map((v, i) => (v ? i + 1 : 0)).filter(Boolean));
      console.log('grid (reels x rows ids):', grid);
      console.table(
        [0, 1, 2].map((row) => ({
          row,
          c1: `${grid[0]?.[row]} ${displaySymbolLabel(grid[0]?.[row] as any)}`,
          c2: `${grid[1]?.[row]} ${displaySymbolLabel(grid[1]?.[row] as any)}`,
          c3: `${grid[2]?.[row]} ${displaySymbolLabel(grid[2]?.[row] as any)}`,
          c4: `${grid[3]?.[row]} ${displaySymbolLabel(grid[3]?.[row] as any)}`,
          c5: `${grid[4]?.[row]} ${displaySymbolLabel(grid[4]?.[row] as any)}`,
        })),
      );
      console.groupEnd();
    }

    // Small "anticipation" bump to cabinet.
    this.ctx.tweens.killTweensOf(this);
    this.cabinetBump = 0;
    this.ctx.tweens.to(this, { cabinetBump: 1 }, 0.12, { ease: Easings.outBack });
    this.ctx.tweens.to(this, { cabinetBump: 0 }, 0.22, {
      ease: Easings.outCubic,
      delay: 0.12,
    });

    const speedMul = 1;
    const stepsMul = 1;

    this.machine.spinTo(
      grid,
      async () => {
      this.state.set('RESULT');

      const inFreeSpins = this.freeSpins > 0;

      // Verify what is actually visible on screen matches the data grid.
      // This runs at the exact moment the reels stop (before evaluation/presentation).
      if (this.math.qaLog) {
        const visible = this.machine.debugDumpVisible();
        let mismatch = false;
        for (let i = 0; i < visible.length; i++) {
          const v = visible[i]!;
          const expected = grid[v.col]?.[v.row];
          if (expected !== v.id) {
            mismatch = true;
            break;
          }
        }
        console.groupCollapsed(`[SPIN#${seq}] renderAudit`);
        console.log('expected grid[col][row]:', grid);
        console.table(visible.map((v) => ({
          col: v.col + 1,
          row: v.row,
          id: v.id,
          tex: v.textureKey,
          expected: grid[v.col]?.[v.row],
          ok: grid[v.col]?.[v.row] === v.id,
        })));
        if (mismatch) {
          console.warn('[renderAudit] MISMATCH: visible ids do not match grid[col][row].');
        } else {
          console.log('[renderAudit] OK: visible ids match grid[col][row].');
        }
        console.groupEnd();
      }

      const evaluated = evaluateGrid(grid, this.bet, this.math, inFreeSpins);

      if (this.math.qaLog) {
        console.groupCollapsed(`[SPIN#${seq}] evaluated`);
        console.log('inFreeSpins:', inFreeSpins);
        console.log('scatter:', { symbol: this.math.scatterSymbol, count: evaluated.scatterCount, win: evaluated.scatterWinAmount });
        console.log(
          'winLines:',
          evaluated.winLines.map((w) => ({
            lineId: w.lineId,
            symbol: w.symbol,
            count: w.count,
            amount: w.amount,
            usedWild: w.usedWild,
            positions: w.positions.map((p) => `${p.reel + 1}:${p.row}`).join(' '),
          })),
        );
        console.log('winAmount:', evaluated.winAmount);
        console.log(
          'heldReelsNext raw (1-based):',
          evaluated.heldReelsNext.map((v, i) => (v ? i + 1 : 0)).filter(Boolean),
        );
        console.groupEnd();
      }

      const bonusAward = getBonusFreeSpinsAward(evaluated.scatterCount, this.math);
      const retriggerAward = inFreeSpins ? getRetriggerFreeSpinsAward(evaluated.scatterCount, this.math) : 0;
      const award = bonusAward + retriggerAward;

      // Reel HOLD: 1-spin duration.
      // Important: a reel that was held THIS spin must NOT re-hold itself just because it stayed frozen with a WILD.
      // Only reels that actually spun can "create" a HOLD for the next spin.
      if (inFreeSpins) {
        this.heldReels = new Array(grid.length).fill(false);
      } else {
        const nextHeld = evaluated.heldReelsNext.slice();
        if (freezeReels) {
          for (let i = 0; i < nextHeld.length; i++) {
            if (freezeReels[i]) nextHeld[i] = false;
          }
        }
        this.heldReels = nextHeld;
      }
      this.holdOverlay.setHeld(this.heldReels);

      // HOLD FX: pirate shoot + chain locks.
      // - Unlock reels that are no longer held (immediate)
      // - Newly locked reels appear exactly at the shot moment
      const nextHeld = this.heldReels ?? new Array(SlotConfig.reels.count).fill(false);
      const freeze = freezeReels ?? new Array(SlotConfig.reels.count).fill(false);
      const newLocks1Based: number[] = [];
      const unlocks1Based: number[] = [];
      for (let i = 0; i < nextHeld.length; i++) {
        if (freeze[i] && !nextHeld[i]) unlocks1Based.push(i + 1);
        if (nextHeld[i] && !freeze[i]) newLocks1Based.push(i + 1);
      }
      if (unlocks1Based.length) {
        console.log('[HOLD] unlock reels (1-based):', unlocks1Based);
        for (let i = 0; i < unlocks1Based.length; i++) this.chainLockFx?.hideLock(unlocks1Based[i]!);
      }
      if (newLocks1Based.length) {
        console.log('[HOLD] new locks (1-based):', newLocks1Based);
        await this.pirateFx.playHoldShoot(newLocks1Based, () => {
          console.log('[HOLD] apply chain locks on shot:', newLocks1Based);
          for (let i = 0; i < newLocks1Based.length; i++) this.chainLockFx?.showLock(newLocks1Based[i]!);
        });
        // Ensure persistent visibility for next spin.
        this.chainLockFx?.setHeld(nextHeld);
      } else {
        // No new locks: just sync visibility to next held state.
        this.chainLockFx?.setHeld(nextHeld);
      }

      if (this.math.qaLog) {
        console.groupCollapsed(`[SPIN#${seq}] holdDecision`);
        console.log(
          'freezeReels this spin (1-based):',
          (freezeReels ?? []).map((v, i) => (v ? i + 1 : 0)).filter(Boolean),
        );
        console.log(
          'heldReels next spin (1-based):',
          (this.heldReels ?? []).map((v, i) => (v ? i + 1 : 0)).filter(Boolean),
        );
        console.groupEnd();
      }

      if (award > 0) {
        this.state.set('BONUS');
        if (shouldTriggerBonus(evaluated.scatterCount, this.math) || retriggerAward > 0) {
          await this.showBonusPopup(award);
        }
        this.freeSpins += award;
        this.hud.setFreeSpins(this.freeSpins);
      }

      if (evaluated.winAmount > 0) {
        this.flashWin();
      } else if (award <= 0) {
        // Only shake on "dead" spins (no win and no bonus).
        this.shakeLose();
      }

      this.state.set('WIN_PRESENTATION');
      await this.presenter.present({
        winLines: evaluated.winLines,
        totalWin: evaluated.winAmount,
        bet: this.bet,
        bigWinThresholdXBet: this.math.bigWinThresholdXBet,
        extraHighlights: evaluated.scatterWinAmount > 0 ? evaluated.scatterPositions : undefined,
      });

      if (evaluated.winAmount > 0) {
        this.balance += evaluated.winAmount;
        this.hud.setBalance(this.balance);
        this.lastWin = evaluated.winAmount;
      }
      const winTag =
        evaluated.winLines.length > 0
          ? `L${evaluated.winLines[0]!.lineId} ${evaluated.winLines[0]!.symbol}x${evaluated.winLines[0]!.count}${evaluated.winLines[0]!.usedWild ? ' +WILD' : ''}`
          : evaluated.scatterWinAmount > 0
          ? `SCATTER x${evaluated.scatterCount}`
          : '';
      const holdTag =
        this.heldReels?.some(Boolean)
          ? `HOLD ${this.heldReels
              .map((v, i) => (v ? String(i + 1) : ''))
              .filter(Boolean)
              .join(',')}`
          : '';
      this.hud.setLastSpinText(
        `${this.freeSpins > 0 ? 'FREE SPIN' : `BET -${this.bet}`} • WIN +${evaluated.winAmount} • BAL ${this.balance} ${winTag ? `• ${winTag}` : ''} ${holdTag ? `• ${holdTag}` : ''}`,
      );

      // Short settle, then either auto-continue free spins or go idle.
      await this.delay(0.35);

      this.state.set('IDLE');
      this.paylineGuide.visible = true;
      this.syncUi();
      this.syncHud();

      // Save last stopped grid for HOLD logic.
      this.prevGrid = grid;

      if (this.freeSpins > 0) {
        // Auto-spin free spins, no manual input.
        this.ctx.tweens.to(this, { resultTimer: 1 }, 0.35, {
          ease: Easings.linear,
          onComplete: () => this.requestSpin(),
        });
        return;
      }
    },
      { freezeReels, speedMul, stepsMul },
    );
  }

  private delay(seconds: number): Promise<void> {
    this.ctx.tweens.killTweensOf(this);
    this.resultTimer = 0;
    return new Promise((resolve) => {
      this.ctx.tweens.to(this, { resultTimer: 1 }, Math.max(0.001, seconds), {
        ease: Easings.linear,
        onComplete: resolve,
      });
    });
  }

  private async showBonusPopup(freeSpins: number): Promise<void> {
    const popup = new Container();
    popup.x = SlotConfig.design.width * 0.5;
    popup.y = 220;
    popup.alpha = 0;
    popup.scale.set(0.88);

    const bg = new Graphics()
      .roundRect(-420, -110, 840, 220, 44)
      .fill({ color: 0xffffff, alpha: 0.14 })
      .stroke({ color: 0xffc857, width: 3, alpha: 0.8 });

    const txt = new Text({
      text: `BONUS!\nFREE SPINS x${freeSpins}`,
      style: {
        fontFamily: 'system-ui, Segoe UI, Arial',
        fontSize: 56,
        fontWeight: '900',
        fill: 0xffffff,
        align: 'center',
        dropShadow: {
          color: 0x0b0f1a,
          alpha: 0.65,
          blur: 10,
          distance: 0,
        },
      },
    });
    txt.anchor.set(0.5);

    popup.addChild(bg, txt);
    this.layers.ui.addChild(popup);

    await new Promise<void>((resolve) => {
      this.ctx.tweens.to(popup, { alpha: 1 }, 0.14, { ease: Easings.outCubic });
      this.ctx.tweens.to(popup.scale, { x: 1, y: 1 }, 0.32, { ease: Easings.outBack });
      this.ctx.tweens.to(popup, { alpha: 0 }, 0.22, {
        ease: Easings.outCubic,
        delay: 0.95,
        onComplete: () => {
          popup.destroy({ children: true });
          resolve();
        },
      });
    });
  }

  private flashWin(): void {
    const fx = new Graphics()
      .roundRect(0, 0, SlotConfig.design.width, SlotConfig.design.height, 0)
      .fill({ color: 0xffffff, alpha: 1 });
    fx.alpha = 0;
    fx.blendMode = 'add';
    this.layers.effects.addChild(fx);

    this.ctx.tweens.to(fx, { alpha: 0.12 }, 0.08, { ease: Easings.outCubic });
    this.ctx.tweens.to(fx, { alpha: 0 }, 0.22, {
      ease: Easings.outCubic,
      delay: 0.08,
      onComplete: () => fx.destroy(),
    });
  }

  private shakeLose(): void {
    // Small loss shake: quick left/right with decay (time-based, no timers).
    this.ctx.tweens.killTweensOf(this);
    this.shakeStrength = 0;
    this.shakeTimeLeft = 0.32;
    this.ctx.tweens.to(this, { shakeStrength: 1 }, 0.08, { ease: Easings.outCubic });
    this.ctx.tweens.to(this, { shakeStrength: 0 }, 0.24, { ease: Easings.outBounce, delay: 0.08 });
  }

  // Symbol textures are loaded via `SymbolTextures.ts`.
}

function clampToStep(v: number, min: number, max: number, step: number): number {
  const clamped = Math.max(min, Math.min(max, v));
  const s = Math.max(1, step);
  return Math.round(clamped / s) * s;
}

