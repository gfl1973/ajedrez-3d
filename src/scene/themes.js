/**
 * Juegos de materiales (temas). Cada tema construye perezosamente sus
 * materiales PBR y texturas procedurales y los cachea.
 */
import * as THREE from 'three';
import {
  woodCanvas, marbleCanvas, brushedCanvas, lacquerCanvas, roughnessCanvas,
  boardTexture, gridEmissiveTexture, toTexture,
} from './textures.js';

const phys = (o) => new THREE.MeshPhysicalMaterial(o);

export const THEMES = [
  {
    id: 'noir', name: 'Ébano y Oro', desc: 'Oro pulido frente a obsidiana, sobre mármol marfil y laca negra.',
    accent: '#d8b46a', accentSoft: 'rgba(216,180,106,0.35)', swatch: ['#e6c068', '#0b0b0d'],
    bg: ['#2a2219', '#040404'], floor: ['#1d1812', '#050505'],
    env: 0.42, reflection: 0.5, bloom: { strength: 0.2, radius: 0.4, threshold: 1.0 },
    key: ['#ffe9c7', 1.7], rim: ['#9fb8ff', 0.8], coords: '#d9b45a', particles: '#f3d48a',
    build() {
      const light = marbleCanvas(512, { base: '#ece4d2', vein: '#b9a27a', vein2: '#d8c9a8', scale: 2.4, sharp: 7, seed: 4 });
      const dark = marbleCanvas(512, { base: '#0c0c0e', vein: '#4a3d27', vein2: '#8a7444', scale: 2.2, sharp: 9, seed: 9, cloud: 0.4 });
      const frameTex = toTexture(woodCanvas(512, { light: '#2a1a12', dark: '#0a0605', rings: 18, seed: 5 }), { repeat: 0.18 });
      return {
        board: phys({ map: boardTexture({ lightSrc: light, darkSrc: dark, groove: 'rgba(160,125,60,0.55)' }), roughness: 0.24, clearcoat: 0.7, clearcoatRoughness: 0.18, metalness: 0, specularIntensity: 0.55 }),
        frame: phys({ map: frameTex, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08, color: '#ffffff' }),
        w: phys({ color: '#e9c46f', metalness: 1, roughness: 0.16, clearcoat: 0.6, clearcoatRoughness: 0.12 }),
        b: phys({ color: '#0a0a0c', metalness: 0.1, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.8 }),
      };
    },
  },
  {
    id: 'marble', name: 'Mármol de Carrara', desc: 'Blanco de Carrara y Nero Marquina con vetas talladas a mano.',
    accent: '#e2d6c0', accentSoft: 'rgba(226,214,192,0.35)', swatch: ['#f1efe9', '#141416'],
    bg: ['#2b2a29', '#050505'], floor: ['#1c1a18', '#060606'],
    env: 0.45, reflection: 0.4, bloom: { strength: 0.16, radius: 0.4, threshold: 0.97 },
    key: ['#fff4e6', 1.55], rim: ['#c6d4ff', 0.7], coords: '#e8dcc4', particles: '#ffffff',
    build() {
      const light = marbleCanvas(512, { base: '#f3f1ec', vein: '#9a9890', vein2: '#c9c6bd', scale: 3, sharp: 7, seed: 12 });
      const dark = marbleCanvas(512, { base: '#151517', vein: '#d8d4cc', vein2: '#6b6965', scale: 2.6, sharp: 10, seed: 3, cloud: 0.3 });
      const wLight = marbleCanvas(512, { base: '#f6f4ef', vein: '#a9a69e', scale: 2, sharp: 8, seed: 31 });
      const wDark = marbleCanvas(512, { base: '#121214', vein: '#cfcac0', scale: 2, sharp: 12, seed: 32, cloud: 0.3 });
      const frameTex = toTexture(woodCanvas(512, { light: '#6b4428', dark: '#2a160b', rings: 22, seed: 8 }), { repeat: 0.18 });
      return {
        board: phys({ map: boardTexture({ lightSrc: light, darkSrc: dark, groove: 'rgba(0,0,0,0.4)' }), roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.18, specularIntensity: 0.6 }),
        frame: phys({ map: frameTex, roughness: 0.45, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
        w: phys({ map: toTexture(wLight), roughness: 0.22, clearcoat: 0.7, clearcoatRoughness: 0.1, sheen: 0.3 }),
        b: phys({ map: toTexture(wDark), roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05 }),
      };
    },
  },
  {
    id: 'wood', name: 'Madera Noble', desc: 'Boj y ébano torneados, tablero de arce y nogal con marco de caoba.',
    accent: '#d9a463', accentSoft: 'rgba(217,164,99,0.35)', swatch: ['#e0bc86', '#2a170e'],
    bg: ['#2c1e14', '#050403'], floor: ['#21160e', '#060403'],
    env: 0.42, reflection: 0.25, bloom: { strength: 0.14, radius: 0.4, threshold: 0.97 },
    key: ['#ffe2b8', 1.8], rim: ['#ffd2a0', 0.6], coords: '#e3b779', particles: '#ffcf8a',
    build() {
      const light = woodCanvas(512, { light: '#e8c99a', dark: '#c49a62', rings: 30, seed: 2 });
      const dark = woodCanvas(512, { light: '#7a4c2a', dark: '#3d220f', rings: 26, seed: 6 });
      const box = woodCanvas(512, { light: '#ecd1a0', dark: '#c99d62', rings: 14, seed: 13 });
      const ebony = woodCanvas(512, { light: '#3a2318', dark: '#120806', rings: 12, seed: 14 });
      const frameTex = toTexture(woodCanvas(512, { light: '#8a3f22', dark: '#3b150a', rings: 20, seed: 15 }), { repeat: 0.18 });
      const rough = toTexture(roughnessCanvas(256, { base: 0.42, amp: 0.25 }), { srgb: false });
      return {
        board: phys({ map: boardTexture({ lightSrc: light, darkSrc: dark, groove: 'rgba(30,15,5,0.6)' }), roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.18 }),
        frame: phys({ map: frameTex, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
        w: phys({ map: toTexture(box), roughnessMap: rough, roughness: 1, clearcoat: 0.5, clearcoatRoughness: 0.25 }),
        b: phys({ map: toTexture(ebony), roughnessMap: rough, roughness: 0.9, clearcoat: 0.7, clearcoatRoughness: 0.15 }),
      };
    },
  },
  {
    id: 'metal', name: 'Cromo y Bronce', desc: 'Cromo espejo frente a bronce envejecido sobre acero cepillado.',
    accent: '#c3d0de', accentSoft: 'rgba(195,208,222,0.35)', swatch: ['#e9edf2', '#a2643a'],
    bg: ['#1d2229', '#030405'], floor: ['#15181c', '#040405'],
    env: 0.6, reflection: 0.45, bloom: { strength: 0.16, radius: 0.35, threshold: 1.05 },
    key: ['#ffffff', 1.5], rim: ['#a9c8ff', 1.0], coords: '#cfd8e3', particles: '#cfe0ff',
    build() {
      const light = brushedCanvas(512, { base: '#c4c8ce', seed: 3 });
      const dark = brushedCanvas(512, { base: '#2a2d32', seed: 4, contrast: 0.3 });
      const frameTex = toTexture(brushedCanvas(512, { base: '#3b3f46', seed: 7 }), { repeat: 0.2 });
      const brushedRough = toTexture(roughnessCanvas(256, { base: 0.32, amp: 0.2, scale: 30 }), { srgb: false });
      return {
        board: phys({ map: boardTexture({ lightSrc: light, darkSrc: dark, groove: 'rgba(0,0,0,0.5)' }), metalness: 0.85, roughness: 0.32 }),
        frame: phys({ map: frameTex, metalness: 0.9, roughness: 0.3, roughnessMap: brushedRough }),
        w: phys({ color: '#e8ebef', metalness: 1, roughness: 0.06 }),
        b: phys({ color: '#a8673b', metalness: 1, roughness: 0.28, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
      };
    },
  },
  {
    id: 'glass', name: 'Cristal', desc: 'Cristal tallado transparente frente a zafiro, sobre vidrio esmerilado.',
    accent: '#9fd8ff', accentSoft: 'rgba(159,216,255,0.35)', swatch: ['#eaf6ff', '#2c48d8'],
    bg: ['#18222e', '#030407'], floor: ['#121a24', '#030406'],
    env: 0.65, reflection: 0.5, bloom: { strength: 0.22, radius: 0.45, threshold: 0.92 },
    key: ['#ffffff', 1.5], rim: ['#8fc8ff', 1.1], coords: '#bfe3ff', particles: '#bfe6ff',
    build() {
      const light = marbleCanvas(512, { base: '#dfe6ee', vein: '#c5d0dc', scale: 2, sharp: 3, seed: 21, cloud: 0.05 });
      const dark = lacquerCanvas(512, { base: '#0a0e16', var: 0.25 });
      const frameTex = toTexture(brushedCanvas(512, { base: '#9aa3ad', seed: 8 }), { repeat: 0.2 });
      return {
        board: phys({ map: boardTexture({ lightSrc: light, darkSrc: dark, groove: 'rgba(170,210,255,0.35)' }), roughness: 0.16, clearcoat: 0.7, clearcoatRoughness: 0.15, metalness: 0.05, specularIntensity: 0.6 }),
        frame: phys({ map: frameTex, metalness: 1, roughness: 0.22 }),
        w: phys({ color: '#ffffff', transmission: 1, thickness: 0.7, roughness: 0.03, ior: 1.52, metalness: 0, clearcoat: 1, attenuationColor: new THREE.Color('#dff1ff'), attenuationDistance: 2.5, specularIntensity: 1 }),
        b: phys({ color: '#5d7cff', transmission: 1, thickness: 0.7, roughness: 0.05, ior: 1.6, metalness: 0, clearcoat: 1, attenuationColor: new THREE.Color('#1b2fb0'), attenuationDistance: 0.55, specularIntensity: 1 }),
      };
    },
  },
  {
    id: 'neon', name: 'Medianoche Neón', desc: 'Perla cian y amatista luminosa sobre una rejilla de neón.',
    accent: '#3ef0ff', accentSoft: 'rgba(62,240,255,0.35)', swatch: ['#bff8ff', '#ff3fd2'],
    bg: ['#1a0f2e', '#020107'], floor: ['#140c24', '#020106'],
    env: 0.3, reflection: 0.55, bloom: { strength: 0.6, radius: 0.5, threshold: 0.6 },
    key: ['#c7b8ff', 1.0], rim: ['#ff4fd8', 1.4], coords: '#3ef0ff', particles: '#7af6ff',
    build() {
      const light = lacquerCanvas(512, { base: '#1a1826', var: 0.3, seed: 2 });
      const dark = lacquerCanvas(512, { base: '#07060c', var: 0.3, seed: 3 });
      const frameTex = toTexture(lacquerCanvas(256, { base: '#0c0a14' }), { repeat: 0.2 });
      return {
        board: phys({ map: boardTexture({ lightSrc: light, darkSrc: dark, groove: null }), emissiveMap: gridEmissiveTexture('#3ef0ff'), emissive: new THREE.Color('#3ef0ff'), emissiveIntensity: 1.1, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.04 }),
        frame: phys({ map: frameTex, roughness: 0.2, metalness: 0.6, clearcoat: 1 }),
        w: phys({ color: '#8fdbe8', metalness: 0.55, roughness: 0.22, emissive: new THREE.Color('#13c8f0'), emissiveIntensity: 0.22, clearcoat: 1, envMapIntensity: 0.8 }),
        b: phys({ color: '#2a0a2c', metalness: 0.5, roughness: 0.2, emissive: new THREE.Color('#ff2bd0'), emissiveIntensity: 0.5, clearcoat: 1 }),
      };
    },
  },
];

export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
