import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inv = (v, a, b) => clamp((v - a) / (b - a), 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const mixc = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), clamp(t, 0, 1));

/* deterministic noise so every reload paints the same ear */
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return hash(xi, yi) * (1 - u) * (1 - v) + hash(xi + 1, yi) * u * (1 - v)
    + hash(xi, yi + 1) * (1 - u) * v + hash(xi + 1, yi + 1) * u * v;
}
function fbm(x, y, oct) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < (oct || 4); i++) { s += amp * vnoise(x * f, y * f); f *= 2.07; amp *= 0.5; }
  return s;
}
function rng(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }

function paint(size, fn) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = (y * size + x) * 4, v = fn(x / size, y / size);
    d[o] = v[0]; d[o + 1] = v[1]; d[o + 2] = v[2]; d[o + 3] = v.length > 3 ? v[3] : 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
function tex(canvas, repX, repY) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX || 1, repY || 1);
  t.anisotropy = 8;
  return t;
}
const gr = (v) => { const n = clamp(Math.round(v * 255), 0, 255); return [n, n, n]; };

/* husk: long fibrous veins running with the leaf, plus dry mottle */
const huskBump = () => paint(512, (u, v) => {
  const veins = Math.sin(u * 210 + fbm(u * 3, v * 2, 2) * 5) * 0.5 + 0.5;
  const fine = Math.sin(u * 640) * 0.5 + 0.5;
  const mott = fbm(u * 5, v * 16, 4);
  return gr(clamp(0.45 + veins * 0.34 + fine * 0.08 + mott * 0.18, 0, 1));
});
const huskRough = () => paint(256, (u, v) => {
  const n = fbm(u * 7, v * 20, 4);
  return gr(clamp(0.52 + n * 0.4, 0, 1));
});
/* kernel skin: soft cellular wrinkle used as bump, scaled up as the ear dries */
const kernelBump = () => paint(256, (u, v) => {
  const cell = fbm(u * 9, v * 9, 4);
  const wrink = Math.sin(u * 44 + cell * 9) * Math.sin(v * 40 + cell * 7) * 0.5 + 0.5;
  return gr(clamp(0.4 + cell * 0.35 + wrink * 0.3, 0, 1));
});
/* mould blotch mask for the spoilage end of the timeline */
const mouldTexCanvas = () => paint(256, (u, v) => {
  const n = fbm(u * 8, v * 8, 5);
  const m = clamp((n - 0.5) * 3.6, 0, 1);
  const speck = Math.pow(fbm(u * 44, v * 44, 2), 6) * 3;
  return [52, 48, 36, Math.round(clamp(m + speck, 0, 1) * 255)];
});

function shadowCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g1 = ctx.createRadialGradient(128, 128, 6, 128, 128, 126);
  g1.addColorStop(0, 'rgba(18,32,24,.62)');
  g1.addColorStop(0.35, 'rgba(20,34,26,.34)');
  g1.addColorStop(0.7, 'rgba(22,36,28,.1)');
  g1.addColorStop(1, 'rgba(22,36,28,0)');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, 256, 256);
  return c;
}

/* soft studio environment: bright top, warm floor bounce — reads well on white */
function envTexture(renderer) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const ctx = c.getContext('2d');
  const g1 = ctx.createLinearGradient(0, 0, 0, 32);
  g1.addColorStop(0, '#ffffff');
  g1.addColorStop(0.45, '#eef1e6');
  g1.addColorStop(0.75, '#cfd8c6');
  g1.addColorStop(1, '#9fae94');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, 64, 32);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(t).texture;
  pmrem.dispose();
  t.dispose();
  return env;
}

/* ---------- varieties ---------- */

const VARIETIES = {
  lagkitan: {
    label: 'White Lagkitan — planting to over-dry',
    milk: ['#f4efdf', '#e9e2cc'], dent: ['#ece5d0', '#d8cfb4'], dry: ['#cfc4a4', '#b9ab88'],
    tipDark: 0.06, bicolor: 0, silk: '#e8d9a8', pick: 72
  },
  yellow: {
    label: 'Yellow Sweet Corn — planting to over-dry',
    milk: ['#f7c93f', '#eeb52a'], dent: ['#e9ab1f', '#d9931b'], dry: ['#c98c1c', '#a97316'],
    tipDark: 0.1, bicolor: 0, silk: '#e6cf91', pick: 70
  },
  grits: {
    label: 'White Corn for Grits (Tinigib) — planting to over-dry',
    milk: ['#f2ecdc', '#e6dec6'], dent: ['#e4dbc2', '#cfc4a6'], dry: ['#ddd3b6', '#c3b795'],
    tipDark: 0.14, bicolor: 0, silk: '#ddc9a0', pick: 108
  },
  waxy: {
    label: 'Purple Bicolor Waxy — planting to over-dry',
    milk: ['#f2ecdd', '#e8e0c8'], dent: ['#e9e1cb', '#d6ccb2'], dry: ['#cdc09f', '#b5a684'],
    tipDark: 0.08, bicolor: 1, purple: ['#4a1f52', '#2e1338'], silk: '#d9b6c4', pick: 66
  }
};

/* ---------- kernels ---------- */

function kernelGeometry() {
  const g = new THREE.SphereGeometry(0.5, 16, 14);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = clamp((y + 0.5), 0, 1);                       // 0 base (in cob) .. 1 crown
    const taper = lerp(0.62, 1.04, Math.pow(t, 0.55)) * (1 - Math.pow(t, 5) * 0.32);
    p.setX(i, x * taper * 1.06);
    p.setZ(i, z * taper * 0.82);
    p.setY(i, y * 1.22 + Math.pow(t, 2) * 0.06);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

function buildEar(variety, maps) {
  const grp = new THREE.Group();

  const cobMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#d9c9a4'), roughness: 0.86, metalness: 0,
    bumpMap: maps.husk, bumpScale: 0.012, clearcoat: 0.05
  });
  const cob = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.3, 2.34, 28, 1, false), cobMat);
  grp.add(cob);

  const kMat = new THREE.MeshPhysicalMaterial({
    roughness: 0.34, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.35,
    sheen: 0.35, sheenColor: new THREE.Color('#fff6dd'),
    bumpMap: maps.kernel, bumpScale: 0.004,
    roughnessMap: maps.kernelRough
  });
  kMat.onBeforeCompile = (s) => {
    s.uniforms.uMould = { value: 0 };
    s.uniforms.uMouldMap = { value: maps.mould };
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uMould;\nuniform sampler2D uMouldMap;')
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        '#ifdef USE_UV',
        '  float _m = texture2D(uMouldMap, vMapUv * 2.0).a;',
        '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22,0.2,0.15), smoothstep(0.25,0.85,_m) * uMould);',
        '#endif'
      ].join('\n'));
    kMat.userData.u = s.uniforms;
  };
  kMat.customProgramCacheKey = () => 'kernel';

  const ROWS = 20, PER = 26, N = ROWS * PER;
  const kernels = new THREE.InstancedMesh(kernelGeometry(), kMat, N);
  kernels.castShadow = true;
  kernels.receiveShadow = true;
  kernels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  kernels.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);

  const r = rng(7);
  const slots = [];
  for (let i = 0; i < ROWS; i++) {
    for (let j = 0; j < PER; j++) {
      const t = (j + 0.5) / PER;                              // 0 butt .. 1 tip
      const ang = (i / ROWS) * Math.PI * 2 + (j % 2) * (Math.PI / ROWS) + t * 0.5;
      slots.push({
        t, ang,
        jit: r(),
        purple: r(),
        wob: (r() - 0.5) * 0.06,
        scale: 0.94 + r() * 0.14,
        tipFail: t > 0.94 ? r() : 1                            // ragged, poorly filled tip
      });
    }
  }
  grp.add(kernels);
  return { grp, cob, cobMat, kernels, kMat, slots, variety };
}

/* ---------- husk ---------- */

function huskLeafGeo(len, wid) {
  const g = new THREE.PlaneGeometry(wid, len, 10, 30);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const t = clamp((y + len / 2) / len, 0, 1);               // 0 base .. 1 tip
    // narrow where it clasps the shank, widest at mid, drawn to a point at the tip
    const w = (0.34 + 0.66 * Math.sin(Math.PI * Math.pow(t, 0.78))) * (1 - Math.pow(t, 2.6) * 0.92) + 0.02;
    const xx = x * w;
    p.setX(i, xx);
    p.setY(i, y);
    // deep cup near the base so the leaf wraps the ear, relaxing as it rises
    p.setZ(i, -(xx * xx) * (3.4 - t * 2.2) - Math.pow(t, 2.1) * 0.42);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

function buildHusk(maps) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#3d6a22'), roughness: 0.62, metalness: 0, side: THREE.DoubleSide,
    bumpMap: maps.husk, bumpScale: 0.05, roughnessMap: maps.huskRough,
    sheen: 0.5, sheenColor: new THREE.Color('#cfe0a4'), clearcoat: 0.12, transmission: 0.06, thickness: 0.4
  });
  const grp = new THREE.Group();
  const leaves = [];
  const r = rng(21);
  const N = 9;
  for (let i = 0; i < N; i++) {
    const pivot = new THREE.Group();
    const ang = (i / N) * Math.PI * 2 + 0.35;
    pivot.rotation.y = ang;
    const len = 4.1 + r() * 0.6;
    const mesh = new THREE.Mesh(huskLeafGeo(len, 0.98 + r() * 0.2), mat);
    mesh.position.set(0, len / 2 - 1.5, 0.26);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const holder = new THREE.Group();
    holder.position.set(0, -1.5, 0);
    holder.add(mesh);
    pivot.add(holder);
    grp.add(pivot);
    leaves.push({ holder, mesh, front: Math.cos(ang) > 0.25, phase: r(), ang });
  }
  return { grp, mat, leaves };
}

/* ---------- silks ---------- */

function buildSilk(color) {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color), roughness: 0.55, metalness: 0,
    side: THREE.DoubleSide, transparent: true, opacity: 0.95
  });
  const grp = new THREE.Group();
  const r = rng(99);
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2;
    const rad = 0.1 + r() * 0.26;
    const droop = 0.5 + r() * 0.9;
    const pts = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      pts.push(new THREE.Vector3(
        Math.cos(a) * (rad + t * (0.35 + r() * 0.5)) + Math.sin(t * 6 + i) * 0.05,
        t * 1.25 - Math.pow(t, 2.2) * droop,
        Math.sin(a) * (rad + t * (0.35 + r() * 0.5))
      ));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.0125, 5, false), mat);
    m.castShadow = true;
    grp.add(m);
  }
  grp.scale.setScalar(0.001);
  return { grp, mat };
}

/* ---------- viewer ---------- */

export function createViewer(host, mode) {
  const variety = VARIETIES[mode] || VARIETIES.yellow;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:grab;touch-action:none';
  host.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.environment = envTexture(renderer);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 2.1, 10.6);
  camera.lookAt(0, -0.3, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c3ad, 0.75));
  const key = new THREE.DirectionalLight(0xfff3e0, 2.3);
  key.position.set(3.4, 6.2, 4.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1; key.shadow.camera.far = 22;
  key.shadow.camera.left = -5; key.shadow.camera.right = 5;
  key.shadow.camera.top = 5; key.shadow.camera.bottom = -5;
  key.shadow.bias = -0.0012;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xe8eedf, 0.7);
  fill.position.set(-4.2, 1.6, 3.2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.9);
  rim.position.set(-2.2, 3.4, -4.6);
  scene.add(rim);

  const maps = {
    husk: tex(huskBump(), 1, 2),
    huskRough: tex(huskRough(), 1, 2),
    kernel: tex(kernelBump(), 1, 1),
    kernelRough: tex(kernelBump(), 2, 2),
    mould: tex(mouldTexCanvas(), 1, 1)
  };

  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.MeshBasicMaterial({ map: tex(shadowCanvas()), transparent: true, depthWrite: false, opacity: 0.9 })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.scale.setScalar(0.26);
  shadowPlane.position.y = -2.18;
  scene.add(shadowPlane);

  const root = new THREE.Group();
  scene.add(root);

  const ear = buildEar(variety, maps);
  const husk = buildHusk(maps);
  const silk = buildSilk(variety.silk);

  const pivot = new THREE.Group();
  pivot.rotation.z = 0.06;
  pivot.add(ear.grp);
  pivot.add(husk.grp);
  pivot.add(silk.grp);
  silk.grp.position.y = 1.3;
  root.add(pivot);

  const api = { mode };
  let day = 70;
  let drag = null, spin = -0.3, tilt = 0.05, idle = 0;
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  function apply(d) {
    /* growth: ear only starts bulking once the shoot sets, silking ~40 DAP */
    const grow = Math.pow(inv(d, 26, 62), 0.85);
    const fill01 = inv(d, 46, 76);                 // blister → milk → dough
    const dent = inv(d, 80, 102);
    const dry = inv(d, 100, 118);
    const spoil = inv(d, 118, 130);

    const earLen = lerp(0.3, 1, grow);
    const earRad = lerp(0.24, 1, Math.pow(grow, 1.15)) * lerp(0.92, 1, fill01) * (1 - dry * 0.06);
    ear.grp.scale.set(earRad, earLen, earRad);

    /* kernels: grid position, plumpness, dent, colour grade */
    const cMilk = mixc(variety.milk[0], variety.milk[1], 0.35);
    const cDent = mixc(variety.dent[0], variety.dent[1], 0.4);
    const cDry = mixc(variety.dry[0], variety.dry[1], 0.45);
    const base = mixc(mixc('#cfe0a0', cMilk, inv(d, 44, 62)), cDent, dent).lerp(cDry, dry);
    const kN = ear.slots.length;
    for (let i = 0; i < kN; i++) {
      const s = ear.slots[i];
      const tipOk = s.t < 0.94 ? 1 : (s.tipFail > lerp(0.7, 0.25, fill01) ? 0 : 1);
      const plump = lerp(0.5, 1, Math.pow(fill01, 0.8)) * lerp(0.62, 1, grow);
      const shrink = 1 - dent * 0.09 - dry * 0.12;
      const along = (s.t - 0.5) * 2.3 + 0.08;
      const shoulder = Math.pow(Math.sin(Math.PI * clamp(s.t * 0.9 + 0.07, 0, 1)), 0.28);
      const rad = 0.325 * shoulder + 0.03;
      dummy.position.set(Math.cos(s.ang) * rad, along, Math.sin(s.ang) * rad);
      dummy.rotation.set(0, -s.ang, Math.PI / 2 + s.wob);
      dummy.rotation.order = 'YZX';
      const sc = 0.40 * s.scale * plump * shrink * tipOk * (0.9 + shoulder * 0.14);
      dummy.scale.set(sc * lerp(1.1, 0.96, dent), sc * 1.12, sc * lerp(0.96, 0.78, dent + dry * 0.4));
      dummy.updateMatrix();
      ear.kernels.setMatrixAt(i, dummy.matrix);

      col.copy(base);
      if (variety.bicolor && s.purple > 0.52) {
        const pur = mixc(variety.purple[0], variety.purple[1], s.jit).lerp(new THREE.Color('#2a1030'), dry * 0.5);
        col.lerp(pur, lerp(0.15, 1, inv(d, 46, 68)));
      }
      col.offsetHSL(0, (s.jit - 0.5) * 0.03, (s.jit - 0.5) * 0.045 - s.t * variety.tipDark * 0.6);
      ear.kernels.setColorAt(i, col);
    }
    ear.kernels.instanceMatrix.needsUpdate = true;
    if (ear.kernels.instanceColor) ear.kernels.instanceColor.needsUpdate = true;

    ear.kMat.roughness = lerp(0.3, 0.72, dent * 0.5 + dry);
    ear.kMat.clearcoat = lerp(0.62, 0.05, dry);
    ear.kMat.bumpScale = lerp(0.003, 0.02, dry);
    ear.kMat.sheen = lerp(0.4, 0.05, dry);
    if (ear.kMat.userData.u) ear.kMat.userData.u.uMould.value = spoil * 0.85;
    ear.cobMat.color.copy(mixc('#efe4c6', '#c9ab7c', dry * 0.7 + spoil * 0.3));

    /* husk: deep green → paling → straw → grey, and peels open as it dries */
    const huskCol = mixc(
      mixc('#2c5719', '#3d6b1f', inv(d, 20, 50)),
      '#78883f', inv(d, 80, 102)
    ).lerp(new THREE.Color('#a8894a'), dry).lerp(new THREE.Color('#6d6247'), spoil * 0.75);
    husk.mat.color.copy(huskCol);
    husk.mat.roughness = lerp(0.55, 0.88, dry);
    husk.mat.sheen = lerp(0.55, 0.08, dry);
    husk.mat.transmission = lerp(0.09, 0, dry);
    husk.mat.bumpScale = lerp(0.035, 0.085, dry);

    const open = inv(d, 50, 72);                    // display peel so kernels read
    const dryOpen = dry * 0.5 + spoil * 0.3;
    husk.leaves.forEach((lf, i) => {
      const front = lf.front ? 1 : 0.16;
      lf.holder.rotation.x = -(open * 0.5 * front + dryOpen * 0.42 + lf.phase * 0.06 * open);
      lf.holder.rotation.z = (lf.phase - 0.5) * (0.06 + open * 0.2);
      const s = lerp(0.42, 1, Math.pow(inv(d, 8, 46), 0.8)) * (1 - dry * 0.04);
      lf.holder.scale.setScalar(s);
      lf.mesh.rotation.z = (lf.phase - 0.5) * 0.1 * (1 + dryOpen * 2);
    });

    /* silks: emerge at ~40 DAP, dry brown, shrivel away by dough stage */
    const sEmerge = inv(d, 36, 48);
    const sDie = inv(d, 62, 88);
    silk.grp.scale.setScalar(Math.max(0.001, sEmerge * (1 - sDie * 0.75)));
    silk.mat.color.copy(mixc(variety.silk, '#7d4a24', inv(d, 48, 72)).lerp(new THREE.Color('#3d2415'), inv(d, 78, 105)));
    silk.mat.opacity = lerp(0.95, 0.5, sDie);
    silk.grp.position.y = 1.18 * earLen;

    root.rotation.y = spin;
    root.rotation.x = tilt;
    renderer.render(scene, camera);
  }

  api.setDay = (d) => { day = d; apply(d); };
  apply(day);
  api.ready = Promise.resolve(api);

  const down = (e) => { drag = { x: e.clientX, y: e.clientY, s: spin, t: tilt }; if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId); };
  const move = (e) => {
    if (!drag) return;
    idle = 0;
    spin = drag.s + (e.clientX - drag.x) * 0.008;
    tilt = clamp(drag.t + (e.clientY - drag.y) * 0.006, -0.5, 0.75);
  };
  const up = () => { drag = null; };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointerleave', up);

  let raf = 0, w = 0, h = 0;
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (Math.abs(r.width - w) < 1 && Math.abs(r.height - h) < 1) return;
    w = r.width; h = r.height;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(canvas);

  const tick = () => {
    raf = requestAnimationFrame(tick);
    resize();
    if (!drag) { idle += 1; if (idle > 50) spin += 0.0024; }
    root.rotation.y = spin;
    root.rotation.x = tilt;
    renderer.render(scene, camera);
  };
  tick();

  api.reset = () => { spin = -0.3; tilt = 0.05; };
  api.dispose = () => {
    cancelAnimationFrame(raf);
    if (ro) ro.disconnect();
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointerleave', up);
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    Object.keys(maps).forEach((k) => maps[k].dispose());
    if (scene.environment) scene.environment.dispose();
    renderer.dispose();
    /* dispose() alone leaves the GL context alive; browsers cap how many a page
       may hold, so a stale one starves the next viewer and it paints nothing */
    if (renderer.forceContextLoss) renderer.forceContextLoss();
    canvas.remove();
  };
  return api;
}
