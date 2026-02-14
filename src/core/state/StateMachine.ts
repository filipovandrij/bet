export type StateKey = string;

export type TransitionMap<S extends StateKey> = Partial<Record<S, readonly S[]>>;

export interface StateMachineHooks<S extends StateKey> {
  onEnter?: Partial<Record<S, () => void>>;
  onExit?: Partial<Record<S, () => void>>;
}

export class StateMachine<S extends StateKey> {
  private readonly allowed: TransitionMap<S>;
  private readonly hooks: StateMachineHooks<S>;
  private _state: S;

  constructor(initial: S, allowed: TransitionMap<S>, hooks: StateMachineHooks<S> = {}) {
    this._state = initial;
    this.allowed = allowed;
    this.hooks = hooks;
  }

  get state(): S {
    return this._state;
  }

  can(next: S): boolean {
    if (next === this._state) return true;
    const list = this.allowed[this._state];
    return !!list && list.includes(next);
  }

  set(next: S): void {
    if (!this.can(next)) return;
    if (next === this._state) return;
    const prev = this._state;
    this.hooks.onExit?.[prev]?.();
    this._state = next;
    this.hooks.onEnter?.[next]?.();
  }
}

