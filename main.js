// BluePrint · a planta que se levanta
// three.js desenha a planta; GSAP conduz a construção.
// Regras de movimento: 0,382s / 0,618s / 1s · power3.inOut (construir) e expo.out (entrar)
// · sem quiques, elásticos ou rotações · câmera só se desloca, nunca gira.

import * as THREE from './vendor/three.min.js';

const { gsap, ScrollTrigger } = window;
gsap.registerPlugin(ScrollTrigger);

const T = { short: 0.382, mid: 0.618, long: 1 };
const BUILD = 'power3.inOut';
const ENTER = 'expo.out';

const COLOR = {
  blue: 0x0085ca, paper: 0xffffff, paper2: 0xf2f6f9, grid: 0xc9dbe8,
  deep: 0x0b2440, action: 0x006ba3,
};

const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
const REDUCE = reduceMQ.matches;
reduceMQ.addEventListener?.('change', () => location.reload());

/* ---------------------------------------------------------------- texto */

function split(el) {
  const text = el.textContent.trim();
  el.setAttribute('aria-label', text);
  el.textContent = '';
  const words = text.split(/\s+/);
  words.forEach((word, i) => {
    const w = document.createElement('span');
    w.className = 'w';
    w.setAttribute('aria-hidden', 'true');
    for (const ch of word) {
      const m = document.createElement('span');
      m.className = 'm';
      const c = document.createElement('span');
      c.className = 'c';
      c.textContent = ch;
      m.appendChild(c);
      w.appendChild(m);
    }
    el.appendChild(w);
    if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
  });
  return el.querySelectorAll('.c');
}

const splits = new Map();
document.querySelectorAll('.split').forEach((el) => splits.set(el, split(el)));

/* ---------------------------------------------------------------- cena */

const canvas = document.getElementById('plan');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  renderer = null;
}

// medidas da marca: 1 = profundidade (10 u), φ = largura (16,18 u)
const D = 10;
const W = 16.18;
const X0 = -W / 2;               // borda esquerda
const CUT_X = X0 + D;            // seção áurea: o quadrado tem lado = profundidade
const CUT_W = 0.04 * D;          // corte = 4% da altura
const H = 3.4;                   // pé-direito
const TH = 0.24;                 // espessura de parede
const SLAB = 0.16;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 400);
const DIR = new THREE.Vector3(-0.42, 1.3, 1).normalize();
const cam = { x: 0, y: 0, z: 0, d: 38 };
const par = { x: 0, y: 0 };
let fit = 1;

const parts = {};
const clones = [];
const dimsState = { a: 0 };
const dimAnchors = {};
let dimLines;
const v3 = new THREE.Vector3();
let paused = false;

if (renderer) build();
else document.documentElement.classList.add('no-webgl');

function edgesFor(mesh, color, opacity) {
  const lines = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity })
  );
  mesh.add(lines);
  return lines;
}

// caixa com pivô na base (cresce do chão) ou numa borda
function box(w, h, d, mat, pivot = 'base') {
  const g = new THREE.BoxGeometry(w, h, d);
  if (pivot === 'base') g.translate(0, h / 2, 0);
  if (pivot === 'front') g.translate(0, h / 2, -d / 2); // se recolhe para a frente (z+)
  return new THREE.Mesh(g, mat);
}

function wall(x0, z0, x1, z1, h, mat) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const alongX = Math.abs(z1 - z0) < 1e-6;
  const m = box(alongX ? len : TH, h, alongX ? TH : len, mat);
  m.position.set((x0 + x1) / 2, SLAB, (z0 + z1) / 2);
  return m;
}

function buildUnit({ animated }) {
  const unit = new THREE.Group();

  const matSq = new THREE.MeshBasicMaterial({ color: COLOR.blue });
  const matMi = new THREE.MeshBasicMaterial({ color: COLOR.blue });
  const matCutFloor = new THREE.MeshBasicMaterial({ color: COLOR.blue });
  const wallMat = new THREE.MeshLambertMaterial({ color: COLOR.paper });

  // piso: quadrado + corte + 0,618, num grupo com pivô na borda esquerda
  const floor = new THREE.Group();
  floor.position.x = X0;
  const sqW = D - CUT_W / 2;
  const miW = W - D - CUT_W / 2;
  const sq = box(sqW, SLAB, D, matSq);
  sq.position.set(sqW / 2, 0, 0);
  const mi = box(miW, SLAB, D, matMi);
  mi.position.set(D + CUT_W / 2 + miW / 2, 0, 0);
  const strip = box(CUT_W + 0.02, SLAB, D, matCutFloor, 'front');
  strip.position.set(D, 0, D / 2);
  floor.add(sq, mi, strip);
  [sq, mi].forEach((m) => edgesFor(m, COLOR.deep, 0.35));
  unit.add(floor);

  const zN = -D / 2 + TH / 2;
  const zS = D / 2 - TH / 2;
  const walls = {
    west: wall(X0 + TH / 2, -D / 2, X0 + TH / 2, D / 2, H, wallMat),
    north: wall(X0, zN, -X0, zN, H, wallMat),
    south: wall(X0, zS, -X0, zS, H, wallMat),
    east: wall(-X0 - TH / 2, -D / 2, -X0 - TH / 2, D / 2, H, wallMat),
  };
  // o corte vira parede com porta
  const cutA = box(CUT_W, H, D / 2 - 1.1, wallMat);
  cutA.position.set(CUT_X, SLAB, -D / 2 + (D / 2 - 1.1) / 2);
  const cutB = box(CUT_W, H, D / 2 - 1.1, wallMat);
  cutB.position.set(CUT_X, SLAB, D / 2 - (D / 2 - 1.1) / 2);

  // divisórias Fibonacci no apoio (altura 0,618 do pé-direito)
  const hp = H * 0.618;
  const xa = CUT_X + CUT_W / 2;
  const z1 = -D / 2 + (W - D);          // quadrado 6,18
  const x2 = -X0 - (D - (W - D));       // quadrado 3,82
  const z2 = D / 2 - (x2 - xa);         // quadrado 2,36
  const parts1 = [
    wall(xa, z1, xa + 2.2, z1, hp, wallMat),
    wall(xa + 3.6, z1, -X0, z1, hp, wallMat),
    wall(x2, z1, x2, D / 2, hp, wallMat),
    wall(xa, z2, x2, z2, hp, wallMat),
  ];

  const allWalls = [walls.west, walls.north, walls.south, walls.east, cutA, cutB, ...parts1];
  allWalls.forEach((m) => { edgesFor(m, COLOR.deep, 0.7); unit.add(m); });

  if (animated) {
    allWalls.forEach((m) => { m.scale.y = 0.001; });
  } else {
    // unidade da rede: já construída, piso no padrão Branding
    matMi.color.set(COLOR.paper2);
    strip.scale.z = 0.001;
  }

  return { unit, floor, strip, matSq, matMi, matCutFloor, walls, cutA, cutB, parts: parts1, allWalls };
}

function buildDims() {
  const pts = [];
  const seg = (a, b) => pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const y = 0.05;
  const V = (x, z) => new THREE.Vector3(x, y, z);
  const tickZ = (x, z) => seg(V(x, z - 0.35), V(x, z + 0.35));
  const tickX = (x, z) => seg(V(x - 0.35, z), V(x + 0.35, z));

  const zW = D / 2 + 2.2;   // largura total
  const zP = D / 2 + 1.1;   // partes
  const xD = X0 - 1.4;      // profundidade
  seg(V(X0, zW), V(-X0, zW)); tickZ(X0, zW); tickZ(-X0, zW);
  seg(V(X0, zP), V(-X0, zP)); tickZ(X0, zP); tickZ(CUT_X, zP); tickZ(-X0, zP);
  seg(V(xD, -D / 2), V(xD, D / 2)); tickX(xD, -D / 2); tickX(xD, D / 2);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  dimLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: COLOR.action, transparent: true, opacity: 0 }));
  scene.add(dimLines);

  dimAnchors.w = { v: V(0, zW), el: document.querySelector('[data-dim="w"]') };
  dimAnchors.sq = { v: V((X0 + CUT_X) / 2, zP), el: document.querySelector('[data-dim="sq"]') };
  dimAnchors.mi = { v: V((CUT_X - X0) / 2, zP), el: document.querySelector('[data-dim="mi"]') };
  dimAnchors.d = { v: V(xD, 0), el: document.querySelector('[data-dim="d"]') };
}

function build() {
  renderer.setClearColor(COLOR.paper, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene.background = new THREE.Color(COLOR.paper);
  scene.fog = new THREE.Fog(COLOR.paper, 70, 190);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe9f1, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(-6, 14, 9);
  scene.add(sun);

  // grade técnica: módulo de 2,1 u (21px na página)
  // feita de segmentos curtos para não sumir em nenhuma GPU
  const STEP = 2.1, N = 60, SEG = 2;
  const gp = [];
  for (let i = -N; i <= N; i++) {
    const a = i * STEP;
    for (let j = -N; j < N; j += SEG) {
      const b0 = j * STEP, b1 = (j + SEG) * STEP;
      gp.push(a, 0, b0, a, 0, b1);   // linhas em z
      gp.push(b0, 0, a, b1, 0, a);   // linhas em x
    }
  }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
  const grid = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: COLOR.grid }));
  grid.position.y = -0.02;
  scene.add(grid);

  Object.assign(parts, buildUnit({ animated: true }));
  scene.add(parts.unit);
  buildDims();

  // a rede de franquias: 5 × 5 unidades (o centro é a original)
  const SX = 24, SZ = 16;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (r === 2 && c === 2) { clones.push({ x: 1, y: 1, z: 1 }); continue; }
      const u = buildUnit({ animated: false }).unit;
      u.position.set((c - 2) * SX, 0, (r - 2) * SZ);
      u.scale.setScalar(0.001);
      u.visible = false;
      scene.add(u);
      clones.push(u.scale);
      u.scale.__unit = u;
    }
  }

  camera.position.copy(DIR).multiplyScalar(cam.d);
  camera.lookAt(0, 0, 0); // orientação definida uma vez; depois, só translação

  resize();
  addEventListener('resize', resize);
  gsap.ticker.add(render);
}

function placeCamera() {
  const d = cam.d * fit;
  camera.position.set(cam.x + DIR.x * d + par.x, cam.y + DIR.y * d + par.y, cam.z + DIR.z * d);
}

function resize() {
  if (!renderer) return;
  const w = innerWidth, h = innerHeight;
  const mobile = w < 768;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.75 : 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // composição 61,8 / 38,2: a planta ocupa a coluna larga
  const ox = mobile ? 0 : -0.191 * w;
  const oy = mobile ? 0.191 * h : 0;
  camera.setViewOffset(w, h, ox, oy, w, h);
  camera.updateProjectionMatrix();
  fit = mobile ? Math.max(1.6, 1.05 / (w / h)) : Math.max(1, 1.25 / (w / h));
  scene.fog.near = 70 * fit;
  scene.fog.far = 190 * fit;
  render();
}

function render() {
  if (!renderer || paused) return;
  placeCamera();
  clones.forEach((s) => { if (s.__unit) s.__unit.visible = s.x > 0.002; });
  parts.allWalls.forEach((m) => { m.visible = m.scale.y > 0.002; });
  renderer.render(scene, camera);

  // cotas: rótulos HTML presos aos pontos 3D
  const w = innerWidth, h = innerHeight;
  for (const k in dimAnchors) {
    const { v, el } = dimAnchors[k];
    v3.copy(v).project(camera);
    const x = (v3.x * 0.5 + 0.5) * w;
    const y = (-v3.y * 0.5 + 0.5) * h;
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    el.style.opacity = dimsState.a;
  }
}

/* ---------------------------------------------------------------- estados */

const rgb = (hex) => { const c = new THREE.Color(hex); return { r: c.r, g: c.g, b: c.b }; };

function setFinalStatic() {
  // "reduzir movimento": o quadro final é a peça
  if (renderer) {
    parts.floor.scale.x = 1;
    parts.strip.scale.z = 0.001;
    parts.matMi.color.set(COLOR.paper2);
    [parts.walls.west, parts.walls.north, parts.walls.south, parts.walls.east, parts.cutA, parts.cutB, ...parts.parts]
      .forEach((m) => { m.scale.y = 1; });
    dimLines.material.opacity = 1;
    dimsState.a = 1;
    Object.assign(cam, { x: -0.8, y: 0, z: 1.6, d: 40 });
    gsap.ticker.remove(render);
    const once = () => { paused = false; render(); };
    addEventListener('resize', once);
    once();
  }
  document.getElementById('unit').textContent = '100';
  document.getElementById('progress').style.transform = 'scaleX(1)';
}

/* ---------------------------------------------------------------- movimento */

const mm = gsap.matchMedia();

mm.add('(prefers-reduced-motion: no-preference)', () => {
  // 1 · abertura: a marca entra (gesto-assinatura) e o título sobe letra a letra
  const intro = gsap.timeline({ defaults: { ease: ENTER } });

  intro
    .from('.mark', { scaleX: 0, transformOrigin: '0% 50%', duration: T.long }, 0)
    .fromTo('.mark .mk-cut', { scaleY: 1 }, { scaleY: 0, transformOrigin: '50% 100%', duration: T.mid, ease: BUILD }, T.mid);
  gsap.set('.hero-inner, .scroll-hint, .topbar .brand', { visibility: 'visible' });

  if (renderer) {
    parts.floor.scale.x = 0.001;
    intro
      .to(parts.floor.scale, { x: 1, duration: T.long, ease: ENTER }, 0.13)
      .to(parts.strip.scale, { z: 0.001, duration: T.mid, ease: BUILD }, 0.13 + T.mid);
  }

  const heroChars = splits.get(document.querySelector('.hero .split'));
  intro
    .from(heroChars, { yPercent: 110, duration: T.mid, stagger: { amount: T.mid } }, T.short)
    .from('.hero .reveal', { autoAlpha: 0, y: 21, duration: T.mid, stagger: 0.13 }, T.long);

  // 2 · a construção conduzida pelo scroll (um segmento por etapa)
  if (renderer) {
    const tl = gsap.timeline({
      defaults: { ease: BUILD, immediateRender: false },
      scrollTrigger: { trigger: '#story', start: 'top bottom', end: 'bottom bottom', scrub: 1 },
    });
    const up = (m, at, dur = T.mid) => tl.fromTo(m.scale, { y: 0.001 }, { y: 1, duration: dur }, at);
    const color = (mat, from, to, at) => tl.fromTo(mat.color, rgb(from), { ...rgb(to), duration: T.mid }, at);
    const camTo = (from, to, at) => tl.fromTo(cam, from, { ...to, duration: T.long }, at);

    const C0 = { x: 0, y: 0, z: 0, d: 38 };
    const C1 = { x: 0, y: 0, z: 0, d: 37 };
    const C2 = { x: -1.2, y: 0, z: 0.4, d: 34 };
    const C3 = { x: 3.4, y: 0, z: 1.2, d: 28 };
    const C4 = { x: -0.8, y: 0, z: 1.6, d: 40 };
    const C5 = { x: 0, y: 0, z: 0, d: 100 };

    // 02 · Design Thinking: o contorno se levanta, com o lado direito aberto
    tl.addLabel('dt', 0);
    color(parts.matSq, COLOR.blue, COLOR.paper2, 0);
    color(parts.matMi, COLOR.blue, COLOR.paper2, 0);
    camTo(C0, C1, 0);
    up(parts.walls.west, 0.2);
    up(parts.walls.north, 0.33);
    up(parts.walls.south, 0.46);

    // 03 · Branding: o interior revelado
    tl.addLabel('br', 1);
    color(parts.matSq, COLOR.paper2, COLOR.blue, 1.13);
    camTo(C1, C2, 1);

    // 04 · Arquitetura: o corte vira parede com porta; Fibonacci divide o apoio
    tl.addLabel('arq', 2);
    camTo(C2, C3, 2);
    up(parts.cutA, 2.13);
    up(parts.cutB, 2.13);
    up(parts.walls.east, 2.26);
    parts.parts.forEach((m, i) => up(m, 2.38 + i * 0.13));

    // 05 · Medida: as cotas aparecem
    tl.addLabel('medida', 3);
    camTo(C3, C4, 3);
    tl.fromTo(dimLines.material, { opacity: 0 }, { opacity: 1, duration: T.mid }, 3.26);
    tl.fromTo(dimsState, { a: 0 }, { a: 1, duration: T.mid }, 3.26);

    // 06 · Escala: a planta vira rede, da 1ª à 100ª unidade
    tl.addLabel('escala', 4);
    tl.fromTo(dimLines.material, { opacity: 1 }, { opacity: 0, duration: T.short }, 4);
    tl.fromTo(dimsState, { a: 1 }, { a: 0, duration: T.short }, 4);
    camTo(C4, C5, 4);
    tl.fromTo(clones, { x: 0.001, y: 0.001, z: 0.001 }, {
      x: 1, y: 1, z: 1, duration: T.short, ease: ENTER,
      stagger: { grid: [5, 5], from: 'center', amount: T.mid },
    }, 4.13);
    const unitEl = document.getElementById('unit');
    const counter = { n: 1 };
    tl.fromTo(counter, { n: 1 }, {
      n: 100, duration: T.long, ease: BUILD,
      onUpdate: () => { unitEl.textContent = String(Math.round(counter.n)).padStart(3, '0'); },
    }, 4);
    tl.set({}, {}, 5); // o segmento 06 ocupa toda a seção

    // parallax do cursor: a câmera se desloca alguns centímetros, sem girar
    if (matchMedia('(pointer: fine)').matches) {
      const qx = gsap.quickTo(par, 'x', { duration: T.long, ease: ENTER });
      const qy = gsap.quickTo(par, 'y', { duration: T.long, ease: ENTER });
      addEventListener('pointermove', (e) => {
        qx((e.clientX / innerWidth - 0.5) * 1.6);
        qy((e.clientY / innerHeight - 0.5) * -1.0);
      });
    }

    // quando o azul cobre a tela, a planta descansa
    ScrollTrigger.create({
      trigger: '.finale', start: 'top top', end: 'max',
      onToggle: (self) => { paused = self.isActive; if (!paused) render(); },
    });
  }

  // 3 · títulos das etapas: letra a letra quando o cartão entra
  document.querySelectorAll('.stage, .finale').forEach((sec) => {
    const h = sec.querySelector('.split');
    const chars = splits.get(h);
    const rest = sec.querySelectorAll('.card > :not(.split), .finale > .label, .contacts li');
    const t = gsap.timeline({
      defaults: { ease: ENTER },
      scrollTrigger: { trigger: sec, start: 'top 62%', toggleActions: 'play none none reverse' },
    });
    if (sec.classList.contains('finale')) {
      t.from('.mark-xl', { scaleX: 0, transformOrigin: '0% 50%', duration: T.long }, 0)
        .fromTo('.mark-xl .mx-cut', { scaleY: 1 }, { scaleY: 0, transformOrigin: '50% 100%', duration: T.mid, ease: BUILD }, T.mid);
    }
    t.from(chars, { yPercent: 110, duration: T.mid, stagger: { amount: T.short } }, 0.13)
      .from(rest, { autoAlpha: 0, y: 13, duration: T.mid, stagger: 0.08 }, T.short);
  });

  // véu do hero: a grade nunca passa sob o texto; some quando a construção começa
  gsap.fromTo('#veil', { autoAlpha: 1 }, {
    autoAlpha: 0, ease: 'none', immediateRender: false,
    scrollTrigger: { trigger: '#story', start: 'top bottom', end: 'top 38%', scrub: true },
  });

  // barra "em andamento" e folha atual
  gsap.to('#progress', {
    scaleX: 1, ease: 'none',
    scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: true },
  });

  return () => { paused = false; };
});

mm.add('(prefers-reduced-motion: reduce)', () => { setFinalStatic(); });

// folha atual (FOLHA 0X/07) — vale para os dois modos
const sheetEl = document.getElementById('sheet');
document.querySelectorAll('[data-sheet]').forEach((sec) => {
  ScrollTrigger.create({
    trigger: sec, start: 'top center', end: 'bottom center',
    onToggle: (self) => { if (self.isActive) sheetEl.textContent = `FOLHA ${sec.dataset.sheet}/07`; },
  });
});

document.fonts?.ready.then(() => ScrollTrigger.refresh());
