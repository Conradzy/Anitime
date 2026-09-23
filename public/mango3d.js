import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inv = (v, a, b) => clamp((v - a) / (b - a), 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), clamp(t, 0, 1));

/* one fixed clock so the stage copy holds for every variety; varieties differ in
   fruit shape and ripe colour only */
const HARVEST = 118;

const VARIETY = {
  carabao: { ripe: '#F3B825', green: '#8FA83F', len: 1.02, rad: 0.33, belly: 0.1, beak: 0.1, flat: 0.8 },
  cebu: { ripe: '#EFC13A', green: '#87A13C', len: 0.95, rad: 0.35, belly: 0.06, beak: 0.07, flat: 0.86 },
  pico: { ripe: '#F0A62A', green: '#93AC42', len: 0.9, rad: 0.34, belly: 0.13, beak: 0.13, flat: 0.78 },
  indian: { ripe: '#E4C24B', green: '#7E9B39', len: 0.86, rad: 0.36, belly: 0.04, beak: 0.05, flat: 0.9 }
};

/* ---------- procedural texture helpers ---------- */

function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
function fbm(x, y, oct) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < (oct || 5); i++) { s += amp * vnoise(x * f, y * f); f *= 2.07; amp *= 0.5; }
  return s;
}
function paint(size, fn) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      const v = fn(x / size, y / size);
      d[o] = v[0]; d[o + 1] = v[1]; d[o + 2] = v[2]; d[o + 3] = v.length > 3 ? v[3] : 255;
    }
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
const g255 = (v) => { const n = clamp(Math.round(v * 255), 0, 255); return [n, n, n]; };

/* mango skin: fine lenticel stipple over a soft mottle, darkening at the stem */
function skinCanvas() {
  return paint(512, (u, v) => {
    const mottle = fbm(u * 7, v * 7, 4);
    const dots = Math.pow(fbm(u * 90, v * 90, 1), 6) * 3;
    const stem = lerp(0.72, 1, inv(v, 0, 0.12));
    return g255(clamp((0.88 + mottle * 0.12 + dots * 0.18) * stem, 0.2, 1));
  });
}

/* anthracnose: sunken dark blotches with a speckled margin */
function spotCanvas() {
  return paint(512, (u, v) => {
    const blot = clamp((fbm(u * 6, v * 6, 4) - 0.47) * 4.6, 0, 1);
    const speck = Math.pow(fbm(u * 40, v * 40, 2), 4) * 5;
    return [30, 18, 10, Math.round(clamp(blot + speck * 0.5, 0, 1) * 255)];
  });
}

function shadowCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(128, 128, 6, 128, 128, 124);
  grd.addColorStop(0, 'rgba(0,0,0,.5)');
  grd.addColorStop(0.55, 'rgba(0,0,0,.2)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 256, 256);
  return c;
}

function envTexture(renderer) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const ctx = c.getContext('2d');
  const grd = ctx.createLinearGradient(0, 0, 0, 32);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(0.45, '#dde0d0');
  grd.addColorStop(0.62, '#5f6d57');
  grd.addColorStop(1, '#16241c');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 64, 32);
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  ctx.beginPath(); ctx.ellipse(44, 7, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(t).texture;
  pmrem.dispose();
  t.dispose();
  return env;
}

/* ---------- parametric surfaces ---------- */

function grid(nu, nv, fn) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv;
      const p = fn(u, v);
      pos.push(p[0], p[1], p[2]);
      uv.push(u, v);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* the fruit: an ovoid hanging apex-down, laterally flattened, with a full
   shoulder at the stem, a belly on one side and a beak near the tip */
function mangoGeo(va) {
  return grid(30, 40, (u, v) => {
    const th = u * Math.PI * 2;
    /* superellipse profile: blunt at both ends, widest just below the stem */
    const s = clamp(2 * v - 1, -1, 1);
    const shoulder = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), 2.5)), 0.42);
    let r = va.rad * shoulder * (1 - 0.16 * v);
    /* beak: a small nose on the belly side, just above the tip */
    const nose = Math.exp(-Math.pow((v - 0.78) / 0.1, 2)) * Math.max(0, -Math.cos(th));
    r += va.beak * nose * va.rad;
    const cx = va.belly * Math.sin(Math.PI * Math.pow(v, 0.9));
    return [cx + Math.cos(th) * r, -va.len * v, Math.sin(th) * r * va.flat];
  });
}

/* the fibrous stone the flesh sits on — a flattened almond */
function seedGeo(va) {
  return grid(20, 24, (u, v) => {
    const th = u * Math.PI * 2;
    const s = clamp(2 * v - 1, -1, 1);
    const r = va.rad * 0.56 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), 2.4)), 0.45);
    return [Math.cos(th) * r, -va.len * 0.78 * v - va.len * 0.08, Math.sin(th) * r * 0.44];
  });
}

/* ---------- materials ---------- */

function skinMaterial(skin, spots) {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffffff'), map: skin, roughness: 0.46, metalness: 0,
    clearcoat: 0.3, clearcoatRoughness: 0.4, envMapIntensity: 0.7, transparent: true
  });
  const u = {
    uCol: { value: new THREE.Color('#8FA83F') },
    uWax: { value: 0 },
    uRot: { value: 0 },
    uSpotMap: { value: spots },
    uSpotRep: { value: new THREE.Vector2(2, 1.4) }
  };
  m.userData.age = u;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader =
      'uniform vec3 uCol;uniform float uWax;uniform float uRot;uniform sampler2D uSpotMap;uniform vec2 uSpotRep;\n' +
      shader.fragmentShader.replace('#include <map_fragment>', [
        '#include <map_fragment>',
        'diffuseColor.rgb *= uCol;',
        'diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.7 + vec3(0.3), uWax);',
        '#ifdef USE_MAP',
        '  float _mk = texture2D(uSpotMap, vMapUv * uSpotRep).a;',
        '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09,0.055,0.03), smoothstep(0.2,0.66,_mk) * uRot);',
        '#endif'
      ].join('\n'));
  };
  m.customProgramCacheKey = () => 'mangoSkin';
  return m;
}

/* ---------- the panicle ---------- */

const BRANCHES = 9, PER_BRANCH = 8;

function buildPanicle() {
  const grp = new THREE.Group();
  const stemMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#9C5238'), roughness: 0.8 });
  const flowerMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#C8D48A'), roughness: 0.62, metalness: 0, transparent: true
  });

  /* the axis the side branches hang off */
  const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.016, 1, 10), stemMat);
  axis.castShadow = true;
  axis.position.y = -0.5;
  grp.add(axis);

  const budGeo = new THREE.SphereGeometry(0.022, 8, 6);
  const branchGeo = new THREE.CylinderGeometry(0.011, 0.007, 1, 6);
  const branches = [];

  for (let i = 0; i < BRANCHES; i++) {
    const f = i / (BRANCHES - 1);
    /* pyramid outline: long branches at the base, short ones near the tip */
    const reach = lerp(0.44, 0.1, Math.pow(f, 0.85));
    const pivot = new THREE.Group();
    pivot.position.y = -0.12 - f * 0.78;
    pivot.rotation.y = i * 2.399;

    const arm = new THREE.Mesh(branchGeo, stemMat);
    arm.scale.y = reach;
    arm.position.set(reach * 0.42, -reach * 0.18, 0);
    arm.rotation.z = -1.06;
    pivot.add(arm);

    const buds = [];
    for (let k = 0; k < PER_BRANCH; k++) {
      const t = (k + 1) / PER_BRANCH;
      const b = new THREE.Mesh(budGeo, flowerMat);
      b.position.set(reach * 0.86 * t, -reach * 0.4 * t + 0.012, (hash(i, k) - 0.5) * 0.05);
      pivot.add(b);
      buds.push(b);
    }
    grp.add(pivot);
    branches.push({ pivot: pivot, arm: arm, buds: buds, reach: reach, order: f });
  }
  return { grp: grp, branches: branches, axis: axis, stemMat: stemMat, flowerMat: flowerMat };
}

/* ---------- viewer ---------- */

export function createViewer(host, mode) {
  const va = VARIETY[mode] || VARIETY.carabao;

  /* a fresh canvas per viewer: a canvas hands out one WebGL context for its
     lifetime, so a second renderer on a reused canvas draws one dead frame */
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:grab;touch-action:none';
  host.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.environment = envTexture(renderer);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0.4, 5);

  scene.add(new THREE.HemisphereLight(0xf6f5ef, 0x1d3126, 0.62));
  const key = new THREE.DirectionalLight(0xfff4e2, 2.05);
  key.position.set(3.4, 5.6, 3.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1; key.shadow.camera.far = 20;
  key.shadow.camera.left = -4; key.shadow.camera.right = 4;
  key.shadow.camera.top = 4.5; key.shadow.camera.bottom = -4.5;
  key.shadow.bias = -0.0016;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe8d6, 0.5);
  fill.position.set(-3.6, 1.4, 2.6);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xa7c641, 0.5);
  rim.position.set(-2.2, 2.4, -4.2);
  scene.add(rim);

  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 7),
    new THREE.MeshBasicMaterial({ map: tex(shadowCanvas()), transparent: true, depthWrite: false, opacity: 0.72 })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.scale.setScalar(0.2);
  shadowPlane.position.y = -1.85;
  scene.add(shadowPlane);

  const root = new THREE.Group();
  scene.add(root);

  const skinTex = tex(skinCanvas(), 1, 1);
  const spotTex = tex(spotCanvas(), 1, 1);

  /* the shoot the panicle rises from */
  const shootMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#5F7A34'), roughness: 0.8 });
  const shoot = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.048, 0.3, 12), shootMat);
  shoot.castShadow = true;
  root.add(shoot);

  const TOP = 0.95;

  const panicle = buildPanicle();
  panicle.grp.position.y = TOP;
  root.add(panicle.grp);

  /* three fruits set on the lower branches; two of them shed, one carries on */
  const fruitGeo = mangoGeo(va);
  const stoneGeo = seedGeo(va);
  const skinMat = skinMaterial(skinTex, spotTex);
  const stoneMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#C9B183'), roughness: 0.95 });
  const pedicelMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#7E8F3C'), roughness: 0.82 });

  const fruits = [];
  const SET = [
    { branch: 0, keep: true, scale: 1, out: 0.12 },
    { branch: 2, keep: false, scale: 0.72, out: 0.8 },
    { branch: 4, keep: false, scale: 0.6, out: 0.8 }
  ];
  SET.forEach((cfg) => {
    const b = panicle.branches[cfg.branch];
    const hook = new THREE.Group();
    hook.position.copy(b.pivot.position);
    hook.rotation.y = b.pivot.rotation.y;

    const arm = new THREE.Group();
    arm.position.set(b.reach * cfg.out, -b.reach * cfg.out * 0.45, 0);
    hook.add(arm);

    const pedicel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.013, 0.16, 8), pedicelMat);
    pedicel.position.y = -0.08;
    arm.add(pedicel);

    const body = new THREE.Group();
    body.position.y = -0.15;
    const skin = new THREE.Mesh(fruitGeo, skinMat);
    skin.castShadow = true;
    const stone = new THREE.Mesh(stoneGeo, stoneMat);
    stone.visible = false;
    body.add(skin, stone);
    arm.add(body);

    panicle.grp.add(hook);
    fruits.push({ hook: hook, body: body, skin: skin, stone: stone, cfg: cfg });
  });

  const api = { mode: mode };
  let day = 100;

  const apply = (d) => {
    const H = HARVEST;
    const elong = ease(inv(d, 0, 14));      /* buds swell, panicle stretches */
    const bloom = inv(d, 14, 25);           /* flowers open */
    const dry = inv(d, 25, 40);             /* spent flowers shrivel and fall */
    const set = inv(d, 26, 35);             /* pea-stage fruit */
    const shed = inv(d, 32, 44);            /* the tree drops its excess */
    const grow = ease(inv(d, 36, 75));      /* rapid expansion */
    const mature = inv(d, 76, 110);         /* growth stops, wax bloom, paler */
    const ripe = inv(d, H - 4, H + 7);      /* starch to sugar, yellow */
    const over = inv(d, H + 8, H + 17);     /* anthracnose spots, mush */
    const decomp = inv(d, H + 18, H + 27);  /* collapse, mould, seed shows */

    /* --- panicle --- */
    panicle.grp.scale.setScalar(lerp(0.4, 1, elong));
    panicle.grp.visible = elong > 0.02 || grow < 1;
    panicle.stemMat.color.copy(mix(mix('#9C5238', '#7E8F3C', bloom), '#6A5A32', dry));

    const fl = panicle.flowerMat;
    fl.color.copy(mix(mix('#C8D48A', '#F4EDC8', bloom), '#8A7448', dry));
    fl.opacity = 1 - dry;
    fl.transparent = dry > 0.01;

    panicle.branches.forEach((b) => {
      const t = ease(clamp((elong - b.order * 0.35) / 0.6, 0, 1));
      b.arm.scale.y = Math.max(0.02, b.reach * t);
      b.buds.forEach((bud, k) => {
        const open = ease(clamp((bloom - (k / PER_BRANCH) * 0.4) / 0.6, 0, 1));
        const s = lerp(0.45, 1.5, open) * (1 - dry * 0.7) * t;
        bud.visible = s > 0.03 && dry < 0.98;
        bud.scale.setScalar(Math.max(0.001, s));
      });
    });

    /* --- fruit --- */
    let lowest = TOP;
    fruits.forEach((f) => {
      const keep = f.cfg.keep;
      /* the excess crop sets, then abscises; the survivor keeps expanding */
      const size = keep
        ? lerp(0.055, 1, Math.max(ease(set) * 0.06, grow)) * lerp(1, 1.04, mature)
        : lerp(0.05, 0.12, ease(set)) * f.cfg.scale;
      const alive = keep ? 1 : 1 - ease(shed);
      const s = size * alive * lerp(1, 0.82, decomp);
      f.body.scale.setScalar(Math.max(0.001, s));
      f.body.visible = ease(set) > 0.02 && s > 0.004;
      f.hook.visible = f.body.visible;
      /* as the survivor swells it pulls its branch down and hangs plumb */
      if (keep) {
        f.hook.rotation.z = 0;
        lowest = Math.min(lowest, TOP - 0.3 - va.len * s);
      }
      f.stone.visible = decomp > 0.15;
      f.stone.scale.setScalar(lerp(1.02, 1.16, decomp));
    });

    const u = skinMat.userData.age;
    u.uCol.value
      .copy(mix(mix(mix('#A9BE5B', va.green, grow), va.ripe, ripe), '#4A3A1C', decomp))
      .multiplyScalar(lerp(1, 0.55, decomp));
    u.uWax.value = mature * (1 - ripe) * 0.55;
    u.uRot.value = Math.max(over * 0.75, decomp);
    skinMat.roughness = lerp(0.46, 0.92, Math.max(over * 0.6, decomp));
    skinMat.clearcoat = lerp(0.3, 0, over);
    skinMat.opacity = lerp(1, 0.42, decomp);

    /* --- shoot --- */
    shoot.position.y = TOP + 0.15;
    shootMat.color.copy(mix('#5F7A34', '#55692F', mature));

    /* --- framing --- */
    const yTop = TOP + 0.3;
    const bottom = Math.min(lowest, TOP - 1.05 * panicle.grp.scale.x) - 0.1;
    const midY = (yTop + bottom) / 2;
    const span = Math.max(0.8, yTop - bottom);
    camera.position.set(0, midY + span * 0.3, (span * 0.84) / Math.tan((camera.fov * Math.PI) / 360));
    camera.lookAt(0, midY - span * 0.04, 0);

    shadowPlane.position.y = bottom - 0.22;
    root.rotation.z = decomp * 0.05;
  };

  apply(day);
  api.ready = Promise.resolve(api);
  api.setDay = (d) => { day = d; apply(d); };

  let drag = null, spin = 0, tilt = 0.02, idle = 0;
  const down = (e) => { drag = { x: e.clientX, y: e.clientY, s: spin, t: tilt }; if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId); };
  const move = (e) => {
    if (!drag) return;
    idle = 0;
    spin = drag.s + (e.clientX - drag.x) * 0.008;
    tilt = clamp(drag.t + (e.clientY - drag.y) * 0.005, -0.4, 0.5);
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

  api.reset = () => { spin = 0; tilt = 0.02; };
  api.dispose = () => {
    cancelAnimationFrame(raf);
    if (ro) ro.disconnect();
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointerleave', up);
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        Object.keys(m).forEach((k) => { const v = m[k]; if (v && v.isTexture) v.dispose(); });
        m.dispose();
      });
    });
    [skinTex, spotTex].forEach((t) => t.dispose());
    if (scene.environment) scene.environment.dispose();
    renderer.dispose();
    /* dispose() alone leaves the GL context alive; browsers cap how many a page
       may hold, so a stale one starves the next viewer and it paints nothing */
    if (renderer.forceContextLoss) renderer.forceContextLoss();
    canvas.remove();
  };
  return api;
}
