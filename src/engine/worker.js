import { Position, Searcher } from './core.js';

const searcher = new Searcher();

self.onmessage = (e) => {
  const { id, type, fen, moves, level, timeMs } = e.data;
  if (type === 'reset') { searcher.clear(); return; }
  try {
    const pos = Position.fromFen(fen);
    for (const uci of moves || []) if (!pos.makeUci(uci)) throw new Error('Jugada ilegal en historial: ' + uci);
    const res = searcher.think(pos, level, timeMs);
    self.postMessage({ id, ok: true, ...res });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
