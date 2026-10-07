/**
 * Piezas modeladas proceduralmente (estilo Staunton): perfiles de torno
 * (LatheGeometry), almenas y cabeza de caballo extruidas, cruz del rey, etc.
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const SEG = 64;
const V = (x, y) => new THREE.Vector2(x, y);

/** Perfil de base común a todas las piezas. */
function base(r = 0.38, top = 0.18, neck = 0.25) {
  return [
    V(0, 0), V(r * 0.97, 0), V(r, 0.012), V(r, 0.055), V(r * 0.985, 0.068),
    V(r * 0.93, 0.085), V(r * 0.83, 0.1), V(r * 0.78, 0.115), V(r * 0.8, 0.13),
    V(r * 0.82, 0.142), V(r * 0.78, 0.155), V(neck + 0.02, top - 0.005), V(neck, top),
  ];
}

/** Arco de circunferencia para el perfil (cabezas, bolas). */
function arc(cx, cy, r, a0, a1, n = 14) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    pts.push(V(Math.max(0, cx + Math.cos(a) * r), cy + Math.sin(a) * r));
  }
  return pts;
}

/** Suaviza un perfil con una curva Catmull-Rom (manteniendo los extremos). */
function smooth(points, divisions = 3) {
  const out = [];
  const curve = new THREE.SplineCurve(points);
  const n = points.length * divisions;
  for (let i = 0; i <= n; i++) out.push(curve.getPoint(i / n));
  return out;
}

function lathe(points, seg = SEG) {
  const g = new THREE.LatheGeometry(points, seg);
  return g.toNonIndexed();
}

function prep(g) {
  const ng = g.index ? g.toNonIndexed() : g;
  if (!ng.attributes.uv) {
    const count = ng.attributes.position.count;
    ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
  }
  for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k);
  return ng;
}

/** Normales suaves para geometrías extruidas: fusiona vértices por posición y recalcula. */
function smoothExtrude(g, uvScale = 1.2) {
  const pos = new THREE.BufferGeometry();
  pos.setAttribute('position', g.attributes.position.clone());
  const merged = mergeVertices(pos, 1e-4);
  merged.computeVertexNormals();
  const out = merged.toNonIndexed();
  const p = out.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * uvScale + 0.5; uv[i * 2 + 1] = p.getY(i) * uvScale + p.getZ(i) * 0.3; }
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

function pawn() {
  const pts = [
    ...base(0.34, 0.17, 0.22),
    V(0.19, 0.21), V(0.15, 0.27), V(0.125, 0.34), V(0.11, 0.41), V(0.105, 0.445),
    V(0.165, 0.455), V(0.175, 0.47), V(0.16, 0.485), V(0.11, 0.5), V(0.095, 0.51),
  ];
  const head = arc(0, 0.615, 0.13, -Math.PI / 2 + 0.55, Math.PI / 2, 16);
  return lathe([...pts, ...head]);
}

function rook() {
  const pts = [
    ...base(0.37, 0.18, 0.26),
    V(0.235, 0.23), V(0.215, 0.32), V(0.205, 0.45), V(0.205, 0.56), V(0.22, 0.6),
    V(0.26, 0.625), V(0.275, 0.64), V(0.275, 0.665), V(0.255, 0.68), V(0.255, 0.79),
    V(0.17, 0.79), V(0.17, 0.74), V(0, 0.74),
  ];
  const geos = [lathe(pts)];
  // almenas: sectores anulares extruidos
  const n = 6, span = (Math.PI * 2) / n, gap = 0.36;
  for (let i = 0; i < n; i++) {
    const a0 = i * span + gap / 2, a1 = (i + 1) * span - gap / 2;
    const s = new THREE.Shape();
    s.absarc(0, 0, 0.255, a0, a1, false);
    s.absarc(0, 0, 0.17, a1, a0, true);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 2, curveSegments: 8 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.785, 0);
    geos.push(g);
  }
  return mergeGeometries(geos.map((g, i) => (i === 0 ? prep(g) : smoothExtrude(g, 2))));
}

function knight() {
  const pts = [...base(0.37, 0.17, 0.25), V(0.25, 0.2), V(0.26, 0.215), V(0.24, 0.235), V(0.0, 0.24)];
  const geos = [lathe(pts)];
  // perfil de la cabeza del caballo (mirando hacia +X)
  const s = new THREE.Shape();
  s.moveTo(-0.23, 0.2);
  s.lineTo(0.2, 0.2);
  s.splineThru([
    V(0.17, 0.32), V(0.11, 0.43), V(0.15, 0.5), V(0.26, 0.55), V(0.335, 0.6),
    V(0.35, 0.66), V(0.31, 0.71), V(0.21, 0.77), V(0.135, 0.84),
  ]);
  s.lineTo(0.11, 0.92); s.lineTo(0.075, 0.99); s.lineTo(0.035, 0.93);
  s.splineThru([V(-0.07, 0.915), V(-0.17, 0.85), V(-0.24, 0.72), V(-0.275, 0.55), V(-0.275, 0.38), V(-0.245, 0.25)]);
  s.lineTo(-0.23, 0.2);
  const head = new THREE.ExtrudeGeometry(s, { depth: 0.19, bevelEnabled: true, bevelThickness: 0.065, bevelSize: 0.04, bevelSegments: 6, curveSegments: 22 });
  head.translate(0, 0, -0.095);
  // afinar el hocico y ensanchar el cuello para que no parezca una losa
  const hp = head.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i), y = hp.getY(i);
    const k = 1.18 - 0.5 * Math.min(1, Math.max(0, (x + 0.05) / 0.4)) - 0.12 * Math.min(1, Math.max(0, (y - 0.75) / 0.25));
    hp.setZ(i, hp.getZ(i) * k);
  }
  geos.push(smoothExtrude(head));
  // crin: pequeñas crestas a lo largo del cuello
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const x = -0.13 - t * 0.12, y = 0.86 - t * 0.33;
    const b = new THREE.SphereGeometry(0.045, 10, 8);
    b.scale(0.9, 1.1, 1.6);
    b.translate(x, y, 0);
    geos.push(prep(b));
  }
  // ojos
  for (const z of [-0.105, 0.105]) {
    const e = new THREE.SphereGeometry(0.022, 10, 8);
    e.translate(0.2, 0.745, z * 0.92);
    geos.push(prep(e));
  }
  return mergeGeometries(geos.map(prep));
}

function bishop() {
  const pts = [
    ...base(0.36, 0.17, 0.24),
    V(0.2, 0.22), V(0.16, 0.3), V(0.135, 0.42), V(0.12, 0.56), V(0.118, 0.6),
    V(0.19, 0.615), V(0.205, 0.635), V(0.19, 0.655), V(0.13, 0.67), V(0.15, 0.69),
  ];
  const mitre = smooth([V(0.15, 0.69), V(0.17, 0.75), V(0.165, 0.82), V(0.13, 0.9), V(0.075, 0.96), V(0.03, 0.985)], 3);
  const ball = arc(0, 1.03, 0.05, -Math.PI / 2 + 0.3, Math.PI / 2, 10);
  return lathe([...pts, ...mitre.slice(1), V(0.025, 0.99), ...ball]);
}

function queen() {
  const pts = [
    ...base(0.39, 0.18, 0.27),
    V(0.24, 0.23), V(0.19, 0.32), V(0.155, 0.46), V(0.135, 0.62), V(0.13, 0.74),
    V(0.215, 0.765), V(0.23, 0.785), V(0.215, 0.805), V(0.15, 0.825), V(0.165, 0.845),
    V(0.15, 0.865),
  ];
  const crown = smooth([V(0.15, 0.865), V(0.17, 0.93), V(0.215, 1.02), V(0.25, 1.085)], 3);
  const top = [V(0.24, 1.1), V(0.2, 1.09), V(0.14, 1.1), V(0.1, 1.13), V(0.075, 1.16)];
  const ball = arc(0, 1.215, 0.06, -Math.PI / 2 + 0.6, Math.PI / 2, 10);
  const geos = [lathe([...pts, ...crown.slice(1), ...top, ...ball])];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const b = new THREE.SphereGeometry(0.036, 12, 10);
    b.translate(Math.cos(a) * 0.235, 1.115, Math.sin(a) * 0.235);
    geos.push(prep(b));
  }
  return mergeGeometries(geos.map(prep));
}

function king() {
  const pts = [
    ...base(0.4, 0.18, 0.28),
    V(0.25, 0.23), V(0.2, 0.33), V(0.163, 0.48), V(0.145, 0.65), V(0.14, 0.8),
    V(0.225, 0.825), V(0.24, 0.845), V(0.225, 0.865), V(0.16, 0.885), V(0.175, 0.905),
    V(0.16, 0.925),
  ];
  const crown = smooth([V(0.16, 0.925), V(0.18, 1.0), V(0.21, 1.08), V(0.225, 1.12)], 3);
  const top = [V(0.22, 1.135), V(0.19, 1.15), V(0.12, 1.175), V(0.06, 1.19), V(0.0, 1.195)];
  const geos = [lathe([...pts, ...crown.slice(1), ...top])];
  const v = new THREE.BoxGeometry(0.075, 0.27, 0.075);
  v.translate(0, 1.32, 0);
  const h = new THREE.BoxGeometry(0.21, 0.07, 0.075);
  h.translate(0, 1.36, 0);
  const nub = new THREE.CylinderGeometry(0.05, 0.07, 0.05, 24);
  nub.translate(0, 1.205, 0);
  geos.push(prep(v), prep(h), prep(nub));
  return mergeGeometries(geos.map(prep));
}

const BUILDERS = { p: pawn, r: rook, n: knight, b: bishop, q: queen, k: king };
let cache = null;

/** Devuelve (y cachea) la geometría de cada tipo de pieza. */
export function pieceGeometries() {
  if (cache) return cache;
  cache = {};
  for (const [k, fn] of Object.entries(BUILDERS)) {
    const g = fn();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    cache[k] = g;
  }
  return cache;
}
