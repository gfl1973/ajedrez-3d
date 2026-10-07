// Pruebas del motor: perft frente a valores de referencia y partidas CPU vs CPU validadas con chess.js
import { Position, Searcher, LEVELS } from '../src/engine/core.js';
import { Chess } from 'chess.js';

let fail = 0;
const ok = (c, msg) => { console.log((c ? '  ✔ ' : '  ✘ ') + msg); if (!c) fail++; };

console.log('Perft:');
const PERFT = [
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 4, 197281],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 3, 97862],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 5, 674624],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', 4, 422333],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', 3, 62379],
  ['r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', 3, 89890],
];
for (const [fen, d, exp] of PERFT) {
  const t = Date.now(); const n = Position.fromFen(fen).perft(d);
  ok(n === exp, `perft(${d}) = ${n} (esperado ${exp}) ${Date.now() - t} ms`);
}

console.log('Mates sencillos:');
{
  const s = new Searcher();
  const r = s.think(Position.fromFen('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1'), 5);
  ok(r.move === 'd1d8', `mate del pasillo encontrado: ${r.move}`);
  const r2 = s.think(Position.fromFen('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4'), 4);
  ok(r2.move === 'f3f7', `mate del pastor encontrado: ${r2.move}`);
}

console.log('Legalidad por nivel (comprobada con chess.js):');
for (let lvl = 1; lvl <= 6; lvl++) {
  const s = new Searcher();
  const chess = new Chess();
  let plies = 0;
  const t = Date.now();
  const maxPlies = lvl <= 3 ? 40 : 12;
  while (!chess.isGameOver() && plies < maxPlies) {
    const pos = Position.fromFen(chess.fen());
    const r = s.think(pos, lvl, lvl >= 5 ? 300 : undefined);
    const mv = { from: r.move.slice(0, 2), to: r.move.slice(2, 4), promotion: r.move[4] };
    let res = null;
    try { res = chess.move(mv); } catch { res = null; }
    if (!res) { ok(false, `nivel ${lvl}: jugada ilegal ${r.move} en ${chess.fen()}`); break; }
    plies++;
  }
  ok(true, `nivel ${lvl} (${LEVELS[lvl].name}): ${plies} jugadas legales en ${Date.now() - t} ms — ${chess.history().slice(0, 14).join(' ')}…`);
}

console.log('Rendimiento:');
{
  const s = new Searcher();
  const r = s.think(Position.fromFen('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'), 6, 2000);
  ok(r.depth >= 5, `nivel 6 en 2 s: profundidad ${r.depth}, ${r.nodes} nodos (${Math.round(r.nodes / (r.ms / 1000))} n/s), jugada ${r.move}, PV ${r.pv.join(' ')}`);
}

console.log(fail ? `\n${fail} prueba(s) fallida(s)` : '\nTodas las pruebas superadas ✔');
process.exit(fail ? 1 : 0);
