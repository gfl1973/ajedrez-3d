// Uso: node scripts/shot-themes.mjs <sufijo>  -> capturas de cristal y neón (glow 10%)
import puppeteer from 'puppeteer-core';
const tag = process.argv[2] || 'x';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
const errs = []; p.on('console', (m) => m.type() === 'error' && errs.push(m.text())); p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:4173/', { waitUntil: 'load' }); await sleep(6000);
const hide = () => p.evaluate(() => document.querySelectorAll('.screen').forEach((s) => (s.style.display = 'none')));
await hide();
await p.evaluate(() => window.__chess3d.setTheme('glass')); await sleep(2500);
await p.screenshot({ path: `screenshots/cristal-${tag}.png` });
await p.evaluate(() => { window.__chess3d.setTheme('neon'); window.__chess3d.scene.setGlow(0.1); }); await sleep(2500);
await p.screenshot({ path: `screenshots/neon-glow10-${tag}.png` });
console.log(JSON.stringify({ errs }));
await b.close();
