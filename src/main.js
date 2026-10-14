/**
 * Ajedrez 3D — controlador de la aplicación: menús, partida, reloj, CPU,
 * torneo, guardado y conexión con la escena 3D.
 */
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import './style.css';

import { Chess } from 'chess.js';
import { ChessScene } from './scene/ChessScene.js';
import { THEMES, themeById } from './scene/themes.js';
import { SoundFX } from './audio.js';
import { EngineClient } from './engineClient.js';
import { Tournament, RIVALS } from './tournament.js';
import { openingName } from './openings.js';
import * as store from './storage.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Configuración ----------
const LEVELS = [
  null,
  { name: 'Principiante', elo: '≈ 800', desc: 'Para dar los primeros pasos' },
  { name: 'Aficionado', elo: '≈ 1100', desc: 'Conoce lo básico' },
  { name: 'Club', elo: '≈ 1400', desc: 'Juega con criterio' },
  { name: 'Avanzado', elo: '≈ 1700', desc: 'Táctica sólida' },
  { name: 'Experto', elo: '≈ 2000', desc: 'Calcula en profundidad' },
  { name: 'Maestro', elo: '≈ 2300', desc: 'Sin piedad' },
];
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const GLYPH = { w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' }, b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' } };
const COLOR_NAME = { w: 'blancas', b: 'negras' };
const coarse = window.matchMedia('(pointer: coarse)').matches;

const settings = store.load('settings', {
  theme: 'noir', sound: true, music: true, volume: 0.7, quality: coarse ? 'media' : 'alta',
  showLegal: true, autoRotate: true, animSpeed: 1,
});
if (settings.exposure === undefined) settings.exposure = 0.95;
if (settings.glow === undefined) settings.glow = 1;
const setupCfg = store.load('setup', { mode: 'hvc', color: 'w', level: 3, tc: '0', ttc: '0' });

const sfx = new SoundFX();
sfx.enabled = settings.sound; sfx.musicOn = settings.music; sfx.setVolume(settings.volume);
const scene = new ChessScene($('#stage'));
const engine = new EngineClient();

let game = null;
let busy = false;
let cpuThinking = false;
let selected = null;
let paused = false;
let returnTo = 'menu';
let lastTick = performance.now();
let modalResolver = null;

// ---------- Utilidades ----------
const toSpanishSan = (san) => san.replace(/[KQRBN]/g, (c) => ({ K: 'R', Q: 'D', R: 'T', B: 'A', N: 'C' })[c]);
const parseTc = (s) => {
  if (!s || s === '0') return null;
  const [m, i] = s.split('+').map(Number);
  return { base: m * 60000, inc: (i || 0) * 1000, label: `${m} + ${i || 0}` };
};
const fmtClock = (ms) => {
  ms = Math.max(0, ms);
  if (ms < 10000) return `0:0${Math.floor(ms / 1000)}.${Math.floor((ms % 1000) / 100)}`;
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
function toast(msg, ms = 2400) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
function applyTheme() {
  const t = themeById(settings.theme);
  scene.setTheme(t.id);
  document.documentElement.style.setProperty('--accent', t.accent);
  document.documentElement.style.setProperty('--accent-soft', scaleAlpha(t.accentSoft, settings.glow));
  $$('.theme').forEach((el) => el.classList.toggle('on', el.dataset.id === t.id));
}
function scaleAlpha(rgba, k) {
  const m = /rgba\(([^,]+),([^,]+),([^,]+),\s*([\d.]+)\)/.exec(rgba || '');
  return m ? `rgba(${m[1]},${m[2]},${m[3]}, ${(+m[4] * k).toFixed(3)})` : rgba;
}
function applyLight() {
  scene.setExposure(settings.exposure);
  scene.setGlow(settings.glow);
  document.documentElement.style.setProperty('--glow', settings.glow);
  document.body.classList.toggle('no-glow', settings.glow < 0.25);
  applyTheme();
  const b = document.getElementById('brightness'), g = document.getElementById('glowStr');
  if (b) { b.value = settings.exposure; document.getElementById('brightnessVal').textContent = Math.round(settings.exposure * 100) + '%'; }
  if (g) { g.value = settings.glow; document.getElementById('glowVal').textContent = settings.glow < 0.01 ? 'Apagado' : Math.round(settings.glow * 100) + '%'; }
}
function saveSettings() { store.save('settings', settings); }

// ---------- Pantallas ----------
const SCREENS = ['menu', 'setup', 'tournament', 'settings', 'help'];
function showScreen(id) {
  for (const s of SCREENS) $('#' + s).classList.toggle('active', s === id);
  $('#hud').hidden = id !== 'game';
  scene.setViewShift(id === 'game' ? 'game' : id === 'menu' ? 'menu' : 'none');
  if (id === 'menu') refreshMenu();
  if (id === 'tournament') renderTournament();
}
function refreshMenu() {
  const saved = store.loadRaw('save');
  const btn = $('[data-action="continue"]');
  btn.hidden = !saved;
  if (saved) {
    const n = Math.ceil((saved.moves?.length || 0) / 2);
    $('#continueInfo').textContent = `${saved.names.w} vs ${saved.names.b} · jugada ${Math.max(1, n)}`;
  }
  const rec = Tournament.records();
  const parts = [];
  if (rec.titles) parts.push(`${rec.titles} ${rec.titles === 1 ? 'torneo ganado' : 'torneos ganados'}`);
  if (rec.bestRound) parts.push(`Mejor ronda ${Math.min(rec.bestRound + (rec.bestRound < 6 ? 1 : 0), 6)}/6`);
  const st = store.load('stats', { played: 0, won: 0 });
  if (st.played) parts.push(`${st.played} partidas · ${st.won} victorias`);
  $('#menuStats').textContent = parts.join('   ·   ') || 'Seis materiales · Seis niveles · Un torneo';
}
function goMenu() {
  if (cpuThinking) engine.cancel();
  cpuThinking = false; busy = false; paused = false;
  game = null; selected = null;
  $('#pause').hidden = true; $('#gameover').hidden = true;
  scene.clearMarkers();
  scene.flyTo({ r: 17 * (scene.aspectBoost || 1), phi: 1.0, theta: scene.getSpherical().theta - 0.6 }, 2.2).then((done) => { if (done && !game) scene.menuOrbit(); });
  showScreen('menu');
}

// ---------- Controles genéricos ----------
function setSeg(name, value) {
  const seg = $(`.seg[data-name="${name}"]`);
  if (!seg) return;
  $$('button', seg).forEach((b) => b.classList.toggle('on', b.dataset.value === String(value)));
}
function onSeg(name, value) {
  if (name === 'mode') { setupCfg.mode = value; $$('.cpu-only').forEach((e) => (e.hidden = value !== 'hvc')); }
  else if (name === 'color') setupCfg.color = value;
  else if (name === 'tc') setupCfg.tc = value;
  else if (name === 'ttc') setupCfg.ttc = value;
  else if (name === 'quality') { settings.quality = value; scene.setQuality(value); saveSettings(); return; }
  else if (name === 'animSpeed') { settings.animSpeed = +value; scene.animSpeed = +value; saveSettings(); return; }
  store.save('setup', setupCfg);
}
$$('.seg').forEach((seg) => seg.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  $$('button', seg).forEach((x) => x.classList.toggle('on', x === b));
  sfx.play('click');
  onSeg(seg.dataset.name, b.dataset.value);
}));

function buildLevels() {
  const wrap = $('#levels');
  wrap.innerHTML = '';
  for (let i = 1; i <= 6; i++) {
    const L = LEVELS[i];
    const b = document.createElement('button');
    b.className = 'level' + (setupCfg.level === i ? ' on' : '');
    b.innerHTML = `<b>${L.name}</b><small>${L.desc} · ${L.elo}</small><div class="stars">${'◆'.repeat(i)}${'◇'.repeat(6 - i)}</div>`;
    b.addEventListener('click', () => {
      setupCfg.level = i; store.save('setup', setupCfg);
      $$('.level').forEach((x) => x.classList.toggle('on', x === b));
      sfx.play('click');
    });
    wrap.appendChild(b);
  }
}
function buildThemes() {
  const wrap = $('#themes');
  wrap.innerHTML = '';
  for (const t of THEMES) {
    const b = document.createElement('button');
    b.className = 'theme';
    b.dataset.id = t.id;
    b.style.setProperty('--tc', t.accent);
    b.innerHTML = `<div class="sw"><i style="background:${t.swatch[0]}"></i><i style="background:${t.swatch[1]}"></i></div><b>${t.name}</b><small>${t.desc}</small>`;
    b.addEventListener('click', () => { settings.theme = t.id; saveSettings(); applyTheme(); sfx.play('click'); });
    wrap.appendChild(b);
  }
}
function syncSettingsUI() {
  setSeg('quality', settings.quality);
  setSeg('animSpeed', settings.animSpeed);
  $('#volume').value = settings.volume;
  $('#optSound').checked = settings.sound;
  $('#optMusic').checked = settings.music;
  $('#optLegal').checked = settings.showLegal;
  $('#optRotate').checked = settings.autoRotate;
}
$('#brightness').addEventListener('input', (e) => { settings.exposure = +e.target.value; applyLight(); saveSettings(); });
$('#glowStr').addEventListener('input', (e) => { settings.glow = +e.target.value; applyLight(); saveSettings(); });
$('#tvMode').addEventListener('click', () => { settings.exposure = 0.7; settings.glow = 0; applyLight(); saveSettings(); sfx.play('click'); });
$('#lightReset').addEventListener('click', () => { settings.exposure = 0.95; settings.glow = 1; applyLight(); saveSettings(); sfx.play('click'); });
$('#volume').addEventListener('input', (e) => { settings.volume = +e.target.value; sfx.setVolume(settings.volume); saveSettings(); });
$('#optSound').addEventListener('change', (e) => { settings.sound = e.target.checked; sfx.setEnabled(settings.sound); saveSettings(); });
$('#optMusic').addEventListener('change', (e) => { settings.music = e.target.checked; sfx.setMusic(settings.music); saveSettings(); });
$('#optLegal').addEventListener('change', (e) => { settings.showLegal = e.target.checked; saveSettings(); });
$('#optRotate').addEventListener('change', (e) => { settings.autoRotate = e.target.checked; saveSettings(); });

// sonidos de interfaz (sólo si el audio ya fue desbloqueado por un gesto del usuario)
document.addEventListener('mouseover', (e) => {
  const b = e.target.closest('.btn, .level, .theme, .icon-btn, .promo-choices button');
  if (b && b !== document._lastHover && sfx.ctx) sfx.play('hover');
  document._lastHover = b;
});
document.addEventListener('pointerdown', () => { if (sfx.ensure() && settings.music && settings.sound) sfx.startMusic(); }, { once: true });

// ---------- Acciones ----------
const actions = {
  continue: () => { const s = store.loadRaw('save'); if (s) startGame(s.cfg, s); },
  standard: () => { showScreen('setup'); },
  tournament: () => showScreen('tournament'),
  settings: () => { returnTo = game ? 'pause' : (document.querySelector('.screen.active')?.id || 'menu'); $('#pause').hidden = true; showScreen('settings'); },
  help: () => { returnTo = 'menu'; showScreen('help'); },
  back: () => {
    const cur = document.querySelector('.screen.active')?.id;
    if (cur === 'settings' && returnTo === 'pause' && game) { showScreen('game'); $('#pause').hidden = false; return; }
    if (cur === 'settings' && returnTo && returnTo !== 'settings' && returnTo !== 'pause') { showScreen(returnTo); return; }
    showScreen('menu');
  },
  start: () => {
    const human = setupCfg.color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : setupCfg.color;
    startGame({ mode: setupCfg.mode, human, level: setupCfg.level, tc: setupCfg.tc, tournament: false });
  },
  't-play': () => {
    let t = Tournament.current();
    if (!t) t = Tournament.start(setupCfg.ttc);
    startGame({ mode: 'hvc', human: t.humanColor, level: t.rival.level, tc: t.tc, tournament: true });
  },
  't-reset': async () => {
    if (await confirmDialog('Abandonar torneo', 'Perderás el progreso del torneo actual. ¿Seguro?', 'Abandonar')) {
      Tournament.current()?.abandon();
      renderTournament();
    }
  },
  pause: () => pauseGame(true),
  resume: () => pauseGame(false),
  'to-menu': () => goMenu(),
  'copy-pgn': () => copyPgn(),
  undo: () => undo(),
  hint: () => hint(),
  flip: () => flip(),
  draw: () => offerDraw(),
  resign: () => resign(),
};
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled) return;
  const fn = actions[b.dataset.action];
  if (fn) { sfx.play('click'); fn(); }
});

function confirmDialog(title, text, yes = 'Aceptar') {
  $('#cfTitle').textContent = title; $('#cfText').textContent = text;
  $('[data-cf="yes"] span').textContent = yes;
  $('#confirm').hidden = false;
  return new Promise((resolve) => {
    const done = (v) => { $('#confirm').hidden = true; modalResolver = null; resolve(v); };
    modalResolver = () => done(false);
    $('[data-cf="yes"]').onclick = () => done(true);
    $('[data-cf="no"]').onclick = () => done(false);
  });
}

function choosePromotion(color) {
  $$('.promo-choices button').forEach((b) => ($('.glyph', b).textContent = GLYPH[color][b.dataset.piece]));
  $('#promo').hidden = false;
  return new Promise((resolve) => {
    const done = (v) => { $('#promo').hidden = true; modalResolver = null; resolve(v); };
    modalResolver = () => done(null);
    $$('.promo-choices button').forEach((b) => (b.onclick = () => { sfx.play('click'); done(b.dataset.piece); }));
  });
}

// ---------- Partida ----------
function uciHistory(chess) { return chess.history({ verbose: true }).map((m) => m.from + m.to + (m.promotion || '')); }
function capturedLists(chess) {
  const res = { w: [], b: [] };
  for (const m of chess.history({ verbose: true })) if (m.captured) res[m.color].push(m.captured);
  return res;
}
function kingSquare(chess, color) {
  for (const row of chess.board()) for (const c of row) if (c && c.type === 'k' && c.color === color) return c.square;
  return null;
}
const isHumanTurn = () => game && !game.over && (game.mode === 'hvh' || game.chess.turn() === game.human);
const cpuColor = () => (game.human === 'w' ? 'b' : 'w');

async function startGame(cfg, resume = null) {
  engine.cancel();
  engine.newGame();
  cpuThinking = false; paused = false; selected = null;
  const chess = new Chess(resume?.startFen);
  const startFen = chess.fen();
  if (resume) for (const u of resume.moves) chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  const tc = parseTc(cfg.tc);
  const t = cfg.tournament ? Tournament.current() : null;
  const names = cfg.mode === 'hvh'
    ? { w: 'Blancas', b: 'Negras' }
    : { [cfg.human]: 'Tú', [cfg.human === 'w' ? 'b' : 'w']: t ? t.rival.name : `CPU · ${LEVELS[cfg.level].name}` };
  game = {
    cfg, chess, startFen, mode: cfg.mode, human: cfg.human, level: cfg.level, tc,
    clock: resume?.clock || (tc ? { w: tc.base, b: tc.base } : null),
    tournament: !!cfg.tournament, names, over: null, lastScore: 0,
    view: cfg.mode === 'hvc' ? cfg.human : chess.turn(),
  };
  $$('.screen').forEach((s) => s.classList.remove('active'));
  $('#gameover').hidden = true; $('#pause').hidden = true;
  showScreen('game');
  busy = true;
  scene.clearMarkers();
  scene.setPosition(chess.board(), capturedLists(chess));
  updateHud();
  setStatus(resume ? 'Partida recuperada' : 'Colocando las piezas…');
  const fly = scene.viewFor(game.view, 1.9);
  if (!resume) {
    await sleep(250);
    await scene.dropIn(() => sfx.play('drop'));
    sfx.play('start');
  }
  await fly;
  busy = false;
  restoreMarkers();
  saveGame();
  updateHud();
  lastTick = performance.now();
  maybeCpu();
}

function restoreMarkers() {
  const h = game.chess.history({ verbose: true });
  const last = h[h.length - 1];
  scene.setLastMove(last?.from || null, last?.to || null);
  scene.setCheck(game.chess.inCheck() ? kingSquare(game.chess, game.chess.turn()) : null);
}

function saveGame() {
  if (!game || game.over) return;
  store.save('save', { cfg: game.cfg, startFen: game.startFen, moves: uciHistory(game.chess), clock: game.clock, names: game.names, savedAt: Date.now() });
}

function select(sq) {
  selected = sq;
  const moves = game.chess.moves({ square: sq, verbose: true });
  const seen = new Map();
  for (const m of moves) if (!seen.has(m.to)) seen.set(m.to, { to: m.to, capture: !!m.captured });
  scene.setSelection(sq, settings.showLegal ? [...seen.values()] : []);
  sfx.play('select');
}
function deselect() { selected = null; scene.setSelection(null); }

scene.isSelectable = (sq) => {
  if (!isHumanTurn() || busy || cpuThinking || paused) return false;
  const p = game.chess.get(sq);
  if (p && p.color === game.chess.turn()) return true;
  return !!selected && game.chess.moves({ square: selected, verbose: true }).some((m) => m.to === sq);
};

scene.onSquareClick = async (sq) => {
  if (!isHumanTurn() || busy || cpuThinking || paused) return;
  const chess = game.chess;
  const piece = chess.get(sq);
  if (selected) {
    if (sq === selected) { deselect(); return; }
    const cands = chess.moves({ square: selected, verbose: true }).filter((m) => m.to === sq);
    if (cands.length) {
      let promotion;
      if (cands.some((m) => m.promotion)) {
        promotion = await choosePromotion(chess.turn());
        if (!promotion) return;
      }
      await doMove({ from: selected, to: sq, promotion });
      return;
    }
    if (piece && piece.color === chess.turn()) { select(sq); return; }
    sfx.play('illegal');
    deselect();
    return;
  }
  if (piece && piece.color === chess.turn()) select(sq);
};

async function doMove(m) {
  const g = game;
  const chess = g.chess;
  let mv;
  try { mv = chess.move(m); } catch { sfx.play('illegal'); return; }
  busy = true;
  selected = null;
  scene.selected = null;
  scene.setSelection(null);
  scene.setHint(null, null);
  if (g.clock && g.tc) g.clock[mv.color] += g.tc.inc;
  scene.setLastMove(mv.from, mv.to);
  scene.setCheck(null);
  updateHud();
  await scene.animateMove(mv);
  if (game !== g) return;
  if (chess.inCheck()) sfx.play('check');
  else if (mv.promotion) sfx.play('promote');
  else if (mv.flags.includes('k') || mv.flags.includes('q')) sfx.play('castle');
  else if (mv.captured) sfx.play('capture');
  else sfx.play('move');
  if (chess.inCheck()) scene.setCheck(kingSquare(chess, chess.turn()));
  busy = false;
  saveGame();
  updateHud();
  if (checkGameOver()) return;
  if (g.mode === 'hvh' && settings.autoRotate) { g.view = chess.turn(); scene.viewFor(g.view, 1.3); }
  maybeCpu();
}

function checkGameOver() {
  const c = game.chess;
  if (c.isCheckmate()) { endGame(c.turn() === 'w' ? 'b' : 'w', 'Jaque mate'); return true; }
  if (c.isStalemate()) { endGame(null, 'Rey ahogado'); return true; }
  if (c.isInsufficientMaterial()) { endGame(null, 'Material insuficiente'); return true; }
  if (c.isThreefoldRepetition()) { endGame(null, 'Triple repetición'); return true; }
  if (c.isDrawByFiftyMoves()) { endGame(null, 'Regla de los 50 movimientos'); return true; }
  return false;
}

async function waitUnpaused() { while (paused) await sleep(120); }

async function maybeCpu() {
  const g = game;
  if (!g || g.mode !== 'hvc' || g.over || g.chess.turn() === g.human || cpuThinking) return;
  cpuThinking = true;
  updateHud();
  const t0 = performance.now();
  const cc = cpuColor();
  const timeMs = g.clock ? Math.max(120, Math.min(4000, g.clock[cc] / 28 + g.tc.inc * 0.6)) : undefined;
  let res;
  try {
    res = await engine.search({ fen: g.startFen, moves: uciHistory(g.chess), level: g.level, timeMs });
  } catch { return; }
  const wait = 650 - (performance.now() - t0);
  if (wait > 0) await sleep(wait);
  await waitUnpaused();
  if (game !== g || g.over) return;
  cpuThinking = false;
  if (!res.move) { updateHud(); return; }
  g.lastScore = res.score;
  await doMove({ from: res.move.slice(0, 2), to: res.move.slice(2, 4), promotion: res.move[4] });
}

function endGame(winner, reason) {
  const g = game;
  if (!g || g.over) return;
  if (cpuThinking) engine.cancel();
  cpuThinking = false;
  g.over = { winner, reason };
  store.remove('save');
  deselect();
  updateHud();
  const human = g.mode === 'hvc' ? g.human : null;
  const st = store.load('stats', { played: 0, won: 0 });
  st.played++;
  let title, mark = '♚', outcome = null;
  if (g.mode === 'hvc') {
    if (winner === human) { title = '¡Victoria!'; st.won++; sfx.play('win'); scene.celebrate(); mark = '♔'; }
    else if (winner) { title = 'Derrota'; sfx.play('lose'); mark = GLYPH.b.k; }
    else { title = 'Tablas'; sfx.play('draw'); mark = '½'; }
  } else {
    title = winner ? `Ganan las ${COLOR_NAME[winner]}` : 'Tablas';
    if (winner) { sfx.play('win'); scene.celebrate(); mark = GLYPH[winner].k; } else { sfx.play('draw'); mark = '½'; }
  }
  store.save('stats', st);
  const moves = Math.ceil(g.chess.history().length / 2);
  let extra = '';
  const buttons = [];
  if (g.tournament) {
    const t = Tournament.current();
    if (t) {
      const rival = t.rival;
      outcome = t.record(winner === human ? 'win' : winner ? 'loss' : 'draw');
      if (outcome === 'advance') extra = `Has vencido a ${rival.name}. Te espera ${RIVALS[t.round].name}.`;
      else if (outcome === 'champion') { extra = '¡Eres el Campeón del Circuito! Seis rivales, seis victorias. 🏆'; title = '¡Campeón!'; mark = '♛'; setTimeout(() => scene.celebrate('#ffd76a'), 1500); }
      else if (outcome === 'eliminated') extra = `Te has quedado sin vidas en la ronda ${t.round + 1}. ¡La próxima vez será!`;
      else if (winner) extra = `Pierdes una vida (te ${t.lives === 1 ? 'queda 1' : `quedan ${t.lives}`}). Revancha contra ${rival.name}.`;
      else extra = `Medio punto. Repites ronda contra ${rival.name}.`;
    }
    buttons.push(['Continuar torneo', () => { goMenu(); showScreen('tournament'); }, true]);
  } else {
    buttons.push(['Revancha', () => {
      const cfg = { ...g.cfg };
      if (cfg.mode === 'hvc') cfg.human = cfg.human === 'w' ? 'b' : 'w';
      startGame(cfg);
    }, true]);
    buttons.push(['Menú principal', () => goMenu(), false]);
  }
  buttons.push(['Ver tablero', () => { $('#gameover').hidden = true; }, false]);
  $('#goMark').textContent = mark;
  $('#goTitle').textContent = title;
  $('#goReason').textContent = `${reason} · ${moves} ${moves === 1 ? 'jugada' : 'jugadas'}`;
  $('#goExtra').textContent = extra;
  const wrap = $('#goButtons');
  wrap.innerHTML = '';
  for (const [label, fn, primary] of buttons) {
    const b = document.createElement('button');
    b.className = primary ? 'btn glow primary' : 'btn ghost';
    b.innerHTML = primary ? `<span>${label}</span>` : label;
    b.onclick = () => { sfx.play('click'); fn(); };
    wrap.appendChild(b);
  }
  setTimeout(() => { if (game === g) $('#gameover').hidden = false; }, 1300);
}

function undo() {
  if (!game || game.over || busy || game.tournament) return;
  const c = game.chess;
  if (!c.history().length) return;
  if (cpuThinking) { engine.cancel(); cpuThinking = false; c.undo(); }
  else if (game.mode === 'hvc') {
    if (c.history().length < 2) return;
    c.undo(); c.undo();
  } else c.undo();
  deselect();
  scene.setHint(null, null);
  scene.setPosition(c.board(), capturedLists(c));
  restoreMarkers();
  saveGame();
  updateHud();
  sfx.play('move');
  if (game.mode === 'hvh' && settings.autoRotate) { game.view = c.turn(); scene.viewFor(game.view, 1.2); }
  maybeCpu();
}

async function hint() {
  if (!game || game.tournament) { toast('En el torneo no hay pistas: ¡a pensar!'); return; }
  if (!isHumanTurn() || busy || cpuThinking) return;
  const g = game;
  setStatus('Buscando una buena jugada…', true);
  busy = true;
  let res;
  try { res = await engine.search({ fen: g.startFen, moves: uciHistory(g.chess), level: 5, timeMs: 900 }); } catch { busy = false; return; }
  busy = false;
  if (game !== g || !res.move) return;
  const from = res.move.slice(0, 2), to = res.move.slice(2, 4);
  scene.setHint(from, to);
  const tmp = new Chess(g.chess.fen());
  const san = tmp.move({ from, to, promotion: res.move[4] }).san;
  toast(`Sugerencia: ${toSpanishSan(san)}`);
  updateHud();
}

function flip() {
  if (!game) return;
  game.view = game.view === 'w' ? 'b' : 'w';
  scene.viewFor(game.view, 1.3);
}

async function offerDraw() {
  if (!game || game.over || busy) return;
  const c = game.chess;
  if (game.mode === 'hvh') {
    const other = COLOR_NAME[c.turn() === 'w' ? 'b' : 'w'];
    if (await confirmDialog('Oferta de tablas', `¿Aceptan las ${other} las tablas?`, 'Aceptar tablas')) endGame(null, 'Tablas de mutuo acuerdo');
    return;
  }
  const plies = c.history().length;
  const accept = game.lastScore < -150 || (plies >= 50 && Math.abs(game.lastScore) < 40);
  if (accept) endGame(null, 'Tablas de mutuo acuerdo');
  else toast(`${game.names[cpuColor()]} rechaza las tablas.`);
}

async function resign() {
  if (!game || game.over) return;
  const loser = game.mode === 'hvc' ? game.human : game.chess.turn();
  const who = game.mode === 'hvc' ? '¿Seguro que quieres rendirte?' : `¿Se rinden las ${COLOR_NAME[loser]}?`;
  if (await confirmDialog('Rendirse', who, 'Rendirse')) endGame(loser === 'w' ? 'b' : 'w', 'Abandono');
}

function pauseGame(on) {
  if (!game) return;
  paused = on;
  $('#pause').hidden = !on;
  lastTick = performance.now();
}

function copyPgn() {
  if (!game) return;
  const c = game.chess;
  const d = new Date();
  c.setHeader('Event', game.tournament ? 'Circuito de Campeones' : 'Partida estándar');
  c.setHeader('Site', 'Ajedrez 3D');
  c.setHeader('Date', `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`);
  c.setHeader('White', game.names.w); c.setHeader('Black', game.names.b);
  const res = game.over ? (game.over.winner === 'w' ? '1-0' : game.over.winner === 'b' ? '0-1' : '1/2-1/2') : '*';
  c.setHeader('Result', res);
  const pgn = c.pgn();
  const ok = () => toast('PGN copiado al portapapeles');
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(pgn).then(ok, () => fallbackCopy(pgn, ok));
  else fallbackCopy(pgn, ok);
}
function fallbackCopy(text, ok) {
  const ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); ok(); } catch { toast('No se pudo copiar el PGN'); }
  ta.remove();
}

// ---------- HUD ----------
function setStatus(text, thinking = false, check = false) {
  $('#statusText').textContent = text;
  $('#status').classList.toggle('thinking', thinking);
  $('#status').classList.toggle('check', check);
}

function updateHud() {
  if (!game) return;
  const c = game.chess;
  const turn = c.turn();
  const caps = capturedLists(c);
  let mat = 0;
  for (const row of c.board()) for (const p of row) if (p) mat += (p.color === 'w' ? 1 : -1) * PIECE_VALUE[p.type];
  for (const side of ['w', 'b']) {
    const el = $(side === 'w' ? '#pW' : '#pB');
    $('.p-name', el).textContent = game.names[side];
    el.classList.toggle('active', !game.over && turn === side);
    const order = 'qrbnp';
    const glyphs = caps[side].slice().sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((t) => GLYPH[side === 'w' ? 'b' : 'w'][t]).join('');
    const adv = side === 'w' ? mat : -mat;
    $('.p-caps', el).innerHTML = glyphs + (adv > 0 ? `<b>+${adv}</b>` : '');
    const clk = $('.p-clock', el);
    if (game.clock) { clk.textContent = fmtClock(game.clock[side]); clk.classList.toggle('low', game.clock[side] < 10000 && !game.over); }
    else clk.textContent = '';
  }
  // lista de jugadas
  const hist = c.history();
  const ol = $('#moves');
  if (!hist.length) ol.innerHTML = '<span class="empty">La partida aún no ha empezado.</span>';
  else {
    let html = '';
    for (let i = 0; i < hist.length; i += 2) {
      const a = toSpanishSan(hist[i]), b = hist[i + 1] ? toSpanishSan(hist[i + 1]) : '';
      const la = i === hist.length - 1 ? ' class="last"' : '', lb = i + 1 === hist.length - 1 ? ' class="last"' : '';
      html += `<li><span class="n">${i / 2 + 1}.</span><span${la}>${a}</span><span${lb}>${b}</span></li>`;
    }
    ol.innerHTML = html;
    ol.scrollTop = ol.scrollHeight;
  }
  $('#openingName').textContent = openingName(hist);
  // insignia
  const tcLabel = game.tc ? ` · ${game.tc.label}` : '';
  let badge;
  if (game.tournament) { const t = Tournament.current(); badge = t ? `Torneo · Ronda ${t.round + 1}/6` : 'Torneo'; }
  else if (game.mode === 'hvc') badge = `Nivel ${game.level} · ${LEVELS[game.level].name}`;
  else badge = 'Partida local';
  $('#hudBadge').textContent = badge + tcLabel;
  // botones
  const canAct = !game.over;
  $('[data-action="undo"]').disabled = !canAct || game.tournament || !hist.length;
  $('[data-action="hint"]').disabled = !canAct || game.tournament;
  $('[data-action="draw"]').disabled = !canAct || hist.length < 2;
  $('[data-action="resign"]').disabled = !canAct;
  // estado
  if (game.over) {
    const w = game.over.winner;
    const res = w ? (game.mode === 'hvc' ? (w === game.human ? 'Has ganado' : 'Has perdido') : `Ganan las ${COLOR_NAME[w]}`) : 'Tablas';
    setStatus(`${res} · ${game.over.reason}`);
  } else if (cpuThinking) setStatus(`${game.names[cpuColor()]} está pensando…`, true);
  else if (busy) { /* mantener */ }
  else {
    const check = c.inCheck();
    let txt;
    if (game.mode === 'hvc') txt = turn === game.human ? (check ? '¡Jaque! Tu turno' : 'Tu turno') : `Juega ${game.names[turn]}`;
    else txt = (check ? '¡Jaque! ' : '') + `Juegan las ${COLOR_NAME[turn]}`;
    setStatus(txt, false, check);
  }
}

// ---------- Reloj ----------
setInterval(() => {
  const now = performance.now();
  const dt = now - lastTick;
  lastTick = now;
  if (!game || game.over || !game.clock || paused) return;
  const c = game.chess;
  if (!c.history().length) return;
  const side = c.turn();
  game.clock[side] -= dt;
  const el = $(side === 'w' ? '#pW .p-clock' : '#pB .p-clock');
  el.textContent = fmtClock(game.clock[side]);
  el.classList.toggle('low', game.clock[side] < 10000);
  if (game.clock[side] <= 0) {
    game.clock[side] = 0;
    // si el rival sólo tiene el rey, no puede ganar: tablas
    const other = side === 'w' ? 'b' : 'w';
    const otherHasMaterial = c.board().some((row) => row.some((p) => p && p.color === other && p.type !== 'k'));
    endGame(otherHasMaterial ? other : null, 'Tiempo agotado');
  }
  if (Math.floor(now / 5000) !== Math.floor((now - dt) / 5000)) saveGame();
}, 100);

// ---------- Torneo ----------
function renderTournament() {
  const t = Tournament.current();
  const last = store.loadRaw('tournament');
  const rec = Tournament.records();
  const ladder = $('#ladder');
  ladder.innerHTML = '';
  RIVALS.forEach((r, i) => {
    let state = 'locked', label = 'Bloqueado';
    if (t) {
      if (i < t.round) { state = 'done'; label = '✓ Vencido'; }
      else if (i === t.round) { state = 'current'; label = '⚔ Tu rival'; }
    } else if (last && last.status === 'champion') { state = 'done'; label = '✓ Vencido'; }
    else if (i === 0) { state = 'current'; label = 'Primer rival'; }
    const div = document.createElement('div');
    div.className = `rival ${state}`;
    div.innerHTML = `<div class="av">${r.initials}</div><div><b>${r.name}</b><small>${LEVELS[r.level].name} · Elo ${r.elo} · ${r.city}</small>${state === 'current' ? `<q>${r.quote}</q>` : ''}</div><div class="st">Ronda ${i + 1}<br>${label}</div>`;
    ladder.appendChild(div);
  });
  const sc = $('#scorecard');
  if (t) {
    const hearts = Array.from({ length: 3 }, (_, i) => `<span class="${i < t.lives ? '' : 'off'}">♥</span>`).join('');
    sc.innerHTML = `
      <div><div class="lbl">Puntuación</div><div class="big">${t.points.toLocaleString('es-ES')}</div></div>
      <div><div class="lbl">Vidas</div><div class="lives">${hearts}</div></div>
      <div class="rec"><div><b>${t.wins}</b><span class="lbl">Vict.</span></div><div><b>${t.draws}</b><span class="lbl">Tablas</span></div><div><b>${t.losses}</b><span class="lbl">Derr.</span></div></div>
      <div><div class="lbl">Próxima partida</div><div>Ronda ${t.round + 1} · Juegas con <b>${COLOR_NAME[t.humanColor]}</b>${t.tc && t.tc !== '0' ? ` · ${t.tc.replace('+', ' + ')}` : ''}</div></div>`;
  } else {
    let banner = 'Demuestra quién manda en el tablero.';
    if (last?.status === 'champion') banner = '¡Último torneo: Campeón! 🏆';
    else if (last?.status === 'eliminated') banner = `Último torneo: eliminado en la ronda ${last.round + 1}.`;
    sc.innerHTML = `
      <div class="banner">${banner}</div>
      <div><div class="lbl">Torneos ganados</div><div class="big">${rec.titles}</div></div>
      <div><div class="lbl">Partidas de torneo</div><div>${rec.games}</div></div>
      <div class="fine" style="color:var(--ink-dim);font-size:13px;line-height:1.5">Victoria: avanzas de ronda. Tablas: ½ punto y repites. Derrota: pierdes una vida.</div>`;
  }
  $('#tNewOptions').hidden = !!t;
  $('[data-action="t-reset"]').hidden = !t;
  $('[data-action="t-play"] span').textContent = t ? `Jugar ronda ${t.round + 1}` : 'Comenzar torneo';
}

// ---------- Teclado ----------
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (modalResolver) { modalResolver(); return; }
    if (!$('#gameover').hidden) { $('#gameover').hidden = true; return; }
    const cur = document.querySelector('.screen.active')?.id;
    if (cur && cur !== 'menu') { actions.back(); return; }
    if (game) pauseGame(!paused);
    return;
  }
  if (!game || paused || document.querySelector('.screen.active')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  else if (e.key.toLowerCase() === 'f') flip();
  else if (e.key.toLowerCase() === 'h') hint();
});

// ---------- Arranque ----------
async function boot() {
  buildLevels();
  buildThemes();
  syncSettingsUI();
  setSeg('mode', setupCfg.mode); onSeg('mode', setupCfg.mode);
  setSeg('color', setupCfg.color); setSeg('tc', setupCfg.tc); setSeg('ttc', setupCfg.ttc);
  scene.animSpeed = settings.animSpeed;
  scene.setQuality(settings.quality);
  applyLight();
  applyTheme();
  scene.setPosition(new Chess().board());
  try { await Promise.race([document.fonts.ready, sleep(2500)]); await document.fonts.load('600 40px "Cormorant Garamond"'); } catch { /* sin fuentes */ }
  scene.refreshCoords();
  await sleep(350);
  $('#loader').classList.add('done');
  showScreen('menu');
  scene.intro();
  scene.dropIn();
}
boot();

// Gancho de depuración/pruebas automatizadas
window.__chess3d = {
  scene, sfx, engine, settings,
  get game() { return game; },
  startGame, doMove, applyTheme, showScreen,
  setTheme: (id) => { settings.theme = id; applyTheme(); },
};
