import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';
const LOADER_URL = 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inv = (v, a, b) => clamp((v - a) / (b - a), 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), clamp(t, 0, 1));

/* GLTFLoader imports the bare specifier "three" plus relative siblings, neither
   of which resolve from a blob URL. Rewrite every specifier to an absolute URL
   (siblings recursively, as blobs of their own) so the loader shares this
   module's single THREE instance without needing a document import map. */
const moduleCache = new Map();
function blobModule(url) {
  if (moduleCache.has(url)) return moduleCache.get(url);
  const p = fetch(url)
    .then((r) => r.text())
    .then(async (src) => {
      let out = src.replace(/(['"])three\1/g, `'${THREE_URL}'`);
      const specs = new Set();
      const re = /from\s*['"](\.[^'"]+)['"]/g;
      let m;
      while ((m = re.exec(out))) specs.add(m[1]);
      for (const spec of specs) {
        const child = await blobModule(new URL(spec, url).href);
        out = out.split(`'${spec}'`).join(`'${child}'`).split(`"${spec}"`).join(`"${child}"`);
      }
      return URL.createObjectURL(new Blob([out], { type: 'text/javascript' }));
    });
  moduleCache.set(url, p);
  return p;
}

let loaderPromise = null;
function gltfLoader() {
  if (!loaderPromise) {
    loaderPromise = blobModule(LOADER_URL)
      .then((url) => import(url))
      .then((m) => new m.GLTFLoader());
  }
  return loaderPromise;
}

const MODELS = {
  whole: { url: 'models/coconut-green.glb', fit: 2.35 },
  peeled: { url: 'models/coconut-peeled.glb', fit: 2.3 },
  cut: { url: 'models/coconut-cut.glb', fit: 2.5 },
  charcoal: { url: 'uploads/coconut-shell-charcoal.glb', fit: 2.3, charcoal: true }
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

const g = (v) => { const n = clamp(Math.round(v * 255), 0, 255); return [n, n, n]; };

/* meat: creamy mottling, used where the scan ships an untextured material */
function meatCanvas() {
  return paint(512, (u, v) => {
    const mott = fbm(u * 14, v * 9, 5);
    const stri = Math.sin(v * 120 + fbm(u * 4, v * 4, 2) * 6) * 0.5 + 0.5;
    return g(clamp(0.82 + mott * 0.16 + stri * 0.05, 0.5, 1));
  });
}

/* mould / rancid blotches — alpha channel is the mask the shader reads */
function mouldCanvas() {
  return paint(512, (u, v) => {
    const n = fbm(u * 8, v * 8, 5);
    const m = clamp((n - 0.46) * 3.4, 0, 1);
    const speck = Math.pow(fbm(u * 50, v * 50, 2), 6) * 3;
    return [40, 32, 18, Math.round(clamp(m + speck, 0, 1) * 255)];
  });
}

function shadowCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(128, 128, 6, 128, 128, 124);
  grd.addColorStop(0, 'rgba(0,0,0,.55)');
  grd.addColorStop(0.55, 'rgba(0,0,0,.22)');
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
  grd.addColorStop(0.45, '#d9ddcd');
  grd.addColorStop(0.62, '#5d6b56');
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

/* ---------- material aging ---------- */

/* average a texture down to one colour so scanned materials can be sorted
   into husk / shell / meat without hand-naming them */
function avgColor(map, fallback) {
  const img = map && map.image;
  if (!img || !(img.width || img.videoWidth)) {
    return fallback ? { r: fallback.r, g: fallback.g, b: fallback.b } : { r: 1, g: 1, b: 1 };
  }
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 16, 16);
    const d = ctx.getImageData(0, 0, 16, 16).data;
    let r = 0, gg = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4;
    return { r: r / n / 255, g: gg / n / 255, b: b / n / 255 };
  } catch (e) {
    return fallback ? { r: fallback.r, g: fallback.g, b: fallback.b } : { r: 1, g: 1, b: 1 };
  }
}

function roleOf(mat) {
  const a = avgColor(mat.map, mat.color);
  const max = Math.max(a.r, a.g, a.b), min = Math.min(a.r, a.g, a.b);
  const sat = max > 0.001 ? (max - min) / max : 0;
  const lum = 0.2126 * a.r + 0.7152 * a.g + 0.0722 * a.b;
  if (a.g > a.r * 1.04 && a.g > a.b * 1.1 && sat > 0.12) return 'husk';
  if (lum > 0.55 && sat < 0.22) return 'meat';
  return 'shell';
}

/* standard material + a small aging patch: desaturate, tint toward a target
   colour keeping texture luminance, then blot with the mould mask */
function aged(src, role, mouldTex, fallbackMap) {
  const std = src.isMeshStandardMaterial || src.isMeshPhysicalMaterial;
  const m = std ? src.clone() : new THREE.MeshStandardMaterial({
    name: src.name,
    map: src.map || null,
    color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
    side: src.side,
    alphaMap: src.alphaMap || null,
    transparent: src.transparent,
    opacity: src.opacity,
    vertexColors: src.vertexColors
  });
  if (!m.map && fallbackMap) m.map = fallbackMap;
  if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
  m.metalness = 0;
  m.roughness = role === 'meat' ? 0.42 : 0.76;
  m.envMapIntensity = 0.8;
  m.side = THREE.DoubleSide;

  const u = {
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uMixCol: { value: new THREE.Color('#6a4420') },
    uMixAmt: { value: 0 },
    uDesat: { value: 0 },
    uRot: { value: 0 },
    uMouldMap: { value: mouldTex },
    uMouldRep: { value: new THREE.Vector2(role === 'meat' ? 2.4 : 3.4, role === 'meat' ? 2.4 : 3.4) }
  };
  m.userData.age = u;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader =
      'uniform vec3 uTint;uniform vec3 uMixCol;uniform float uMixAmt;uniform float uDesat;' +
      'uniform float uRot;uniform sampler2D uMouldMap;uniform vec2 uMouldRep;\n' +
      shader.fragmentShader.replace('#include <map_fragment>', [
        '#include <map_fragment>',
        '{',
        '  float _l = dot(diffuseColor.rgb, vec3(0.2126,0.7152,0.0722));',
        '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(_l), uDesat);',
        '  diffuseColor.rgb = mix(diffuseColor.rgb, uMixCol * (0.6 + 0.7 * _l), uMixAmt);',
        '  diffuseColor.rgb *= uTint;',
        '  #ifdef USE_MAP',
        '    float _mk = texture2D(uMouldMap, vMapUv * uMouldRep).a;',
        '    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05,0.042,0.03), smoothstep(0.2,0.9,_mk) * uRot * 0.92);',
        '  #endif',
        '}'
      ].join('\n'));
  };
  m.customProgramCacheKey = () => 'aged';
  return m;
}

/* ---------- procedural sprout (the scans have no shoot) ---------- */

function buildSprout() {
  const leafMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#568f30'), roughness: 0.66, side: THREE.DoubleSide,
    sheen: 0.3, sheenColor: new THREE.Color('#bdd694')
  });
  const bladeGeo = () => {
    const g = new THREE.PlaneGeometry(0.34, 1.3, 3, 18);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      const t = clamp((y + 0.65) / 1.3, 0, 1);
      const w = Math.sin(Math.PI * Math.pow(t, 0.5)) * (1 - t * 0.5) + 0.06;
      p.setX(i, x * w);
      p.setY(i, y + 0.65 - Math.pow(t, 2.6) * 0.3);
      p.setZ(i, Math.pow(t, 1.7) * 0.62 + Math.abs(x * w) * 0.5 * (0.25 + t));
    }
    p.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  };
  const grp = new THREE.Group();
  const sheath = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.11, 0.46, 16), leafMat);
  sheath.position.y = 0.21;
  sheath.castShadow = true;
  grp.add(sheath);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(bladeGeo(), leafMat);
    blade.position.y = 0.16;
    blade.rotation.y = i * 2.09 + 0.4;
    blade.rotation.x = -0.12 - (i % 2) * 0.1;
    blade.scale.setScalar(0.9 + (i % 2) * 0.18);
    blade.castShadow = true;
    grp.add(blade);
  }
  grp.scale.setScalar(0.001);
  return { grp, leafMat };
}

/* ---------- viewer ---------- */

export function createViewer(host, mode) {
  const spec = MODELS[mode] || MODELS.cut;

  /* a fresh canvas per viewer: a canvas hands out one WebGL context for its
     lifetime, so a second renderer on a reused canvas draws one dead frame */
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:grab;touch-action:none';
  host.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.environment = envTexture(renderer);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 1.15, 6.1);
  camera.lookAt(0, -0.05, 0);

  scene.add(new THREE.HemisphereLight(0xf6f5ef, 0x1d3126, 0.6));
  const key = new THREE.DirectionalLight(0xfff4e2, 2.1);
  key.position.set(3.2, 5.4, 3.8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1; key.shadow.camera.far = 18;
  key.shadow.camera.left = -4; key.shadow.camera.right = 4;
  key.shadow.camera.top = 4; key.shadow.camera.bottom = -4;
  key.shadow.bias = -0.0015;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe8d6, 0.55);
  fill.position.set(-3.6, 1.2, 2.4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xa7c641, 0.45);
  rim.position.set(-2.4, 2.2, -4);
  scene.add(rim);

  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 7),
    new THREE.MeshBasicMaterial({ map: tex(shadowCanvas()), transparent: true, depthWrite: false, opacity: 0.84 })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.scale.setScalar(0.42);
  shadowPlane.position.y = -1.42;
  scene.add(shadowPlane);

  const root = new THREE.Group();
  scene.add(root);

  const mouldTex = tex(mouldCanvas(), 1, 1);
  const meatTex = tex(meatCanvas(), 2, 1);
  const disposables = [mouldTex, meatTex];

  const sprout = buildSprout();
  const shell = new THREE.Group();
  root.add(shell);

  const api = { mode };
  let day = 330;
  let apply = null;
  let baseScale = 1;
  let groundY = -1.42;

  api.ready = gltfLoader()
    .then((loader) => new Promise((res, rej) => {
      loader.load(new URL(spec.url, document.baseURI).href, res, undefined, rej);
    }))
    .then((gltf) => {
      const obj = gltf.scene;
      const roles = { husk: [], shell: [], meat: [] };
      const swapped = new Map();

      obj.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = false;
        const list = Array.isArray(o.material) ? o.material : [o.material];
        const next = list.map((src) => {
          if (swapped.has(src)) return swapped.get(src);
          const role = mode === 'whole' && roleOf(src) !== 'meat' ? 'husk' : roleOf(src);
          const m = aged(src, role, mouldTex, meatTex);
          roles[role].push(m);
          swapped.set(src, m);
          return m;
        });
        o.material = Array.isArray(o.material) ? next : next[0];
      });

      /* centre the scan on the origin and normalise its size */
      const box = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3(); box.getSize(size);
      const centre = new THREE.Vector3(); box.getCenter(centre);
      baseScale = spec.fit / Math.max(size.x, size.y, size.z);
      const inner = new THREE.Group();
      inner.add(obj);
      inner.position.copy(centre).multiplyScalar(-1);
      shell.add(inner);
      shell.scale.setScalar(baseScale);

      const height = size.y * baseScale;
      groundY = -height / 2 - 0.34;
      shadowPlane.position.y = groundY;
      sprout.grp.position.y = height / 2 * 0.82;
      shell.add(sprout.grp);
      sprout.grp.scale.setScalar(0.001);
      sprout.grp.position.multiplyScalar(1 / baseScale);
      sprout.grp.scale.setScalar(0.001);
      const sprScale = 1 / baseScale;

      apply = (d) => {
        /* phase curves, keyed to the almanac timeline */
        const grow = Math.pow(inv(d, 0, 195), 0.62);
        const brown = inv(d, 250, 345);
        const dark = inv(d, 470, 560);
        const rot = inv(d, 520, 600);
        const jelly = 1 - inv(d, 195, 305);
        const dry = inv(d, 360, 470);
        const rancid = inv(d, 505, 600);
        const hard = inv(d, 150, 330);

        roles.husk.forEach((m) => {
          const u = m.userData.age;
          u.uMixCol.value.copy(mix('#6b4118', '#151109', dark));
          u.uMixAmt.value = clamp(Math.max(brown * 0.88, dark), 0, 1);
          u.uDesat.value = brown * 0.25 + dark * 0.55;
          const t = lerp(1, 0.62, dark);
          u.uTint.value.set(t, t, t);
          u.uRot.value = rot;
          m.roughness = lerp(0.68, 1, Math.max(brown, dark));
          m.needsUpdate = false;
        });

        roles.shell.forEach((m) => {
          const u = m.userData.age;
          u.uMixCol.value.copy(mix('#d8c6a4', '#191210', rot));
          u.uMixAmt.value = clamp(Math.max((1 - hard) * 0.72, rot * 0.95), 0, 1);
          u.uDesat.value = rot * 0.45;
          const t = lerp(1, 0.78, Math.max(dark * 0.6, rot));
          u.uTint.value.set(t, t, t);
          u.uRot.value = rot;
          m.roughness = lerp(0.6, 0.98, Math.max(hard * 0.5, rot));
        });

        roles.meat.forEach((m) => {
          const u = m.userData.age;
          u.uMixCol.value.copy(mix(mix('#cfe0d4', '#efe2c2', dry), '#8b7a55', rancid));
          u.uMixAmt.value = clamp(Math.max(jelly * 0.6, dry * 0.35, rancid * 0.95), 0, 1);
          u.uDesat.value = rancid * 0.4;
          const t = lerp(1, 0.74, rancid);
          u.uTint.value.set(t, t, t);
          u.uRot.value = rancid;
          m.roughness = lerp(0.32, 0.88, Math.max(dry * 0.7, rancid));
          m.transparent = jelly > 0.02;
          m.opacity = lerp(1, 0.72, jelly);
        });

        const shrink = 1 - rot * 0.14;
        const s = baseScale * (mode === 'whole' ? lerp(0.46, 1, grow) : lerp(0.82, 1, grow)) * shrink;
        shell.scale.setScalar(s);
        shadowPlane.position.y = groundY;

        const sp = inv(d, 395, 515) * (1 - inv(d, 550, 600));
        sprout.grp.visible = mode !== 'cut' && sp > 0.01;
        sprout.grp.scale.setScalar(Math.max(0.001, sp * sprScale));
        sprout.leafMat.color.copy(mix('#67a63f', '#46522a', dark));

        root.rotation.z = rot * 0.06;
      };
      if (spec.charcoal) {
        apply = () => {
          [].concat(roles.husk, roles.shell, roles.meat).forEach((m) => {
            const u = m.userData.age;
            u.uMixCol.value.copy(new THREE.Color('#15120f'));
            u.uMixAmt.value = 0.88;
            u.uDesat.value = 0.8;
            u.uTint.value.set(0.7, 0.7, 0.7);
            u.uRot.value = 0;
            m.roughness = 0.95;
            m.metalness = 0;
          });
          sprout.grp.visible = false;
          shell.scale.setScalar(baseScale);
          shadowPlane.position.y = groundY;
        };
      }
      apply(day);
      return api;
    });

  api.setDay = (d) => { day = d; if (apply) apply(d); };

  /* pointer drag + idle motion */
  let drag = null, spin = 0, tilt = mode === 'cut' ? 0.18 : 0.06, idle = 0, held = 0;
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
    if (!drag) {
      idle += 1;
      if (idle > 50) {
        if (mode === 'cut') { held += 0.005; spin = Math.sin(held) * 0.36; }
        else spin += 0.0026;
      }
    }
    root.rotation.y = spin;
    root.rotation.x = tilt;
    renderer.render(scene, camera);
  };
  tick();

  api.reset = () => { spin = 0; tilt = mode === 'cut' ? 0.18 : 0.06; };
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
    disposables.forEach((t) => t.dispose());
    if (scene.environment) scene.environment.dispose();
    renderer.dispose();
    /* dispose() alone leaves the GL context alive; browsers cap how many a page
       may hold, so a stale one starves the next viewer and it paints nothing */
    if (renderer.forceContextLoss) renderer.forceContextLoss();
    canvas.remove();
  };
  return api;
}
