import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inv = (v, a, b) => clamp((v - a) / (b - a), 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), clamp(t, 0, 1));

/* the timeline is fixed so the phase copy holds for every variety; the varieties
   differ in skin colour, finger shape and bunch size, and their own harvest
   windows are called out in the product-type notes */
const HARVEST = 120;

const VARIETY = {
  latundan: { ripe: '#F2CE4A', green: '#8CA53E', len: 0.6, rad: 0.115, curve: 0.4, hands: 5, perRow: 6 },
  saba: { ripe: '#E9C24C', green: '#7E9B39', len: 0.52, rad: 0.132, curve: 0.28, hands: 4, perRow: 5 },
  lakatan: { ripe: '#F5B733', green: '#93AC42', len: 0.66, rad: 0.108, curve: 0.46, hands: 5, perRow: 6 }
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

/* banana skin: soft longitudinal ridges, a dark stem end and a dark tip.
   u runs around the finger, v along it. */
function skinCanvas() {
  return paint(512, (u, v) => {
    const ridge = Math.cos(u * Math.PI * 10) * 0.5 + 0.5;
    const grain = fbm(u * 6, v * 22, 4);
    const ends = Math.min(inv(v, 0, 0.07), 1 - inv(v, 0.9, 1));
    const base = (0.9 + ridge * 0.12 + grain * 0.1) * lerp(0.34, 1, Math.pow(ends, 0.55));
    return g255(clamp(base, 0.12, 1));
  });
}

/* bract skin: lengthwise veins with a waxy bloom */
function bractCanvas() {
  return paint(256, (u, v) => {
    const vein = Math.sin(u * 74 + fbm(u * 3, v * 2, 2) * 3) * 0.5 + 0.5;
    const bloom = fbm(u * 5, v * 3, 4);
    return g255(clamp(0.82 + vein * 0.1 + bloom * 0.12 - v * 0.08, 0.55, 1));
  });
}

/* sugar spots — alpha is the speckle mask the shader reads */
function spotCanvas() {
  return paint(512, (u, v) => {
    const blot = clamp((fbm(u * 9, v * 9, 4) - 0.48) * 4.2, 0, 1);
    const speck = Math.pow(fbm(u * 52, v * 52, 2), 4.4) * 5.5;
    return [42, 26, 14, Math.round(clamp(speck + blot * 0.7, 0, 1) * 255)];
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

/* one finger: a rounded-pentagon cross-section swept along a spine that runs
   out along +X and curls up in +Y, pinched shut at the stem and the tip */
function fingerGeo(len, rad, curve) {
  return grid(16, 26, (u, v) => {
    const th = u * Math.PI * 2;
    const sx = len * v;
    const sy = curve * v * v;
    const tl = Math.hypot(len, 2 * curve * v) || 1;
    const nx = (-2 * curve * v) / tl, ny = len / tl;
    const pent = 1 + 0.11 * Math.cos(5 * th + 0.4);
    const prof = Math.pow(Math.sin(Math.PI * Math.pow(v, 0.6)), 0.36);
    const r = rad * prof * pent;
    const cu = Math.cos(th) * r, su = Math.sin(th) * r;
    return [sx + cu * nx, sy + cu * ny, su];
  });
}

/* one bract: a strip wrapped around the bud axis whose radius tapers to nothing,
   so the tips of every rank converge on the point of the bud */
function bractGeo(len, wid, rad, curl) {
  return grid(12, 30, (u, v) => {
    const hv = Math.pow(Math.sin(Math.PI * Math.pow(v, 0.5)), 0.85) * wid + 0.002;
    const R = Math.max(0.014, rad * (1 - Math.pow(v, 1.75)));
    const s = (u - 0.5) * 2;
    const a = clamp((s * hv) / R, -2.4, 2.4);
    const bend = curl * v * v;
    return [R * Math.sin(a), -len * v - bend * 0.08, R * Math.cos(a) + bend * 0.3];
  });
}

/* the unopened core the bracts wrap — a downward spindle */
function spindleGeo(len, rad) {
  return grid(26, 26, (u, v) => {
    const th = u * Math.PI * 2;
    const r = rad * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.6)), 0.7) + 0.002;
    return [r * Math.cos(th), -len * v, r * Math.sin(th)];
  });
}

/* ---------- materials ---------- */

/* skin that ages: tint toward the target colour keeping the texture's shading,
   then blot with the sugar-spot mask */
function skinMaterial(skin, spots) {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffffff'), map: skin, roughness: 0.54, metalness: 0,
    clearcoat: 0.18, clearcoatRoughness: 0.55, envMapIntensity: 0.6
  });
  const u = {
    uCol: { value: new THREE.Color('#8CA53E') },
    uRot: { value: 0 },
    uSpotMap: { value: spots },
    uSpotRep: { value: new THREE.Vector2(3, 2) }
  };
  m.userData.age = u;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader =
      'uniform vec3 uCol;uniform float uRot;uniform sampler2D uSpotMap;uniform vec2 uSpotRep;\n' +
      shader.fragmentShader.replace('#include <map_fragment>', [
        '#include <map_fragment>',
        'diffuseColor.rgb *= uCol;',
        '#ifdef USE_MAP',
        '  float _mk = texture2D(uSpotMap, vMapUv * uSpotRep).a;',
        '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1,0.06,0.03), smoothstep(0.15,0.62,_mk) * uRot);',
        '#endif'
      ].join('\n'));
  };
  m.customProgramCacheKey = () => 'bananaSkin';
  return m;
}

/* plum outside, crimson inner face, from one double-sided mesh */
function bractMaterial(skin, outColor, inColor) {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffffff'), map: skin, roughness: 0.52, metalness: 0,
    side: THREE.DoubleSide, sheen: 0.25, sheenRoughness: 0.55,
    sheenColor: new THREE.Color('#C6AEC0'), clearcoat: 0.15, clearcoatRoughness: 0.65,
    envMapIntensity: 0.5, transparent: true
  });
  const u = { uOut: { value: new THREE.Color(outColor) }, uIn: { value: new THREE.Color(inColor) } };
  m.userData.face = u;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = 'uniform vec3 uOut;uniform vec3 uIn;\n' +
      shader.fragmentShader.replace('#include <map_fragment>', [
        '#include <map_fragment>',
        'diffuseColor.rgb *= gl_FrontFacing ? uOut : uIn;'
      ].join('\n'));
  };
  m.customProgramCacheKey = () => 'bractTwoTone';
  return m;
}

/* ---------- the bunch ---------- */

function buildBunch(va, skin, spots) {
  const grp = new THREE.Group();
  const crownMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#7C6A3A'), roughness: 0.85 });
  const hands = [];
  const mats = [];

  for (let i = 0; i < va.hands; i++) {
    const f = i / Math.max(1, va.hands - 1);
    const s = lerp(1, 0.66, f);
    const geo = fingerGeo(va.len * s, va.rad * s, va.curve * s);
    /* each hand keeps its own material so the bunch can ripen top-down */
    const mat = skinMaterial(skin, spots);
    mats.push(mat);

    const hand = new THREE.Group();
    hand.position.y = -0.1 - i * 0.26;
    hand.rotation.y = i * 1.24 + 0.3;

    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.055 * s, 0.085 * s, 0.09, 12), crownMat);
    crown.position.y = 0.02;
    hand.add(crown);

    for (let row = 0; row < 2; row++) {
      for (let k = 0; k < va.perRow; k++) {
        const a = (k / va.perRow) * Math.PI * 2 + row * (Math.PI / va.perRow);
        const spin = new THREE.Group();
        spin.rotation.y = a;
        const m = new THREE.Mesh(geo, mat);
        m.castShadow = true;
        m.rotation.z = -0.08 - row * 0.3;
        m.position.set(0.04 * s, -row * 0.06, 0);
        spin.add(m);
        hand.add(spin);
      }
    }
    grp.add(hand);
    hands.push(hand);
  }

  const height = 0.1 + (va.hands - 1) * 0.26 + va.len * 0.72;
  return { grp: grp, hands: hands, mats: mats, crownMat: crownMat, height: height };
}

/* ---------- the flower ---------- */

const RANKS = 5, PER_RANK = 4;

function buildFlower(skin) {
  const grp = new THREE.Group();
  /* the grid winding puts the outward surface on the back face, so the plum
     exterior is uIn and the crimson inner face is uOut */
  const bractMat = bractMaterial(skin, '#B22B33', '#5E2B47');
  const coreMat = bractMaterial(skin, '#4C2239', '#4C2239');

  const core = new THREE.Mesh(spindleGeo(1.14, 0.17), coreMat);
  core.castShadow = true;
  grp.add(core);

  const bracts = [];
  for (let r = 0; r < RANKS; r++) {
    const f = r / (RANKS - 1);
    const geo = bractGeo(lerp(1.05, 0.6, f), lerp(0.38, 0.26, f), lerp(0.34, 0.2, f), lerp(0.24, 0.14, f));
    for (let k = 0; k < PER_RANK; k++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (k / PER_RANK) * Math.PI * 2 + r * 0.62;
      pivot.position.y = -0.015 - r * 0.055;
      const hinge = new THREE.Group();
      const leaf = new THREE.Mesh(geo, bractMat);
      leaf.castShadow = true;
      hinge.add(leaf);
      pivot.add(hinge);
      grp.add(pivot);
      /* outer ranks lift first; within a rank they go one at a time */
      bracts.push({ hinge: hinge, leaf: leaf, order: r * PER_RANK + k });
    }
  }
  return { grp: grp, core: core, bracts: bracts, mats: [bractMat, coreMat] };
}

/* ---------- viewer ---------- */

export function createViewer(host, mode) {
  const va = VARIETY[mode] || VARIETY.lakatan;

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
  camera.position.set(0, 0.6, 6);

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
  const bractTex = tex(bractCanvas(), 1, 1);
  const spotTex = tex(spotCanvas(), 1, 1);

  const stalkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#6E8B3D'), roughness: 0.78 });
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.032, 1, 14), stalkMat);
  stalk.castShadow = true;
  root.add(stalk);

  const bunch = buildBunch(va, skinTex, spotTex);
  const bunchGrp = new THREE.Group();
  bunchGrp.add(bunch.grp);
  root.add(bunchGrp);

  const flower = buildFlower(bractTex);
  const flowerGrp = new THREE.Group();
  flowerGrp.add(flower.grp);
  root.add(flowerGrp);

  const TOP = 0.9;
  const api = { mode: mode };
  let day = 60;

  const apply = (d) => {
    const H = HARVEST;
    const bud = ease(inv(d, 0, 26));        /* bud emerges and swells */
    const open = inv(d, 24, H * 0.86);      /* bracts lift and shed */
    const grow = ease(inv(d, 26, H));       /* hands fill out */
    const yellow = inv(d, H + 1, H + 11);   /* green to ripe */
    const spot = inv(d, H + 9, H + 20);     /* sugar spots */
    const rot = inv(d, H + 16, H + 30);     /* brown, then mush */

    /* --- bunch: hands appear one at a time as the bracts above them go --- */
    const bs = lerp(0.3, 1, grow) * (1 - rot * 0.08);
    bunchGrp.scale.setScalar(bs);
    const bh = bunch.height * bs;
    bunchGrp.position.y = TOP;
    bunchGrp.visible = grow > 0.02;

    bunch.hands.forEach((h, i) => {
      const t = inv(grow, (i / va.hands) * 0.78, (i / va.hands) * 0.78 + 0.24);
      h.visible = t > 0.02;
      h.scale.setScalar(Math.max(0.001, ease(t)));
    });

    /* upper hands ripen a few days ahead of the ones below */
    bunch.mats.forEach((m, i) => {
      const off = (i / Math.max(1, va.hands - 1)) * 5;
      const y2 = inv(d - off, H + 1, H + 11);
      const s2 = inv(d - off, H + 9, H + 20);
      const r2 = inv(d - off, H + 16, H + 30);
      const u = m.userData.age;
      u.uCol.value.copy(mix(mix(va.green, va.ripe, y2), '#4C3315', r2)).multiplyScalar(lerp(1, 0.5, r2));
      u.uRot.value = Math.max(s2 * 0.55, r2);
      m.roughness = lerp(0.5, 0.9, r2);
      m.clearcoat = lerp(0.18, 0, r2);
    });
    bunch.crownMat.color.copy(mix('#7C6A3A', '#3E2E18', Math.max(yellow * 0.3, rot)));

    /* --- flower hangs off the end of the bunch --- */
    const fs = lerp(0.42, 1, bud) * lerp(1, 0.66, grow) * (1 - rot * 0.5);
    flowerGrp.scale.setScalar(Math.max(0.001, fs));
    flowerGrp.position.y = TOP - (bunchGrp.visible ? bh + 0.02 : 0.04);
    flowerGrp.visible = fs > 0.01;

    const fade = 1 - inv(d, H + 4, H + 22);
    flower.mats.forEach((m) => { m.opacity = fade; m.transparent = fade < 0.99; });
    flower.mats[0].userData.face.uIn.value.copy(mix('#5E2B47', '#3A2030', open * 0.45));
    flower.mats[1].userData.face.uOut.value.copy(mix('#4C2239', '#3A2030', open * 0.45));
    flower.mats[1].userData.face.uIn.value.copy(mix('#4C2239', '#3A2030', open * 0.45));

    const n = flower.bracts.length;
    let lifted = 0;
    flower.bracts.forEach((b) => {
      const t0 = b.order / n;
      const lift = ease(clamp((open - t0 * 0.9) / 0.07, 0, 1));
      b.hinge.rotation.x = -lift * 1.95;
      b.hinge.position.y = -lift * 0.08;
      const vis = 1 - clamp((open - t0 * 0.9 - 0.07) / 0.06, 0, 1);
      b.leaf.visible = vis > 0.02;
      /* a lifting bract dries and shrinks before it drops */
      b.leaf.scale.setScalar(Math.max(0.001, vis * lerp(1, 0.78, lift)));
      if (b.leaf.visible) lifted = Math.max(lifted, lift);
    });
    flower.core.scale.set(1, lerp(1, 0.82, open), 1);

    /* --- rachis: one continuous stalk from the crown down to the bud --- */
    const yTop = TOP + 0.18;
    const yBot = flowerGrp.position.y;
    stalk.scale.y = Math.max(0.05, yTop - yBot);
    stalk.position.y = (yTop + yBot) / 2;
    stalkMat.color.copy(mix(mix('#6E8B3D', '#7E8A3A', grow), '#5A4A27', rot));

    /* --- frame whatever is currently on screen, including bracts swung up --- */
    const frameTop = Math.max(yTop, flowerGrp.position.y + 0.62 * fs * lifted);
    const bottom = flowerGrp.position.y - 1.2 * fs;
    const midY = (frameTop + bottom) / 2;
    const span = Math.max(0.78, frameTop - bottom);
    camera.position.set(0, midY + span * 0.3, (span * 0.78) / Math.tan((camera.fov * Math.PI) / 360));
    camera.lookAt(0, midY - span * 0.04, 0);

    shadowPlane.position.y = bottom - 0.24;
    root.rotation.z = rot * 0.05;
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
    [skinTex, bractTex, spotTex].forEach((t) => t.dispose());
    if (scene.environment) scene.environment.dispose();
    renderer.dispose();
    /* dispose() alone leaves the GL context alive; browsers cap how many a page
       may hold, so a stale one starves the next viewer and it paints nothing */
    if (renderer.forceContextLoss) renderer.forceContextLoss();
    canvas.remove();
  };
  return api;
}
