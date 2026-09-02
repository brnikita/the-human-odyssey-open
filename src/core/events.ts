export type GameEventMap = {
  notify: { text: string; kind?: 'info' | 'warn' | 'good' | 'discovery' | 'neuron' };
  discovery: { id: string; name: string; kind: string };
  neuronEnergy: { amount: number; total: number };
  playerDied: { cause: string };
  lineageLost: undefined;
  generation: { generation: number };
  feat: { id: string; name: string };
  stateChange: { state: string };
  panic: { started: boolean };
  attackWarning: { species: string };
  sound: { name: string; volume?: number; position?: { x: number; y: number; z: number } };
};

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<string, Set<Handler<unknown>>>();

  on<K extends keyof GameEventMap>(name: K, fn: Handler<GameEventMap[K]>): () => void {
    let set = this.handlers.get(name);
    if (!set) { set = new Set(); this.handlers.set(name, set); }
    set.add(fn as Handler<unknown>);
    return () => set!.delete(fn as Handler<unknown>);
  }

  emit<K extends keyof GameEventMap>(name: K, payload: GameEventMap[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const fn of set) fn(payload);
  }
}
