/**
 * Motor de ajedrez propio — representación 0x88.
 * Negamax con poda alfa-beta, PVS, profundización iterativa con límite de tiempo,
 * tabla de transposición (Zobrist), ordenación de jugadas (TT, MVV-LVA, killers,
 * historia), poda de movimiento nulo, LMR, extensión de jaque y búsqueda de quietud.
 */

export const WHITE = 0, BLACK = 1;
export const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;

const F_CAP = 1, F_EP = 2, F_CASTLE = 4, F_DOUBLE = 8;
const MATE = 30000;
const INF = 32000;
const MAX_PLY = 64;
const STACK = 4096;

const KNIGHT_OFF = [33, 31, 18, 14, -33, -31, -18, -14];
const KING_OFF = [1, -1, 16, -16, 15, 17, -15, -17];
const BISHOP_DIR = [15, 17, -15, -17];
const ROOK_DIR = [1, -1, 16, -16];
const VALUE = [0, 100, 320, 330, 500, 900, 20000];
const PHASE_W = [0, 0, 1, 1, 2, 4, 0];

// --- Zobrist (PRNG con semilla para que sea determinista) ---
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0);
  };
}
const rnd = mulberry32(0xC0FFEE);
const Z_PIECE_LO = new Int32Array(16 * 128), Z_PIECE_HI = new Int32Array(16 * 128);
for (let i = 0; i < Z_PIECE_LO.length; i++) { Z_PIECE_LO[i] = rnd() | 0; Z_PIECE_HI[i] = rnd() | 0; }
const Z_CASTLE_LO = new Int32Array(16), Z_CASTLE_HI = new Int32Array(16);
for (let i = 0; i < 16; i++) { Z_CASTLE_LO[i] = rnd() | 0; Z_CASTLE_HI[i] = rnd() | 0; }
const Z_EP_LO = new Int32Array(8), Z_EP_HI = new Int32Array(8);
for (let i = 0; i < 8; i++) { Z_EP_LO[i] = rnd() | 0; Z_EP_HI[i] = rnd() | 0; }
const Z_SIDE_LO = rnd() | 0, Z_SIDE_HI = rnd() | 0;

const CASTLE_MASK = new Int8Array(128).fill(15);
CASTLE_MASK[0x00] = 15 & ~2; CASTLE_MASK[0x07] = 15 & ~1; CASTLE_MASK[0x04] = 15 & ~3;
CASTLE_MASK[0x70] = 15 & ~8; CASTLE_MASK[0x77] = 15 & ~4; CASTLE_MASK[0x74] = 15 & ~12;

// --- Tablas de piezas/casillas (perspectiva blanca, a8 primero) ---
const PST_MG = {
  1: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 22, 22, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  2: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  3: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  4: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  5: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  6: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
};
const PST_EG = {
  ...PST_MG,
  1: [0, 0, 0, 0, 0, 0, 0, 0, 80, 80, 80, 80, 80, 80, 80, 80, 50, 50, 50, 50, 50, 50, 50, 50, 30, 30, 30, 30, 30, 30, 30, 30, 15, 15, 15, 15, 15, 15, 15, 15, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  6: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
};
// Precálculo: [pieza 0..15][casilla 0..127]
const PSQ_MG = new Int16Array(16 * 128), PSQ_EG = new Int16Array(16 * 128);
for (let c = 0; c < 2; c++) for (let t = 1; t <= 6; t++) for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
  const idx = c === WHITE ? (7 - r) * 8 + f : r * 8 + f;
  const p = t | (c << 3), sq = r * 16 + f;
  PSQ_MG[p * 128 + sq] = VALUE[t] + PST_MG[t][idx];
  PSQ_EG[p * 128 + sq] = VALUE[t] + PST_EG[t][idx];
}

export const sqName = (sq) => 'abcdefgh'[sq & 7] + ((sq >> 4) + 1);
export const sqFromName = (n) => (n.charCodeAt(1) - 49) * 16 + (n.charCodeAt(0) - 97);
const PROMO_CH = ['', '', 'n', 'b', 'r', 'q'];

export const moveFrom = (m) => m & 127;
export const moveTo = (m) => (m >> 7) & 127;
export const movePromo = (m) => (m >> 14) & 7;
export const moveFlags = (m) => (m >> 17) & 15;
export const moveToUci = (m) => sqName(m & 127) + sqName((m >> 7) & 127) + PROMO_CH[(m >> 14) & 7];

export class Position {
  constructor() {
    this.board = new Int8Array(128);
    this.side = WHITE; this.castling = 0; this.ep = -1; this.halfmove = 0; this.fullmove = 1;
    this.kings = [0, 0]; this.hashLo = 0; this.hashHi = 0; this.sp = 0;
    this.uMove = new Int32Array(STACK); this.uCap = new Int8Array(STACK);
    this.uCastle = new Int8Array(STACK); this.uEp = new Int16Array(STACK);
    this.uHalf = new Int16Array(STACK); this.uLo = new Int32Array(STACK); this.uHi = new Int32Array(STACK);
  }

  static fromFen(fen) { const p = new Position(); p.setFen(fen); return p; }

  setFen(fen) {
    const [placement, side, castle, ep, half, full] = fen.trim().split(/\s+/);
    this.board.fill(0);
    let r = 7, f = 0;
    for (const ch of placement) {
      if (ch === '/') { r--; f = 0; continue; }
      if (/\d/.test(ch)) { f += +ch; continue; }
      const t = 'pnbrqk'.indexOf(ch.toLowerCase()) + 1;
      const c = ch === ch.toUpperCase() ? WHITE : BLACK;
      const sq = r * 16 + f;
      this.board[sq] = t | (c << 3);
      if (t === KING) this.kings[c] = sq;
      f++;
    }
    this.side = side === 'b' ? BLACK : WHITE;
    this.castling = 0;
    if (castle && castle !== '-') {
      if (castle.includes('K')) this.castling |= 1; if (castle.includes('Q')) this.castling |= 2;
      if (castle.includes('k')) this.castling |= 4; if (castle.includes('q')) this.castling |= 8;
    }
    this.ep = ep && ep !== '-' ? sqFromName(ep) : -1;
    this.halfmove = half ? +half : 0; this.fullmove = full ? +full : 1;
    this.sp = 0;
    this.computeHash();
  }

  computeHash() {
    let lo = 0, hi = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = this.board[sq];
      if (p) { lo ^= Z_PIECE_LO[p * 128 + sq]; hi ^= Z_PIECE_HI[p * 128 + sq]; }
    }
    lo ^= Z_CASTLE_LO[this.castling]; hi ^= Z_CASTLE_HI[this.castling];
    if (this.ep >= 0) { lo ^= Z_EP_LO[this.ep & 7]; hi ^= Z_EP_HI[this.ep & 7]; }
    if (this.side === BLACK) { lo ^= Z_SIDE_LO; hi ^= Z_SIDE_HI; }
    this.hashLo = lo; this.hashHi = hi;
  }

  isAttacked(sq, by) {
    const b = this.board;
    const cb = by << 3;
    // peones
    if (by === WHITE) {
      let s = sq - 15; if (!(s & 0x88) && b[s] === PAWN) return true;
      s = sq - 17; if (!(s & 0x88) && b[s] === PAWN) return true;
    } else {
      let s = sq + 15; if (!(s & 0x88) && b[s] === (PAWN | 8)) return true;
      s = sq + 17; if (!(s & 0x88) && b[s] === (PAWN | 8)) return true;
    }
    const kn = KNIGHT | cb, kg = KING | cb;
    for (let i = 0; i < 8; i++) {
      let s = sq + KNIGHT_OFF[i]; if (!(s & 0x88) && b[s] === kn) return true;
      s = sq + KING_OFF[i]; if (!(s & 0x88) && b[s] === kg) return true;
    }
    const bq = BISHOP | cb, rq = ROOK | cb, qq = QUEEN | cb;
    for (let i = 0; i < 4; i++) {
      let d = BISHOP_DIR[i], s = sq + d;
      while (!(s & 0x88)) { const p = b[s]; if (p) { if (p === bq || p === qq) return true; break; } s += d; }
      d = ROOK_DIR[i]; s = sq + d;
      while (!(s & 0x88)) { const p = b[s]; if (p) { if (p === rq || p === qq) return true; break; } s += d; }
    }
    return false;
  }

  inCheck() { return this.isAttacked(this.kings[this.side], this.side ^ 1); }

  /** Genera pseudo-legales. capturesOnly incluye promociones. */
  generate(out, capturesOnly = false) {
    const b = this.board, us = this.side, them = us ^ 1;
    let n = 0;
    const add = (from, to, flags, promo) => { out[n++] = from | (to << 7) | (promo << 14) | (flags << 17); };
    const fwd = us === WHITE ? 16 : -16;
    const startRank = us === WHITE ? 1 : 6, promoRank = us === WHITE ? 7 : 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = b[sq];
      if (!p || (p >> 3) !== us) continue;
      const t = p & 7;
      if (t === PAWN) {
        const to = sq + fwd;
        if (!(to & 0x88) && !b[to]) {
          if ((to >> 4) === promoRank) { for (let pr = QUEEN; pr >= KNIGHT; pr--) add(sq, to, 0, pr); }
          else if (!capturesOnly) {
            add(sq, to, 0, 0);
            const to2 = to + fwd;
            if ((sq >> 4) === startRank && !b[to2]) add(sq, to2, F_DOUBLE, 0);
          }
        }
        for (const dc of [fwd - 1, fwd + 1]) {
          const c = sq + dc;
          if (c & 0x88) continue;
          if (b[c] && (b[c] >> 3) === them) {
            if ((c >> 4) === promoRank) { for (let pr = QUEEN; pr >= KNIGHT; pr--) add(sq, c, F_CAP, pr); }
            else add(sq, c, F_CAP, 0);
          } else if (c === this.ep) add(sq, c, F_CAP | F_EP, 0);
        }
      } else if (t === KNIGHT || t === KING) {
        const offs = t === KNIGHT ? KNIGHT_OFF : KING_OFF;
        for (let i = 0; i < 8; i++) {
          const to = sq + offs[i];
          if (to & 0x88) continue;
          const q = b[to];
          if (!q) { if (!capturesOnly) add(sq, to, 0, 0); }
          else if ((q >> 3) === them) add(sq, to, F_CAP, 0);
        }
        if (t === KING && !capturesOnly) {
          if (us === WHITE && sq === 0x04) {
            if ((this.castling & 1) && !b[5] && !b[6] && b[7] === ROOK && !this.isAttacked(4, BLACK) && !this.isAttacked(5, BLACK) && !this.isAttacked(6, BLACK)) add(4, 6, F_CASTLE, 0);
            if ((this.castling & 2) && !b[3] && !b[2] && !b[1] && b[0] === ROOK && !this.isAttacked(4, BLACK) && !this.isAttacked(3, BLACK) && !this.isAttacked(2, BLACK)) add(4, 2, F_CASTLE, 0);
          } else if (us === BLACK && sq === 0x74) {
            if ((this.castling & 4) && !b[0x75] && !b[0x76] && b[0x77] === (ROOK | 8) && !this.isAttacked(0x74, WHITE) && !this.isAttacked(0x75, WHITE) && !this.isAttacked(0x76, WHITE)) add(0x74, 0x76, F_CASTLE, 0);
            if ((this.castling & 8) && !b[0x73] && !b[0x72] && !b[0x71] && b[0x70] === (ROOK | 8) && !this.isAttacked(0x74, WHITE) && !this.isAttacked(0x73, WHITE) && !this.isAttacked(0x72, WHITE)) add(0x74, 0x72, F_CASTLE, 0);
          }
        }
      } else {
        const dirs = t === BISHOP ? BISHOP_DIR : t === ROOK ? ROOK_DIR : KING_OFF;
        for (let i = 0; i < dirs.length; i++) {
          const d = dirs[i];
          let to = sq + d;
          while (!(to & 0x88)) {
            const q = b[to];
            if (!q) { if (!capturesOnly) add(sq, to, 0, 0); }
            else { if ((q >> 3) === them) add(sq, to, F_CAP, 0); break; }
            to += d;
          }
        }
      }
    }
    return n;
  }

  /** Hace la jugada; devuelve false (y la deshace) si deja al rey en jaque. */
  make(m) {
    const b = this.board, sp = this.sp;
    const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flags = (m >> 17) & 15;
    const us = this.side, p = b[from];
    let lo = this.hashLo, hi = this.hashHi;
    this.uMove[sp] = m; this.uCastle[sp] = this.castling; this.uEp[sp] = this.ep;
    this.uHalf[sp] = this.halfmove; this.uLo[sp] = lo; this.uHi[sp] = hi;
    let cap = b[to];
    lo ^= Z_PIECE_LO[p * 128 + from]; hi ^= Z_PIECE_HI[p * 128 + from];
    b[from] = 0;
    if (flags & F_EP) {
      const cs = to + (us === WHITE ? -16 : 16);
      cap = b[cs]; b[cs] = 0;
      lo ^= Z_PIECE_LO[cap * 128 + cs]; hi ^= Z_PIECE_HI[cap * 128 + cs];
    } else if (cap) {
      lo ^= Z_PIECE_LO[cap * 128 + to]; hi ^= Z_PIECE_HI[cap * 128 + to];
    }
    this.uCap[sp] = cap;
    const np = promo ? (promo | (us << 3)) : p;
    b[to] = np;
    lo ^= Z_PIECE_LO[np * 128 + to]; hi ^= Z_PIECE_HI[np * 128 + to];
    if (flags & F_CASTLE) {
      let rf, rt;
      if (to > from) { rf = to + 1; rt = to - 1; } else { rf = to - 2; rt = to + 1; }
      const r = b[rf]; b[rf] = 0; b[rt] = r;
      lo ^= Z_PIECE_LO[r * 128 + rf] ^ Z_PIECE_LO[r * 128 + rt];
      hi ^= Z_PIECE_HI[r * 128 + rf] ^ Z_PIECE_HI[r * 128 + rt];
    }
    if ((p & 7) === KING) this.kings[us] = to;
    if (this.ep >= 0) { lo ^= Z_EP_LO[this.ep & 7]; hi ^= Z_EP_HI[this.ep & 7]; }
    this.ep = (flags & F_DOUBLE) ? (from + to) >> 1 : -1;
    if (this.ep >= 0) { lo ^= Z_EP_LO[this.ep & 7]; hi ^= Z_EP_HI[this.ep & 7]; }
    lo ^= Z_CASTLE_LO[this.castling]; hi ^= Z_CASTLE_HI[this.castling];
    this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
    lo ^= Z_CASTLE_LO[this.castling]; hi ^= Z_CASTLE_HI[this.castling];
    this.halfmove = ((p & 7) === PAWN || cap) ? 0 : this.halfmove + 1;
    if (us === BLACK) this.fullmove++;
    this.side = us ^ 1;
    lo ^= Z_SIDE_LO; hi ^= Z_SIDE_HI;
    this.hashLo = lo; this.hashHi = hi;
    this.sp = sp + 1;
    if (this.isAttacked(this.kings[us], us ^ 1)) { this.unmake(); return false; }
    return true;
  }

  unmake() {
    const sp = --this.sp, b = this.board;
    const m = this.uMove[sp];
    const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flags = (m >> 17) & 15;
    this.side ^= 1;
    const us = this.side;
    if (us === BLACK) this.fullmove--;
    const p = promo ? (PAWN | (us << 3)) : b[to];
    b[from] = p;
    const cap = this.uCap[sp];
    if (flags & F_EP) { b[to] = 0; b[to + (us === WHITE ? -16 : 16)] = cap; }
    else b[to] = cap;
    if (flags & F_CASTLE) {
      let rf, rt;
      if (to > from) { rf = to + 1; rt = to - 1; } else { rf = to - 2; rt = to + 1; }
      b[rf] = b[rt]; b[rt] = 0;
    }
    if ((p & 7) === KING) this.kings[us] = from;
    this.castling = this.uCastle[sp]; this.ep = this.uEp[sp]; this.halfmove = this.uHalf[sp];
    this.hashLo = this.uLo[sp]; this.hashHi = this.uHi[sp];
  }

  makeNull() {
    const sp = this.sp;
    this.uMove[sp] = 0; this.uEp[sp] = this.ep; this.uLo[sp] = this.hashLo; this.uHi[sp] = this.hashHi;
    this.uHalf[sp] = this.halfmove; this.uCastle[sp] = this.castling;
    if (this.ep >= 0) { this.hashLo ^= Z_EP_LO[this.ep & 7]; this.hashHi ^= Z_EP_HI[this.ep & 7]; }
    this.ep = -1; this.side ^= 1; this.hashLo ^= Z_SIDE_LO; this.hashHi ^= Z_SIDE_HI;
    this.halfmove = 0; // evita falsas repeticiones a través del movimiento nulo
    this.sp = sp + 1;
  }
  unmakeNull() {
    const sp = --this.sp;
    this.side ^= 1; this.ep = this.uEp[sp]; this.hashLo = this.uLo[sp]; this.hashHi = this.uHi[sp]; this.halfmove = this.uHalf[sp];
  }

  isRepetition() {
    const stop = Math.max(0, this.sp - this.halfmove);
    for (let i = this.sp - 2; i >= stop; i -= 2) if (this.uLo[i] === this.hashLo && this.uHi[i] === this.hashHi) return true;
    return false;
  }

  legalMoves() {
    const buf = new Int32Array(256), n = this.generate(buf), res = [];
    for (let i = 0; i < n; i++) if (this.make(buf[i])) { this.unmake(); res.push(buf[i]); }
    return res;
  }

  /** Aplica una jugada UCI (e2e4, e7e8q). Devuelve false si no es legal. */
  makeUci(uci) {
    for (const m of this.legalMoves()) if (moveToUci(m) === uci) return this.make(m);
    return false;
  }

  perft(depth) {
    if (depth === 0) return 1;
    const buf = new Int32Array(256), n = this.generate(buf);
    let total = 0;
    for (let i = 0; i < n; i++) if (this.make(buf[i])) { total += depth === 1 ? 1 : this.perft(depth - 1); this.unmake(); }
    return total;
  }

  /** Evaluación estática desde el punto de vista del bando al que le toca mover. */
  evaluate() {
    const b = this.board;
    let mg = 0, eg = 0, phase = 0;
    const pawnFiles = [new Int8Array(8), new Int8Array(8)];
    const bishops = [0, 0], minors = [0, 0], majorsOrPawns = [0, 0];
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = b[sq];
      if (!p) continue;
      const c = p >> 3, t = p & 7, s = c === WHITE ? 1 : -1;
      mg += s * PSQ_MG[p * 128 + sq]; eg += s * PSQ_EG[p * 128 + sq];
      phase += PHASE_W[t];
      if (t === PAWN) { pawnFiles[c][sq & 7]++; majorsOrPawns[c]++; }
      else if (t === BISHOP) { bishops[c]++; minors[c]++; }
      else if (t === KNIGHT) minors[c]++;
      else if (t === ROOK || t === QUEEN) majorsOrPawns[c]++;
    }
    // material insuficiente (rey y menor como mucho por bando)
    if (!majorsOrPawns[0] && !majorsOrPawns[1] && minors[0] <= 1 && minors[1] <= 1) return 0;
    // pareja de alfiles
    if (bishops[0] >= 2) { mg += 30; eg += 50; }
    if (bishops[1] >= 2) { mg -= 30; eg -= 50; }
    // estructura de peones: doblados y aislados; peones pasados
    for (let c = 0; c < 2; c++) {
      const s = c === WHITE ? 1 : -1, pf = pawnFiles[c];
      for (let f = 0; f < 8; f++) {
        if (!pf[f]) continue;
        if (pf[f] > 1) { mg -= s * 12 * (pf[f] - 1); eg -= s * 20 * (pf[f] - 1); }
        if ((f === 0 || !pf[f - 1]) && (f === 7 || !pf[f + 1])) { mg -= s * 12; eg -= s * 15; }
      }
    }
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = b[sq];
      if ((p & 7) !== PAWN) continue;
      const c = p >> 3, f = sq & 7, r = sq >> 4;
      let passed = true;
      const dir = c === WHITE ? 16 : -16;
      for (let s2 = sq + dir; !(s2 & 0x88) && passed; s2 += dir) {
        for (let df = -1; df <= 1; df++) {
          const x = s2 + df;
          if (!(x & 0x88) && b[x] === (PAWN | ((c ^ 1) << 3))) { passed = false; break; }
        }
      }
      if (passed) {
        const adv = c === WHITE ? r : 7 - r;
        const bonus = [0, 5, 10, 20, 35, 60, 100, 0][adv];
        const s = c === WHITE ? 1 : -1;
        mg += s * bonus * 0.5; eg += s * bonus;
      }
    }
    if (phase > 24) phase = 24;
    let score = (mg * phase + eg * (24 - phase)) / 24;
    // escalar finales sin peones con poca ventaja
    score = score | 0;
    return (this.side === WHITE ? score : -score) + 10; // pequeño bonus por tempo
  }

  hasNonPawn(c) {
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = this.board[sq];
      if (p && (p >> 3) === c) { const t = p & 7; if (t !== PAWN && t !== KING) return true; }
    }
    return false;
  }
}

// --- Niveles de dificultad ---
export const LEVELS = [
  null,
  { name: 'Principiante', depth: 1, time: 250, noise: 260, blunder: 0.18 },
  { name: 'Aficionado', depth: 2, time: 450, noise: 120, blunder: 0.06 },
  { name: 'Club', depth: 3, time: 700, noise: 45, blunder: 0 },
  { name: 'Avanzado', depth: 4, time: 1100, noise: 18, blunder: 0 },
  { name: 'Experto', depth: 7, time: 1800, noise: 0, blunder: 0 },
  { name: 'Maestro', depth: 64, time: 3200, noise: 0, blunder: 0 },
];

const TT_BITS = 20, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
const TT_EXACT = 1, TT_LOWER = 2, TT_UPPER = 3;

export class Searcher {
  constructor(random = Math.random) {
    this.random = random;
    this.ttKey = new Int32Array(TT_SIZE); this.ttMove = new Int32Array(TT_SIZE);
    this.ttScore = new Int16Array(TT_SIZE); this.ttDepth = new Int8Array(TT_SIZE); this.ttFlag = new Uint8Array(TT_SIZE);
    this.killers = new Int32Array(MAX_PLY * 2);
    this.history = new Int32Array(16 * 128);
    this.moveBufs = Array.from({ length: MAX_PLY + 8 }, () => new Int32Array(256));
    this.scoreBufs = Array.from({ length: MAX_PLY + 8 }, () => new Int32Array(256));
  }

  clear() { this.ttKey.fill(0); this.ttFlag.fill(0); this.history.fill(0); }

  /**
   * Busca la mejor jugada.
   * @returns {{move:string|null, score:number, depth:number, nodes:number, pv:string[], ms:number}}
   */
  think(pos, level = 4, timeMs) {
    const L = LEVELS[Math.max(1, Math.min(6, level))];
    const t0 = Date.now();
    const limit = timeMs ? Math.min(timeMs, L.time) : L.time;
    this.pos = pos; this.nodes = 0; this.stop = false; this.deadline = t0 + limit;
    this.killers.fill(0);
    for (let i = 0; i < this.history.length; i++) this.history[i] >>= 2;
    const legal = pos.legalMoves();
    if (!legal.length) return { move: null, score: pos.inCheck() ? -MATE : 0, depth: 0, nodes: 0, pv: [], ms: 0 };
    if (legal.length === 1) return { move: moveToUci(legal[0]), score: 0, depth: 0, nodes: 0, pv: [moveToUci(legal[0])], ms: 0 };

    let best = legal[0], bestScore = -INF, done = 0;
    for (let d = 1; d <= L.depth; d++) {
      this.rootBest = 0;
      // ventana de aspiración
      let alpha = -INF, beta = INF;
      if (d >= 4 && Math.abs(bestScore) < MATE - 100) { alpha = bestScore - 40; beta = bestScore + 40; }
      let score = this.negamax(d, alpha, beta, 0, true);
      if (!this.stop && (score <= alpha || score >= beta)) score = this.negamax(d, -INF, INF, 0, true);
      if (this.stop) { if (this.rootBest) best = this.rootBest; break; }
      best = this.rootBest || best; bestScore = score; done = d;
      if (Math.abs(score) > MATE - 100 && d > 1) break; // mate encontrado
      if (Date.now() - t0 > limit * 0.55) break; // no empezar una iteración que no terminará
    }

    // Niveles bajos: elegir entre jugadas "razonables" con ruido para parecer humano.
    if (L.noise > 0 || L.blunder > 0) {
      if (L.blunder > 0 && this.random() < L.blunder) {
        best = legal[(this.random() * legal.length) | 0];
      } else if (L.noise > 0) {
        const d = Math.max(1, Math.min(done || 1, L.depth));
        this.stop = false; this.deadline = Date.now() + 2000;
        let top = -INF, choice = best;
        for (const m of legal) {
          pos.make(m);
          const s = -this.negamax(d - 1, -INF, INF, 1, true);
          pos.unmake();
          if (this.stop) break;
          // no ignorar nunca un mate a favor ni caer en un mate inmediato evidente
          const noisy = Math.abs(s) > MATE - 100 ? s : s + (this.random() * 2 - 1) * L.noise;
          if (noisy > top) { top = noisy; choice = m; }
        }
        best = choice;
      }
    }
    return { move: moveToUci(best), score: bestScore, depth: done, nodes: this.nodes, pv: this.extractPv(best), ms: Date.now() - t0 };
  }

  extractPv(first) {
    const pos = this.pos, pv = [moveToUci(first)];
    let n = 0;
    if (!pos.make(first)) return pv;
    n++;
    while (n < 12) {
      const i = pos.hashLo & TT_MASK;
      if (this.ttKey[i] !== pos.hashHi || !this.ttMove[i]) break;
      const m = this.ttMove[i];
      if (!pos.legalMoves().includes(m) || !pos.make(m)) break;
      pv.push(moveToUci(m)); n++;
    }
    while (n--) pos.unmake();
    return pv;
  }

  scoreMoves(moves, scores, n, ttMove, ply) {
    const b = this.pos.board, k1 = this.killers[ply * 2], k2 = this.killers[ply * 2 + 1];
    for (let i = 0; i < n; i++) {
      const m = moves[i];
      if (m === ttMove) { scores[i] = 10000000; continue; }
      const flags = (m >> 17) & 15, promo = (m >> 14) & 7;
      if (flags & F_CAP) {
        const victim = (flags & F_EP) ? PAWN : (b[(m >> 7) & 127] & 7);
        const attacker = b[m & 127] & 7;
        scores[i] = 1000000 + VALUE[victim] * 10 - VALUE[attacker] / 10 + (promo ? VALUE[promo] : 0);
      } else if (promo) scores[i] = 900000 + VALUE[promo];
      else if (m === k1) scores[i] = 800000;
      else if (m === k2) scores[i] = 790000;
      else scores[i] = this.history[b[m & 127] * 128 + ((m >> 7) & 127)];
    }
  }

  static pick(moves, scores, n, i) {
    let bi = i, bs = scores[i];
    for (let j = i + 1; j < n; j++) if (scores[j] > bs) { bs = scores[j]; bi = j; }
    if (bi !== i) {
      const tm = moves[i]; moves[i] = moves[bi]; moves[bi] = tm;
      const ts = scores[i]; scores[i] = scores[bi]; scores[bi] = ts;
    }
    return moves[i];
  }

  negamax(depth, alpha, beta, ply, allowNull) {
    const pos = this.pos;
    if ((++this.nodes & 2047) === 0 && Date.now() > this.deadline) this.stop = true;
    if (this.stop) return 0;
    if (ply >= MAX_PLY) return pos.evaluate();
    const inCheck = pos.inCheck();
    if (ply > 0) {
      if (pos.halfmove >= 100 || pos.isRepetition()) return 0;
      // poda por distancia de mate
      alpha = Math.max(alpha, -MATE + ply); beta = Math.min(beta, MATE - ply - 1);
      if (alpha >= beta) return alpha;
    }
    if (inCheck) depth++;
    if (depth <= 0) return this.quiesce(alpha, beta, ply);

    const pvNode = beta - alpha > 1;
    const ti = pos.hashLo & TT_MASK;
    let ttMove = 0;
    if (this.ttKey[ti] === pos.hashHi && this.ttFlag[ti]) {
      ttMove = this.ttMove[ti];
      if (!pvNode && ply > 0 && this.ttDepth[ti] >= depth) {
        let s = this.ttScore[ti];
        if (s > MATE - 100) s -= ply; else if (s < -MATE + 100) s += ply;
        const f = this.ttFlag[ti];
        if (f === TT_EXACT || (f === TT_LOWER && s >= beta) || (f === TT_UPPER && s <= alpha)) return s;
      }
    }

    // poda de movimiento nulo
    if (allowNull && !inCheck && !pvNode && depth >= 3 && pos.hasNonPawn(pos.side) && pos.evaluate() >= beta) {
      const R = depth > 6 ? 3 : 2;
      pos.makeNull();
      const s = -this.negamax(depth - 1 - R, -beta, -beta + 1, ply + 1, false);
      pos.unmakeNull();
      if (this.stop) return 0;
      if (s >= beta) return beta;
    }

    const moves = this.moveBufs[ply], scores = this.scoreBufs[ply];
    const n = pos.generate(moves);
    this.scoreMoves(moves, scores, n, ttMove, ply);
    let legal = 0, best = -INF, bestMove = 0;
    const alpha0 = alpha;
    for (let i = 0; i < n; i++) {
      const m = Searcher.pick(moves, scores, n, i);
      if (!pos.make(m)) continue;
      legal++;
      const quiet = !(((m >> 17) & F_CAP) || ((m >> 14) & 7));
      let s;
      if (legal === 1) s = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
      else {
        let r = 0;
        if (depth >= 3 && legal > 3 && quiet && !inCheck && !pos.inCheck()) r = legal > 10 ? 2 : 1;
        s = -this.negamax(depth - 1 - r, -alpha - 1, -alpha, ply + 1, true);
        if (s > alpha && r > 0) s = -this.negamax(depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (s > alpha && s < beta) s = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
      }
      pos.unmake();
      if (this.stop) return 0;
      if (s > best) {
        best = s; bestMove = m;
        if (s > alpha) {
          alpha = s;
          if (ply === 0) this.rootBest = m;
          if (alpha >= beta) {
            if (quiet) {
              if (this.killers[ply * 2] !== m) { this.killers[ply * 2 + 1] = this.killers[ply * 2]; this.killers[ply * 2] = m; }
              this.history[pos.board[m & 127] * 128 + ((m >> 7) & 127)] += depth * depth;
            }
            break;
          }
        }
      }
    }
    if (!legal) return inCheck ? -MATE + ply : 0;

    let ss = best;
    if (ss > MATE - 100) ss += ply; else if (ss < -MATE + 100) ss -= ply;
    this.ttKey[ti] = pos.hashHi; this.ttMove[ti] = bestMove; this.ttScore[ti] = ss;
    this.ttDepth[ti] = Math.min(depth, 127);
    this.ttFlag[ti] = best >= beta ? TT_LOWER : best > alpha0 ? TT_EXACT : TT_UPPER;
    return best;
  }

  quiesce(alpha, beta, ply) {
    const pos = this.pos;
    if ((++this.nodes & 2047) === 0 && Date.now() > this.deadline) this.stop = true;
    if (this.stop) return 0;
    const stand = pos.evaluate();
    if (ply >= MAX_PLY) return stand;
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const moves = this.moveBufs[ply], scores = this.scoreBufs[ply];
    const n = pos.generate(moves, true);
    this.scoreMoves(moves, scores, n, 0, ply);
    for (let i = 0; i < n; i++) {
      const m = Searcher.pick(moves, scores, n, i);
      // poda delta
      const flags = (m >> 17) & 15;
      if (!((m >> 14) & 7)) {
        const victim = (flags & F_EP) ? PAWN : (pos.board[(m >> 7) & 127] & 7);
        if (stand + VALUE[victim] + 200 < alpha) continue;
      }
      if (!pos.make(m)) continue;
      const s = -this.quiesce(-beta, -alpha, ply + 1);
      pos.unmake();
      if (this.stop) return 0;
      if (s >= beta) return s;
      if (s > alpha) alpha = s;
    }
    return alpha;
  }
}
