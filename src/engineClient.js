/** Cliente del motor: Web Worker propio, cancelable, con promesas. */
export class EngineClient {
  constructor() { this.seq = 0; this.pending = new Map(); this.spawn(); }

  spawn() {
    this.worker = new Worker(new URL('./engine/worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data); else p.reject(new Error(e.data.error));
    };
    this.worker.onerror = (e) => { for (const p of this.pending.values()) p.reject(e); this.pending.clear(); };
  }

  /** @returns {Promise<{move:string, score:number, depth:number, nodes:number, pv:string[]}>} */
  search({ fen, moves, level, timeMs }) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type: 'search', fen, moves, level, timeMs });
    });
  }

  get busy() { return this.pending.size > 0; }

  /** Cancela cualquier búsqueda en curso (termina el worker y crea otro). */
  cancel() {
    if (!this.pending.size) return;
    this.worker.terminate();
    for (const p of this.pending.values()) p.reject(new Error('cancelado'));
    this.pending.clear();
    this.spawn();
  }

  newGame() { this.worker.postMessage({ type: 'reset' }); }
}
