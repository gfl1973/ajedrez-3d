/**
 * Texturas procedurales generadas en <canvas>: madera, mármol, metal cepillado,
 * laca, cuadrícula neón, tablero completo y decal de coordenadas.
 * No se usa ningún recurso externo.
 */
import * as THREE from 'three';

// ---------- Ruido de valor 2D con semilla + fBm ----------
function makeNoise(seed = 1) {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = seed * 9301 + 49297;
  for (let i = 255; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = new Float32Array(256);
  for (let i = 0; i < 256; i++) grad[i] = (perm[i] / 255) * 2 - 1;
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const a = grad[perm[X + perm[Y]]], b = grad[perm[X + 1 + perm[Y]]];
    const c = grad[perm[X + perm[Y + 1]]], d = grad[perm[X + 1 + perm[Y + 1]]];
    const u = fade(xf), v = fade(yf);
    return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
  };
  const fbm = (x, y, oct = 5) => {
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { sum += noise(x * f, y * f) * amp; norm += amp; amp *= 0.5; f *= 2.03; }
    return sum / norm;
  };
  return { noise, fbm };
}

const hex = (c) => { const col = new THREE.Color(c); return [col.r * 255, col.g * 255, col.b * 255]; };
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function paint(size, fn) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [r, g, b] = fn(x, y);
    const i = (y * size + x) * 4;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function toTexture(c, { repeat = 1, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// ---------- Patrones ----------
export function woodCanvas(size, { light = '#c89b63', dark = '#7a4a22', rings = 26, seed = 3, stretch = 6 } = {}) {
  const { fbm, noise } = makeNoise(seed);
  const L = hex(light), D = hex(dark);
  return paint(size, (x, y) => {
    const u = x / size, v = y / size;
    const warp = fbm(u * 3, v * 3 / stretch * 2, 4) * 2.2;
    let r = (u * rings + warp * 3.0);
    r = r - Math.floor(r);
    let t = Math.pow(Math.abs(Math.sin(r * Math.PI)), 0.8);
    const fine = noise(u * 260, v * 10) * 0.1;
    t = clamp01(0.42 + t * 0.45 + fine + fbm(u * 40, v * 3, 3) * 0.2);
    return [mix(D[0], L[0], t), mix(D[1], L[1], t), mix(D[2], L[2], t)];
  });
}

export function marbleCanvas(size, { base = '#f2efe9', vein = '#8c8a86', vein2 = null, scale = 3, sharp = 6, seed = 7, cloud = 0.12 } = {}) {
  const { fbm } = makeNoise(seed);
  const B = hex(base), V = hex(vein), V2 = vein2 ? hex(vein2) : V;
  const sc = scale * 0.55;
  return paint(size, (x, y) => {
    const u = x / size * sc, v = y / size * sc;
    // deformación de dominio: vetas orgánicas y no curvas de nivel
    const qx = fbm(u + 1.7, v + 9.2, 4), qy = fbm(u + 8.3, v + 2.8, 4);
    const n = fbm(u + 3.2 * qx, v + 3.2 * qy, 6);
    const ridge = 1 - Math.min(1, Math.abs(n) * (2.2 + sharp * 0.25));
    const main = Math.pow(Math.max(0, ridge), 3 + sharp * 0.8);
    const n2 = fbm(u * 2.1 + 4.0 * qy + 20, v * 2.1 + 4.0 * qx, 5);
    const thin = Math.pow(Math.max(0, 1 - Math.abs(n2) * 9), 6) * 0.55;
    const cl = fbm(u * 2.5 + 7, v * 2.5 + 3, 5) * cloud * 2.2 + qx * cloud;
    let r = B[0] * (1 + cl), g = B[1] * (1 + cl), b = B[2] * (1 + cl);
    r = mix(r, V2[0], thin); g = mix(g, V2[1], thin); b = mix(b, V2[2], thin);
    r = mix(r, V[0], main); g = mix(g, V[1], main); b = mix(b, V[2], main);
    return [r, g, b];
  });
}

export function brushedCanvas(size, { base = '#b8bcc2', seed = 11, contrast = 0.18 } = {}) {
  const { noise, fbm } = makeNoise(seed);
  const B = hex(base);
  return paint(size, (x, y) => {
    const u = x / size, v = y / size;
    const t = noise(u * 2, v * 400) * 0.6 + noise(u * 6, v * 900) * 0.4 + fbm(u * 3, v * 3, 3) * 0.5;
    const k = 1 + t * contrast;
    return [B[0] * k, B[1] * k, B[2] * k];
  });
}

export function lacquerCanvas(size, { base = '#101012', seed = 5, var: vr = 0.06 } = {}) {
  const { fbm } = makeNoise(seed);
  const B = hex(base);
  return paint(size, (x, y) => {
    const k = 1 + fbm(x / size * 5, y / size * 5, 4) * vr;
    return [B[0] * k, B[1] * k, B[2] * k];
  });
}

export function roughnessCanvas(size, { base = 0.3, amp = 0.15, seed = 21, scale = 8 } = {}) {
  const { fbm } = makeNoise(seed);
  return paint(size, (x, y) => {
    const v = clamp01(base + fbm(x / size * scale, y / size * scale, 5) * amp) * 255;
    return [v, v, v];
  });
}

// ---------- Tablero ----------
/**
 * Compone el tablero 8x8 recortando trozos aleatorios de dos texturas fuente,
 * con finas juntas de taracea entre casillas.
 */
export function boardTexture({ lightSrc, darkSrc, groove = 'rgba(0,0,0,0.35)', size = 1024, seed = 42, grid = null }) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const cell = size / 8;
  let s = seed;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const light = (r + f) % 2 === 1; // a1 oscura
    const src = light ? lightSrc : darkSrc;
    const cw = src.width * 0.45;
    const sx = rand() * (src.width - cw), sy = rand() * (src.height - cw);
    ctx.save();
    // fila 0 del canvas = fila 8 del tablero (la textura se mapea con v hacia arriba)
    ctx.translate(f * cell + cell / 2, (7 - r) * cell + cell / 2);
    ctx.rotate(Math.floor(rand() * 4) * Math.PI / 2);
    ctx.drawImage(src, sx, sy, cw, cw, -cell / 2, -cell / 2, cell, cell);
    ctx.restore();
  }
  if (groove) {
    ctx.strokeStyle = groove; ctx.lineWidth = Math.max(1, size / 700);
    for (let i = 1; i < 8; i++) {
      ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(size, i * cell); ctx.stroke();
    }
  }
  if (grid) {
    ctx.strokeStyle = grid; ctx.lineWidth = size / 220; ctx.shadowColor = grid; ctx.shadowBlur = size / 60;
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(size, i * cell); ctx.stroke();
    }
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Máscara emisiva sólo con las líneas de la cuadrícula (tema neón). */
export function gridEmissiveTexture(color = '#00e5ff', size = 1024) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size);
  const cell = size / 8;
  ctx.strokeStyle = color; ctx.lineWidth = size / 300; ctx.shadowColor = color; ctx.shadowBlur = size / 50;
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(size, i * cell); ctx.stroke();
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Letras y números del marco, en un decal transparente. */
export function coordsTexture({ color = '#d9b45a', inner = 8, outer = 9.4, size = 2048, font = 'Cormorant Garamond' }) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const px = size / outer, border = (outer - inner) / 2 * px;
  ctx.fillStyle = color;
  ctx.font = `600 ${Math.round(border * 0.55)}px "${font}", Georgia, serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const files = 'abcdefgh';
  for (let i = 0; i < 8; i++) {
    const x = border + (i + 0.5) * px;
    ctx.fillText(files[i], x, size - border / 2);
    ctx.save(); ctx.translate(x, border / 2); ctx.rotate(Math.PI); ctx.fillText(files[i], 0, 0); ctx.restore();
    const y = size - border - (i + 0.5) * px;
    ctx.fillText(String(i + 1), border / 2, y);
    ctx.save(); ctx.translate(size - border / 2, y); ctx.rotate(Math.PI); ctx.fillText(String(i + 1), 0, 0); ctx.restore();
  }
  // fino filete dorado alrededor de las casillas
  ctx.strokeStyle = color; ctx.globalAlpha = 0.85; ctx.lineWidth = px * 0.025;
  ctx.strokeRect(border - px * 0.06, border - px * 0.06, inner * px + px * 0.12, inner * px + px * 0.12);
  ctx.globalAlpha = 0.45; ctx.lineWidth = px * 0.012;
  ctx.strokeRect(px * 0.16, px * 0.16, size - px * 0.32, size - px * 0.32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** Fondo: degradado radial suave con viñeteado. */
export function backgroundTexture(inner = '#2a2420', outer = '#050506') {
  const c = canvas(1024);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(512, 430, 40, 512, 512, 720);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 1024);
  // grano sutil para evitar bandas
  const img = ctx.getImageData(0, 0, 1024, 1024), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 6; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Suelo: degradado radial (mesa en penumbra). */
export function floorTexture(center = '#1b1714', edge = '#060606') {
  const c = canvas(1024);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(512, 512, 0, 512, 512, 512);
  g.addColorStop(0, center); g.addColorStop(0.55, edge); g.addColorStop(1, edge);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 1024);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Disco suave para partículas / brillos. */
export function softDiscTexture() {
  const c = canvas(128);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export { toTexture };
