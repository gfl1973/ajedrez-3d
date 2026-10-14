/**
 * Escena 3D del ajedrez: tablero, piezas, reflejos, sombras, partículas,
 * marcadores, animaciones de cámara y de jugadas, y selección con el ratón.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { pieceGeometries } from './pieces.js';
import { THEMES, themeById } from './themes.js';
import { coordsTexture, backgroundTexture, floorTexture, softDiscTexture } from './textures.js';

const FILES = 'abcdefgh';
const TABLE_Y = -0.42;
export const ease = {
  linear: (t) => t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outBounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

export const squareToXZ = (sq) => ({ x: FILES.indexOf(sq[0]) - 3.5, z: 3.5 - (parseInt(sq[1], 10) - 1) });
function xzToSquare(x, z) {
  const f = Math.floor(x + 4), r = Math.floor(4 - z);
  if (f < 0 || f > 7 || r < 0 || r > 7) return null;
  return FILES[f] + (r + 1);
}

// Sombreador del reflejo: desenfoque suave + Fresnel, mezclado de forma aditiva
const ReflectionShader = {
  name: 'BoardReflection',
  uniforms: {
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    strength: { value: 0.4 }, texel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
  },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float strength;
    uniform vec2 texel;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main() {
      vec2 uv = vUv.xy / vUv.w;
      vec3 c = vec3(0.0);
      float tot = 0.0;
      for (int i = -2; i <= 2; i++) {
        for (int j = -2; j <= 2; j++) {
          float w = 1.0 / (1.0 + float(i * i + j * j));
          c += texture2D(tDiffuse, uv + vec2(float(i), float(j)) * texel * 1.6).rgb * w;
          tot += w;
        }
      }
      c /= tot;
      vec3 V = normalize(cameraPosition - vWorld);
      float fres = 0.45 + 0.55 * pow(1.0 - clamp(V.y, 0.0, 1.0), 2.5);
      gl_FragColor = vec4(c * color * strength * fres, 1.0);
    }`,
};

// Partículas tipo polvo dorado / bokeh
const DustShader = {
  vertexShader: /* glsl */`
    uniform float uTime;
    uniform float uPixelRatio;
    attribute float aSize;
    attribute float aPhase;
    varying float vAlpha;
    void main() {
      vec3 p = position;
      p.x += sin(uTime * 0.11 + aPhase * 6.28) * 0.7;
      p.z += cos(uTime * 0.09 + aPhase * 4.0) * 0.7;
      p.y += mod(uTime * (0.05 + aPhase * 0.08) + aPhase * 8.0, 8.0) - 1.0;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aSize * uPixelRatio * (220.0 / -mv.z);
      float lifeY = mod(uTime * (0.05 + aPhase * 0.08) + aPhase * 8.0, 8.0) / 8.0;
      vAlpha = (0.35 + 0.65 * sin(uTime * (0.6 + aPhase) + aPhase * 20.0) * 0.5 + 0.5) * smoothstep(0.0, 0.15, lifeY) * smoothstep(1.0, 0.75, lifeY);
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uColor;
    uniform float uOpacity;
    varying float vAlpha;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.0, d);
      a = a * a;
      gl_FragColor = vec4(uColor, a * vAlpha * uOpacity);
    }`,
};

export class ChessScene {
  constructor(container) {
    this.container = container;
    this.tweens = [];
    this.pieceAt = new Map();
    this.trays = { w: [], b: [] };
    this.timer = new THREE.Timer();
    this.quality = 'alta';
    this.animSpeed = 1;
    this.maxDt = 0.1; // evita saltos tras cambiar de pestaña
    this.onSquareClick = null;
    this.isSelectable = () => false;
    this.selected = null;
    this.exposure = 0.95; // brillo (tone mapping)
    this.glow = 1; // 0..1, escala del bloom y emisivos

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = this.exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = this.envMap;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.1, 200);
    this.target = new THREE.Vector3(0, -0.25, 0);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    Object.assign(this.controls, {
      enableDamping: true, dampingFactor: 0.07, enablePan: false, minDistance: 8, maxDistance: 26,
      maxPolarAngle: 1.36, minPolarAngle: 0.15, rotateSpeed: 0.6, zoomSpeed: 0.8, autoRotateSpeed: 0.35,
    });
    this.controls.target.copy(this.target);
    this.setSpherical({ r: 36, phi: 1.32, theta: -2.6 });

    this.buildLights();
    this.buildBoard();
    this.buildMarkers();
    this.buildDust();
    this.buildComposer();
    this.geos = pieceGeometries();
    this.piecesGroup = new THREE.Group();
    scene.add(this.piecesGroup);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.bindPointer();
    window.addEventListener('resize', () => this.resize());
    this.setTheme('noir');
    this.loop = this.loop.bind(this);
    renderer.setAnimationLoop(this.loop);
  }

  // ---------- Construcción ----------
  buildLights() {
    const key = new THREE.DirectionalLight(0xffffff, 2.5);
    key.position.set(6, 13, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 2, far: 35 });
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.025; key.shadow.radius = 5;
    this.scene.add(key);
    this.keyLight = key;
    const rim = new THREE.DirectionalLight(0x9fb8ff, 1);
    rim.position.set(-6, 11, -9);
    this.scene.add(rim);
    this.rimLight = rim;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x111111, 0.12);
    this.scene.add(this.hemi);
    // foco cenital suave para dar dramatismo sobre el tablero
    const spot = new THREE.SpotLight(0xfff0dd, 7, 30, 0.42, 0.9, 1.6);
    spot.position.set(0, 14, 0);
    spot.target.position.set(0, 0, 0);
    this.scene.add(spot, spot.target);
    this.spot = spot;
  }

  buildBoard() {
    const g = new THREE.Group();
    this.boardGroup = g;
    this.scene.add(g);
    // casillas
    const top = new THREE.PlaneGeometry(8, 8);
    top.rotateX(-Math.PI / 2);
    this.boardTop = new THREE.Mesh(top, new THREE.MeshStandardMaterial());
    this.boardTop.receiveShadow = true;
    g.add(this.boardTop);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(8.05, 0.4, 8.05), new THREE.MeshStandardMaterial({ color: 0x050505 }));
    slab.position.y = -0.205;
    g.add(slab);
    // marco biselado con hueco central
    const outer = 9.4, inner = 8.06, rr = 0.16;
    const s = new THREE.Shape();
    const h = outer / 2;
    s.moveTo(-h + rr, -h); s.lineTo(h - rr, -h); s.quadraticCurveTo(h, -h, h, -h + rr);
    s.lineTo(h, h - rr); s.quadraticCurveTo(h, h, h - rr, h); s.lineTo(-h + rr, h);
    s.quadraticCurveTo(-h, h, -h, h - rr); s.lineTo(-h, -h + rr); s.quadraticCurveTo(-h, -h, -h + rr, -h);
    const hole = new THREE.Path();
    const ih = inner / 2;
    hole.moveTo(-ih, -ih); hole.lineTo(-ih, ih); hole.lineTo(ih, ih); hole.lineTo(ih, -ih); hole.lineTo(-ih, -ih);
    s.holes.push(hole);
    const fg = new THREE.ExtrudeGeometry(s, { depth: 0.4, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 4, curveSegments: 6 });
    fg.rotateX(-Math.PI / 2);
    fg.translate(0, TABLE_Y + 0.03, 0);
    this.frame = new THREE.Mesh(fg, new THREE.MeshStandardMaterial());
    this.frame.castShadow = true; this.frame.receiveShadow = true;
    g.add(this.frame);
    // decal de coordenadas sobre el marco
    const decal = new THREE.PlaneGeometry(outer, outer);
    decal.rotateX(-Math.PI / 2);
    this.coords = new THREE.Mesh(decal, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
    this.coords.position.y = 0.0415;
    this.coords.renderOrder = 3;
    g.add(this.coords);
    // reflejo real de las piezas sobre las casillas
    const refl = new Reflector(new THREE.PlaneGeometry(8, 8), {
      textureWidth: 1024, textureHeight: 1024, clipBias: 0.002, shader: ReflectionShader, multisample: 0, color: 0xffffff,
    });
    refl.rotation.x = -Math.PI / 2;
    refl.position.y = 0.002;
    Object.assign(refl.material, { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    refl.renderOrder = 1;
    this.reflector = refl;
    g.add(refl);
    // mesa / suelo
    const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, color: 0x707070, envMapIntensity: 0.4 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = TABLE_Y;
    floor.receiveShadow = true;
    this.floor = floor;
    this.scene.add(floor);
  }

  buildMarkers() {
    const mk = new THREE.Group();
    this.markers = mk;
    this.scene.add(mk);
    const sqGeo = new THREE.PlaneGeometry(0.96, 0.96); sqGeo.rotateX(-Math.PI / 2);
    const glowTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d');
      const g = x.createRadialGradient(64, 64, 10, 64, 64, 92);
      g.addColorStop(0, 'rgba(255,255,255,0.15)'); g.addColorStop(0.75, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,1)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    const mat = (opacity) => new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const mkSquare = (op, order = 4) => { const m = new THREE.Mesh(sqGeo, mat(op)); m.renderOrder = order; m.visible = false; m.position.y = 0.006; mk.add(m); return m; };
    this.mLast = [mkSquare(0.32), mkSquare(0.32)];
    this.mSel = mkSquare(0.75, 5);
    this.mHover = mkSquare(0.28, 5);
    this.mHint = [mkSquare(0.7, 6), mkSquare(0.7, 6)];
    // check: halo rojo radial
    const disc = softDiscTexture();
    const cg = new THREE.PlaneGeometry(1.7, 1.7); cg.rotateX(-Math.PI / 2);
    this.mCheck = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ map: disc, color: 0xff2a2a, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.mCheck.position.y = 0.008; this.mCheck.visible = false; this.mCheck.renderOrder = 6;
    mk.add(this.mCheck);
    // jugadas legales: puntos y anillos (pool)
    this.dotGeo = new THREE.CircleGeometry(0.13, 32); this.dotGeo.rotateX(-Math.PI / 2);
    this.ringGeo = new THREE.RingGeometry(0.36, 0.45, 48); this.ringGeo.rotateX(-Math.PI / 2);
    this.moveMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.moveMarks = [];
    // onda al aterrizar
    this.rippleGeo = new THREE.RingGeometry(0.4, 0.47, 64); this.rippleGeo.rotateX(-Math.PI / 2);
    this.discTex = disc;
  }

  buildDust() {
    const N = 420;
    const pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const r = 3 + Math.pow(Math.random(), 0.7) * 16, a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.random() * 3 - 0.5; pos[i * 3 + 2] = Math.sin(a) * r;
      const far = r > 11;
      size[i] = far ? 0.25 + Math.random() * 0.55 : 0.04 + Math.random() * 0.12;
      phase[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    this.dustMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: this.renderer.getPixelRatio() }, uColor: { value: new THREE.Color('#f3d48a') }, uOpacity: { value: 0.7 } },
      vertexShader: DustShader.vertexShader, fragmentShader: DustShader.fragmentShader,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.dust = new THREE.Points(g, this.dustMat);
    this.dust.frustumCulled = false;
    this.dustCount = N;
    this.scene.add(this.dust);
    // chispas (pool reutilizable)
    this.sparks = [];
  }

  buildComposer() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.3, 0.5, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  // ---------- Tema y calidad ----------
  setTheme(id) {
    const theme = themeById(id);
    this.theme = theme;
    if (!theme._mats) theme._mats = theme.build();
    const m = theme._mats;
    this.boardTop.material = m.board;
    this.frame.material = m.frame;
    this.pieceMats = { w: m.w, b: m.b };
    for (const mesh of this.allPieceMeshes()) mesh.material = this.pieceMats[mesh.userData.color];
    this.scene.background = theme._bg || (theme._bg = backgroundTexture(theme.bg[0], theme.bg[1]));
    this.floor.material.map = theme._floor || (theme._floor = floorTexture(theme.floor[0], theme.floor[1]));
    this.floor.material.needsUpdate = true;
    this.scene.fog = new THREE.Fog(theme.bg[1], 26, 70);
    this.scene.environmentIntensity = theme.env;
    this.keyLight.color.set(theme.key[0]); this.keyLight.intensity = theme.key[1];
    this.rimLight.color.set(theme.rim[0]); this.rimLight.intensity = theme.rim[1];
    this.reflector.material.uniforms.strength.value = theme.reflection;
    this.bloom.strength = theme.bloom.strength * this.glow; this.bloom.enabled = this.glow > 0.001; this.bloom.radius = theme.bloom.radius; this.bloom.threshold = theme.bloom.threshold;
    this.dustMat.uniforms.uColor.value.set(theme.particles);
    const accent = new THREE.Color(theme.accent);
    this.accent = accent;
    for (const mk of [...this.mLast, this.mSel, this.mHover]) mk.material.color.copy(accent);
    this.mLast.forEach((x) => (x.material.opacity = 0.3));
    this.moveMat.color.copy(accent);
    for (const mk of this.mHint) mk.material.color.set('#5fb8ff');
    this.applyGlowToMaterials();
    if (!theme._coords) theme._coords = coordsTexture({ color: theme.coords });
    this.coords.material.map = theme._coords; this.coords.material.needsUpdate = true;
  }

  /** Brillo general (exposición del tone mapping). */
  setExposure(v) { this.exposure = v; this.renderer.toneMappingExposure = v; }

  /** Intensidad del glow 0..1: bloom, emisivos y marcadores aditivos. */
  setGlow(v) {
    this.glow = Math.max(0, Math.min(1, v));
    if (this.theme) {
      this.bloom.strength = this.theme.bloom.strength * this.glow;
      this.bloom.enabled = this.glow > 0.001;
      this.applyGlowToMaterials();
    }
  }

  applyGlowToMaterials() {
    const m = this.theme._mats;
    for (const [key, mat] of Object.entries(m)) {
      if (!mat || mat.emissiveIntensity === undefined) continue;
      if (mat.userData.baseEmissive === undefined) mat.userData.baseEmissive = mat.emissiveIntensity;
      // las líneas del tablero (neón) nunca bajan del 70 % para que se sigan viendo
      mat.emissiveIntensity = mat.userData.baseEmissive * (key === 'board' ? Math.max(this.glow, 0.7) : this.glow);
    }
    // marcadores aditivos (sin tone mapping): atenuar color, mínimo 35 % para que se vean
    const f = 0.35 + 0.65 * this.glow;
    for (const mk of [...this.mLast, this.mSel, this.mHover]) mk.material.color.copy(this.accent).multiplyScalar(f);
    this.moveMat.color.copy(this.accent).multiplyScalar(f);
    for (const mk of this.mHint) mk.material.color.set('#5fb8ff').multiplyScalar(f);
    if (this.mCheck) this.mCheck.material.color.set(0xff2a2a).multiplyScalar(f);
  }

  /** Regenera el decal de coordenadas (cuando la fuente web ya está cargada). */
  refreshCoords() {
    for (const t of THEMES) if (t._coords) { t._coords.dispose(); t._coords = null; }
    this.setTheme(this.theme.id);
  }

  setQuality(q) {
    this.quality = q;
    const r = this.renderer;
    const pr = q === 'alta' ? Math.min(window.devicePixelRatio, 2) : q === 'media' ? Math.min(window.devicePixelRatio, 1.5) : 1;
    r.setPixelRatio(pr);
    this.dustMat.uniforms.uPixelRatio.value = pr;
    const shadows = q !== 'baja';
    if (r.shadowMap.enabled !== shadows) {
      r.shadowMap.enabled = shadows;
      this.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true)); });
    }
    this.keyLight.shadow.mapSize.set(q === 'alta' ? 2048 : 1024, q === 'alta' ? 2048 : 1024);
    if (this.keyLight.shadow.map) { this.keyLight.shadow.map.dispose(); this.keyLight.shadow.map = null; }
    this.reflector.visible = q !== 'baja';
    this.dust.geometry.setDrawRange(0, q === 'baja' ? 100 : q === 'media' ? 260 : this.dustCount);
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    const scale = this.quality === 'alta' ? 0.6 : 0.4;
    const pr = this.renderer.getPixelRatio();
    const rw = Math.max(256, Math.round(w * pr * scale)), rh = Math.max(256, Math.round(h * pr * scale));
    this.reflector.getRenderTarget().setSize(rw, rh);
    this.reflector.material.uniforms.texel.value.set(1 / rw, 1 / rh);
    // en pantallas verticales, alejar la cámara para que quepa el tablero
    this.aspectBoost = w / h < 1 ? Math.min(1.9, Math.pow(1 / (w / h), 0.85)) : 1;
    if (this.shiftKind) this.viewShift = this.shiftTarget();
    this.applyViewShift();
    this.controls.maxDistance = 26 * this.aspectBoost;
  }

  /**
   * Desplaza el encuadre sin mover la órbita: en escritorio deja sitio al panel
   * lateral (juego) o al título (menú); en vertical sube el tablero en el menú.
   */
  shiftTarget(kind = this.shiftKind) {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (w > 900) return { x: kind === 'game' ? 135 : kind === 'menu' ? -Math.round(w * 0.13) : 0, y: 0 };
    return { x: 0, y: kind === 'menu' && h > w ? Math.round(h * 0.3) : 0 };
  }
  setViewShift(kind, dur = 1.4) {
    this.shiftKind = kind;
    const from = { ...(this.viewShift || { x: 0, y: 0 }) }, to = this.shiftTarget(kind);
    this.cancelTweens('shift');
    this.tween(dur, (k) => {
      this.viewShift = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
      this.applyViewShift();
    }, ease.inOutCubic, 0, 'shift');
  }
  applyViewShift() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const v = this.viewShift || { x: 0, y: 0 };
    if (v.x || v.y) this.camera.setViewOffset(w, h, v.x, v.y, w, h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  // ---------- Cámara ----------
  getSpherical() {
    const s = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
    return { r: s.radius, phi: s.phi, theta: s.theta };
  }
  setSpherical({ r, phi, theta }) {
    const v = new THREE.Vector3().setFromSpherical(new THREE.Spherical(r, phi, theta));
    this.camera.position.copy(this.controls.target).add(v);
    this.camera.lookAt(this.controls.target);
  }
  flyTo(to, dur = 1.8, easing = ease.inOutCubic) {
    const from = this.getSpherical();
    let dTheta = to.theta - from.theta;
    while (dTheta > Math.PI) dTheta -= Math.PI * 2;
    while (dTheta < -Math.PI) dTheta += Math.PI * 2;
    if (to.spin) dTheta += to.spin;
    this.cancelTweens('camera');
    this.controls.enabled = false;
    this.controls.autoRotate = false;
    return this.tween(dur, (k) => {
      this.setSpherical({ r: from.r + (to.r - from.r) * k, phi: from.phi + (to.phi - from.phi) * k, theta: from.theta + dTheta * k });
    }, easing, 0, 'camera').then((done) => { if (done) this.controls.enabled = true; return done; });
  }
  /** Vista de juego desde el lado de un color. */
  viewFor(color, dur = 1.8) {
    const boost = this.aspectBoost || 1;
    return this.flyTo({ r: 15.5 * boost, phi: 0.78, theta: color === 'b' ? Math.PI : 0 }, dur);
  }
  intro() {
    this.setSpherical({ r: 38, phi: 1.38, theta: -2.8 });
    return this.flyTo({ r: 17 * (this.aspectBoost || 1), phi: 1.0, theta: -0.55 }, 4.2, ease.inOutSine).then((done) => { if (done) this.menuOrbit(); });
  }
  menuOrbit() {
    this.controls.autoRotate = true;
  }

  // ---------- Tweens ----------
  tween(dur, update, easing = ease.inOutCubic, delay = 0, tag = null) {
    return new Promise((resolve) => {
      this.tweens.push({ t: -delay, dur: Math.max(0.0001, dur), update, easing, resolve, tag });
    });
  }
  updateTweens(dt) {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      if (!tw) continue;
      tw.t += dt;
      if (tw.t < 0) continue;
      const k = Math.min(1, tw.t / tw.dur);
      tw.update(tw.easing(k), k);
      if (k >= 1) { const j = this.tweens.indexOf(tw); if (j >= 0) this.tweens.splice(j, 1); tw.resolve(true); }
    }
  }
  /** Completa al instante las animaciones (salvo las de cámara). */
  finishAllTweens() {
    const keep = [];
    const done = [];
    for (const tw of this.tweens) (tw.tag === 'camera' || tw.tag === 'shift' ? keep : done).push(tw);
    this.tweens = keep;
    for (const tw of done) { tw.update(1, 1); tw.resolve(true); }
  }
  /** Cancela (sin completar) las animaciones con una etiqueta. */
  cancelTweens(tag) {
    const out = this.tweens.filter((t) => t.tag === tag);
    this.tweens = this.tweens.filter((t) => t.tag !== tag);
    for (const tw of out) tw.resolve(false);
  }

  // ---------- Piezas ----------
  allPieceMeshes() { return [...this.pieceAt.values(), ...this.trays.w, ...this.trays.b]; }

  makePiece(type, color) {
    const mesh = new THREE.Mesh(this.geos[type], this.pieceMats[color]);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData = { type, color };
    return mesh;
  }

  orientPiece(mesh, sq) {
    const { type, color } = mesh.userData;
    let rot = color === 'w' ? 0 : Math.PI;
    if (type === 'n') {
      const f = FILES.indexOf(sq[0]);
      rot = (color === 'w' ? Math.PI / 2 : -Math.PI / 2) + (f < 4 ? -0.85 : 0.85);
    }
    mesh.rotation.set(0, rot, 0);
  }

  /** Reconstruye todas las piezas a partir de chess.board() y las capturas. */
  setPosition(board, captured = { w: [], b: [] }) {
    this.finishAllTweens();
    for (const m of this.allPieceMeshes()) this.piecesGroup.remove(m);
    this.pieceAt.clear(); this.trays = { w: [], b: [] };
    for (const row of board) for (const cell of row) {
      if (!cell) continue;
      const mesh = this.makePiece(cell.type, cell.color);
      const { x, z } = squareToXZ(cell.square);
      mesh.position.set(x, 0, z);
      this.orientPiece(mesh, cell.square);
      mesh.userData.square = cell.square;
      this.pieceAt.set(cell.square, mesh);
      this.piecesGroup.add(mesh);
    }
    for (const side of ['w', 'b']) for (const t of captured[side]) {
      const mesh = this.makePiece(t, side === 'w' ? 'b' : 'w');
      this.placeInTray(mesh, side, false);
    }
    this.selected = null;
  }

  trayPos(side, i) {
    const col = Math.floor(i / 8), row = i % 8;
    const x = (side === 'w' ? 1 : -1) * (5.45 + col * 0.62);
    const z = (side === 'w' ? 1 : -1) * (3.3 - row * 0.88);
    return new THREE.Vector3(x, TABLE_Y, z);
  }

  /** side = quién capturó. */
  placeInTray(mesh, side, animate = true) {
    const i = this.trays[side].length;
    this.trays[side].push(mesh);
    const p = this.trayPos(side, i);
    if (!mesh.parent) this.piecesGroup.add(mesh);
    if (!animate) { mesh.position.copy(p); mesh.scale.setScalar(0.72); return Promise.resolve(); }
    const start = mesh.position.clone(), s0 = mesh.scale.x, r0 = mesh.rotation.y;
    return this.tween(0.75 / this.animSpeed, (k) => {
      mesh.position.lerpVectors(start, p, k);
      mesh.position.y = start.y + (p.y - start.y) * k + Math.sin(Math.PI * k) * 1.6;
      mesh.scale.setScalar(s0 + (0.72 - s0) * k);
      mesh.rotation.y = r0 + k * Math.PI * 2;
    }, ease.inOutCubic);
  }

  /** Caída escalonada de las piezas al empezar la partida. */
  dropIn(onTick) {
    const meshes = [...this.pieceAt.values()];
    meshes.sort((a, b) => {
      const ra = parseInt(a.userData.square[1], 10), rb = parseInt(b.userData.square[1], 10);
      const ka = Math.min(ra - 1, 8 - ra) * 8 + FILES.indexOf(a.userData.square[0]);
      const kb = Math.min(rb - 1, 8 - rb) * 8 + FILES.indexOf(b.userData.square[0]);
      return ka - kb;
    });
    const proms = meshes.map((m, i) => {
      m.position.y = 7 + Math.random() * 2;
      m.visible = false;
      const delay = 0.15 + i * 0.03;
      let landed = false;
      return this.tween(0.7, (k) => {
        m.visible = true;
        m.position.y = (1 - k) * 7.5;
        if (k > 0.35 && !landed) { landed = true; if (onTick && i % 4 === 0) onTick(i); }
      }, ease.outBounce, delay);
    });
    return Promise.all(proms);
  }

  /** Anima una jugada (objeto verbose de chess.js). */
  async animateMove(mv) {
    this.finishAllTweens();
    const mesh = this.pieceAt.get(mv.from);
    if (!mesh) return;
    const speed = this.animSpeed;
    const from = mesh.position.clone();
    const { x, z } = squareToXZ(mv.to);
    const to = new THREE.Vector3(x, 0, z);
    const dist = from.distanceTo(to);
    const isKnight = mv.piece === 'n';
    const lift = isKnight ? 1.05 : 0.22 + dist * 0.05;
    const dur = (0.42 + Math.min(dist, 7) * 0.045) / speed;
    // pieza capturada
    let capSq = null;
    if (mv.captured) capSq = mv.flags.includes('e') ? mv.to[0] + mv.from[1] : mv.to;
    const capMesh = capSq ? this.pieceAt.get(capSq) : null;
    this.pieceAt.delete(mv.from);
    if (capSq) this.pieceAt.delete(capSq);
    this.pieceAt.set(mv.to, mesh);
    mesh.userData.square = mv.to;
    this.selected = null;
    const jobs = [];
    let capDone = false;
    jobs.push(this.tween(dur, (k, raw) => {
      mesh.position.lerpVectors(from, to, k);
      mesh.position.y = from.y * (1 - k) + Math.sin(Math.PI * k) * lift;
      // leve inclinación en vuelo
      mesh.rotation.z = Math.sin(Math.PI * k) * 0.08 * (to.x > from.x ? -1 : 1);
      if (capMesh && !capDone && raw > 0.72) {
        capDone = true;
        this.burst(capMesh.position.clone().setY(0.4), capMesh.userData.color === 'w' ? '#ffffff' : this.theme.accent);
        jobs.push(this.placeInTray(capMesh, mv.color));
      }
    }, ease.inOutCubic));
    // enroque: mover la torre también
    if (mv.flags.includes('k') || mv.flags.includes('q')) {
      const rank = mv.from[1];
      const rf = (mv.flags.includes('k') ? 'h' : 'a') + rank, rt = (mv.flags.includes('k') ? 'f' : 'd') + rank;
      const rook = this.pieceAt.get(rf);
      if (rook) {
        this.pieceAt.delete(rf); this.pieceAt.set(rt, rook); rook.userData.square = rt;
        const rFrom = rook.position.clone(), p = squareToXZ(rt), rTo = new THREE.Vector3(p.x, 0, p.z);
        jobs.push(this.tween(dur * 0.9, (k) => {
          rook.position.lerpVectors(rFrom, rTo, k);
          rook.position.y = Math.sin(Math.PI * k) * 0.7;
        }, ease.inOutCubic, dur * 0.35));
      }
    }
    await jobs[0];
    mesh.rotation.z = 0;
    this.ripple(to);
    // aterrizaje con ligero "squash"
    const sq = this.tween(0.22 / speed, (k) => {
      const s = 1 - Math.sin(Math.PI * k) * 0.06;
      mesh.scale.set(1 + (1 - s) * 0.5, s, 1 + (1 - s) * 0.5);
    }, ease.outCubic);
    if (mv.promotion) {
      mesh.geometry = this.geos[mv.promotion];
      mesh.userData.type = mv.promotion;
      this.burst(to.clone().setY(0.6), this.theme.accent, 70);
      await this.tween(0.45, (k) => mesh.scale.setScalar(1 + Math.sin(Math.PI * k) * 0.25), ease.outCubic);
    }
    await Promise.all([sq, ...jobs.slice(1)]);
    mesh.scale.setScalar(1);
  }

  /** Levanta/baja la pieza seleccionada. */
  liftPiece(sq, up) {
    const mesh = this.pieceAt.get(sq);
    if (!mesh) return;
    const y0 = mesh.position.y, y1 = up ? 0.18 : 0;
    this.tween(0.18, (k) => { mesh.position.y = y0 + (y1 - y0) * k; }, ease.outCubic);
  }

  // ---------- Efectos ----------
  ripple(pos, color) {
    const m = new THREE.Mesh(this.rippleGeo, new THREE.MeshBasicMaterial({ color: color || this.accent, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    m.position.set(pos.x, 0.01, pos.z); m.renderOrder = 7;
    this.scene.add(m);
    this.tween(0.7, (k) => { m.scale.setScalar(0.6 + k * 1.1); m.material.opacity = 0.9 * (1 - k); }, ease.outCubic)
      .then(() => { this.scene.remove(m); m.material.dispose(); });
  }

  burst(pos, color = '#ffd27a', n = 46) {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3), v = [];
    for (let i = 0; i < n; i++) {
      p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.5;
      v.push(new THREE.Vector3(Math.cos(a) * s, 1.5 + Math.random() * 3, Math.sin(a) * s));
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.09, map: this.discTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const pts = new THREE.Points(g, mat);
    this.scene.add(pts);
    let last = 0;
    this.tween(0.9, (k, raw) => {
      const dt = (raw - last) * 0.9; last = raw;
      for (let i = 0; i < n; i++) {
        v[i].y -= 6 * dt;
        p[i * 3] += v[i].x * dt; p[i * 3 + 1] = Math.max(0.02, p[i * 3 + 1] + v[i].y * dt); p[i * 3 + 2] += v[i].z * dt;
      }
      g.attributes.position.needsUpdate = true;
      mat.opacity = 1 - raw;
    }, ease.linear).then(() => { this.scene.remove(pts); g.dispose(); mat.dispose(); });
  }

  /** Lluvia de confeti dorado para celebrar una victoria. */
  celebrate(color) {
    const n = 600;
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3), c = new Float32Array(n * 3), v = [];
    const base = new THREE.Color(color || this.theme.accent), white = new THREE.Color('#ffffff');
    for (let i = 0; i < n; i++) {
      p[i * 3] = (Math.random() - 0.5) * 14; p[i * 3 + 1] = 8 + Math.random() * 8; p[i * 3 + 2] = (Math.random() - 0.5) * 14;
      v.push(new THREE.Vector3((Math.random() - 0.5) * 0.6, -1.5 - Math.random() * 2, (Math.random() - 0.5) * 0.6));
      const col = base.clone().lerp(white, Math.random() * 0.6);
      c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const mat = new THREE.PointsMaterial({ size: 0.12, map: this.discTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    let last = 0;
    const T = 6;
    this.tween(T, (k, raw) => {
      const dt = (raw - last) * T; last = raw;
      const time = raw * T;
      for (let i = 0; i < n; i++) {
        p[i * 3] += (v[i].x + Math.sin(time * 2 + i) * 0.4) * dt;
        p[i * 3 + 1] += v[i].y * dt;
        p[i * 3 + 2] += (v[i].z + Math.cos(time * 1.7 + i) * 0.4) * dt;
        if (p[i * 3 + 1] < TABLE_Y) p[i * 3 + 1] = TABLE_Y;
      }
      g.attributes.position.needsUpdate = true;
      mat.opacity = raw < 0.8 ? 1 : (1 - raw) / 0.2;
    }, ease.linear).then(() => { this.scene.remove(pts); g.dispose(); mat.dispose(); });
  }

  // ---------- Marcadores ----------
  placeSq(mesh, sq) {
    if (!sq) { mesh.visible = false; return; }
    const { x, z } = squareToXZ(sq);
    mesh.position.x = x; mesh.position.z = z; mesh.visible = true;
  }
  setLastMove(from, to) { this.placeSq(this.mLast[0], from); this.placeSq(this.mLast[1], to); }
  setHint(from, to) { this.placeSq(this.mHint[0], from); this.placeSq(this.mHint[1], to); }
  setCheck(sq) { this.placeSq(this.mCheck, sq); }
  setSelection(sq, targets = []) {
    if (this.selected && this.selected !== sq) this.liftPiece(this.selected, false);
    if (sq && this.selected !== sq) this.liftPiece(sq, true);
    this.selected = sq;
    this.placeSq(this.mSel, sq);
    for (const m of this.moveMarks) this.markers.remove(m);
    this.moveMarks = targets.map((t) => {
      const m = new THREE.Mesh(t.capture ? this.ringGeo : this.dotGeo, this.moveMat);
      const { x, z } = squareToXZ(t.to);
      m.position.set(x, 0.009, z); m.renderOrder = 6;
      this.markers.add(m);
      return m;
    });
  }
  clearMarkers() {
    this.setSelection(null); this.setLastMove(null, null); this.setHint(null, null); this.setCheck(null); this.mHover.visible = false;
  }

  // ---------- Entrada ----------
  bindPointer() {
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    el.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 7) return;
      const sq = this.pick(e);
      if (sq && this.onSquareClick) this.onSquareClick(sq);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const sq = this.pick(e);
      const ok = sq && this.isSelectable(sq);
      el.style.cursor = ok ? 'pointer' : '';
      this.placeSq(this.mHover, ok ? sq : null);
    });
  }

  pick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([...this.pieceAt.values()], false);
    if (hits.length) return hits[0].object.userData.square;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const p = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(plane, p)) return xzToSquare(p.x, p.z);
    return null;
  }

  // ---------- Bucle ----------
  loop(timestamp) {
    this.timer.update(timestamp);
    const dt = Math.min(this.maxDt, this.timer.getDelta());
    const t = this.timer.getElapsed();
    this.updateTweens(dt);
    this.controls.update();
    this.dustMat.uniforms.uTime.value = t;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    this.moveMat.opacity = 0.45 + 0.3 * pulse;
    this.mCheck.material.opacity = 0.55 + 0.45 * pulse;
    this.mCheck.scale.setScalar(0.92 + 0.12 * pulse);
    for (const h of this.mHint) h.material.opacity = 0.35 + 0.45 * pulse;
    if (this.quality === 'baja') this.renderer.render(this.scene, this.camera);
    else this.composer.render(dt);
  }
}
