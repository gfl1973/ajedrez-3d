// Verificación visual: abre el build en Chrome headless (SwiftShader), recoge errores
// de consola y guarda capturas en screenshots/. Uso: node scripts/screenshots.mjs [url]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] || 'http://localhost:4173/';
const OUT = new globalThis.URL('../screenshots/', import.meta.url).pathname;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const problems = [];
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning' || t === 'warn') problems.push(`[${t}] ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => problems.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));

const shot = async (name) => { await page.screenshot({ path: OUT + name + '.png' }); console.log('📸', name); };
const want = (n) => !ONLY || ONLY.includes(n);

await page.goto(URL, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
// SwiftShader renderiza a ~2 fps: dejamos que las animaciones avancen por tiempo real
await page.evaluate(() => { window.__chess3d.scene.maxDt = 2; });
await sleep(9000);
if (want('menu')) await shot('01-menu');

const waitIdle = async (maxMs = 30000) => {
  const t0 = Date.now();
  await sleep(300);
  while (Date.now() - t0 < maxMs) {
    const st = await page.evaluate(() => {
      const g = window.__chess3d.game;
      return { turn: g?.chess.turn(), human: g?.human, over: !!g?.over, status: document.querySelector('#statusText').textContent };
    });
    if (st.over || (st.turn === st.human && !/pensando|Colocando/.test(st.status))) return st;
    await sleep(300);
  }
  throw new Error('timeout esperando turno humano');
};

if (want('setup')) {
  await page.evaluate(() => window.__chess3d.showScreen('setup'));
  await sleep(1500);
  await shot('02-setup');
  await page.evaluate(() => window.__chess3d.showScreen('menu'));
}

// 1) Prueba funcional: partida real contra la CPU (nivel 3) con reloj
if (!process.env.SKIP_CPU) {
  await page.evaluate(() => window.__chess3d.startGame({ mode: 'hvc', human: 'w', level: 3, tc: '5+3', tournament: false }));
  await waitIdle();
  const prefs = ['e2e4', 'g1f3', 'f1c4', 'e1g1', 'd2d3', 'b1c3'];
  for (let k = 0; k < 6; k++) {
    await page.evaluate(async (prefs) => {
      const g = window.__chess3d.game;
      const legal = g.chess.moves({ verbose: true });
      const m = legal.find((x) => prefs.includes(x.from + x.to)) || legal[0];
      await window.__chess3d.doMove({ from: m.from, to: m.to, promotion: m.promotion });
    }, prefs);
    const st = await waitIdle();
    if (st.over) break;
  }
  const info = await page.evaluate(() => ({ pgn: window.__chess3d.game.chess.history().join(' '), plies: window.__chess3d.game.chess.history().length }));
  console.log('Partida contra la CPU:', info.plies, 'medias jugadas →', info.pgn);
  if (info.plies < 8) { problems.push('[error] la CPU no respondió lo suficiente'); }
}

// 2) Posición fija (Ataque Möller) para las capturas de temas
const LINE = 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d4 e5d4 c3d4 c5b4 b1c3 f6e4 e1g1 b4c3 d4d5 c3f6 f1e1 c6e7 e1e4 d7d6'.split(' ');
await page.evaluate((moves) => window.__chess3d.startGame({ mode: 'hvc', human: 'w', level: 4, tc: '10+5', tournament: false }, { startFen: undefined, moves, clock: { w: 431000, b: 512000 } }), LINE);
await page.evaluate(() => { window.__chess3d.engine.cancel(); });
await sleep(6000);
await page.evaluate(() => {
  const g = window.__chess3d.game;
  g.over = null;
  window.__chess3d.scene.onSquareClick('c1');
});
await sleep(1500);
const themes = ['noir', 'marble', 'wood', 'metal', 'glass', 'neon'];
let i = 3;
for (const t of themes) {
  if (!want(t)) { i++; continue; }
  await page.evaluate((t) => window.__chess3d.setTheme(t), t);
  await sleep(2500);
  await shot(String(i++).padStart(2, '0') + '-game-' + t);
}
if (want('closeup')) {
  await page.evaluate(() => { window.__chess3d.setTheme('noir'); window.__chess3d.scene.flyTo({ r: 9, phi: 1.12, theta: 0.5 }, 0.5); });
  await sleep(3500);
  await shot('09-closeup-noir');
  await page.evaluate(() => { window.__chess3d.setTheme('glass'); });
  await sleep(2500);
  await shot('10-closeup-glass');
  await page.evaluate(() => window.__chess3d.setTheme('noir'));
}
if (want('settings')) {
  await page.evaluate(() => { document.querySelector('[data-action="pause"]').click(); });
  await sleep(800);
  await shot('11-pause');
  await page.evaluate(() => { document.querySelector('#pause [data-action="settings"]').click(); });
  await sleep(1500);
  await shot('12-settings');
  await page.evaluate(() => { document.querySelector('#settings [data-action="back"]').click(); document.querySelector('[data-action="resume"]').click(); });
}
if (want('flow')) {
  // Coronación con selector (Humano vs Humano desde una posición preparada)
  await page.evaluate(() => { document.querySelector('[data-action="pause"]').click(); document.querySelector('[data-action="to-menu"]').click(); });
  await sleep(1000);
  await page.evaluate(() => window.__chess3d.startGame({ mode: 'hvh', human: 'w', level: 3, tc: '0' }, { startFen: '8/P5k1/8/8/8/8/6K1/8 w - - 0 1', moves: [] }));
  await sleep(5000);
  await page.evaluate(async () => { const s = window.__chess3d.scene; await s.onSquareClick('a7'); s.onSquareClick('a8'); });
  await sleep(1200);
  const promoVisible = await page.evaluate(() => !document.querySelector('#promo').hidden);
  if (!promoVisible) problems.push('[error] no apareció el selector de coronación');
  await shot('16-promotion');
  await page.evaluate(() => document.querySelector('.promo-choices [data-piece="n"]').click());
  await sleep(3000);
  const promoted = await page.evaluate(() => window.__chess3d.game.chess.get('a8'));
  console.log('Coronación →', JSON.stringify(promoted));
  if (!promoted || promoted.type !== 'n') problems.push('[error] la coronación no produjo un caballo');

  // Mate del loco → diálogo de fin de partida
  await page.evaluate(() => window.__chess3d.startGame({ mode: 'hvh', human: 'w', level: 3, tc: '0' }, { moves: ['f2f3', 'e7e5', 'g2g4'] }));
  await sleep(5000);
  await page.evaluate(() => window.__chess3d.doMove({ from: 'd8', to: 'h4' }));
  await sleep(6000);
  const go = await page.evaluate(() => ({ visible: !document.querySelector('#gameover').hidden, title: document.querySelector('#goTitle').textContent, reason: document.querySelector('#goReason').textContent }));
  console.log('Fin de partida →', JSON.stringify(go));
  if (!go.visible || !/negras/.test(go.title)) problems.push('[error] el mate no mostró el diálogo correcto');
  await shot('17-gameover');

  // Torneo: empezar, rendirse y comprobar que se pierde una vida
  await page.evaluate(() => { document.querySelector('#goButtons .btn.ghost').click(); });
  await page.evaluate(() => { document.querySelector('[data-action="pause"]').click(); document.querySelector('[data-action="to-menu"]').click(); });
  await sleep(800);
  await page.evaluate(() => { window.__chess3d.showScreen('tournament'); document.querySelector('[data-action="t-play"]').click(); });
  await sleep(7000);
  await page.evaluate(() => { document.querySelector('[data-action="resign"]').click(); });
  await sleep(500);
  await page.evaluate(() => { document.querySelector('[data-cf="yes"]').click(); });
  await sleep(3500);
  const t = await page.evaluate(() => JSON.parse(localStorage.getItem('ajedrez3d.tournament')));
  console.log('Torneo tras rendirse → vidas:', t.lives, 'ronda:', t.round + 1);
  if (t.lives !== 2) problems.push('[error] el torneo no descontó una vida');
  await shot('18-tournament-result');
  await page.evaluate(() => { document.querySelector('#goButtons .btn.primary').click(); });
  await sleep(1500);
}
if (want('tournament')) {
  await page.evaluate(() => { if (window.__chess3d.game) { document.querySelector('[data-action="pause"]').click(); document.querySelector('[data-action="to-menu"]').click(); } });
  await sleep(1200);
  await page.evaluate(() => window.__chess3d.showScreen('tournament'));
  await sleep(1500);
  await shot('13-tournament');
}
if (want('mobile')) {
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  // cambiar isMobile recarga la página: esperar a la intro completa
  await sleep(1500);
  await page.evaluate(() => { window.__chess3d.scene.maxDt = 2; });
  await sleep(9000);
  await shot('14-mobile-menu');
  await page.evaluate(() => { window.__chess3d.startGame({ mode: 'hvc', human: 'w', level: 3, tc: '10+5' }, { moves: ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6'], clock: { w: 588000, b: 594000 } }); window.__chess3d.engine.cancel(); });
  await sleep(9000);
  await shot('15-mobile-game');
}
console.log('\nProblemas de consola:', problems.length ? '\n' + problems.join('\n') : 'ninguno ✔');
await browser.close();
process.exit(problems.some((p) => /error/.test(p)) ? 1 : 0);
