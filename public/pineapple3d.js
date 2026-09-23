import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';
const LOADER_URL = 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

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

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inv = (v, a, b) => clamp((v - a) / (b - a), 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;

const MODELS = {
  pineapple: { url: 'models/pineapple-a.glb', fit: 3.5 }
};

/* deterministic noise for the rot blotch mask */
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

/* two-channel decay mask: R soft water-soak blotches, G hard black-rot specks */
const rotMask = () => paint(512, (u, v) => {
  const big = fbm(u * 5, v * 5, 5);
  const soak = clamp((big - 0.46) * 3.4, 0, 1);
  const spot = Math.pow(fbm(u * 26, v * 26, 3), 5) * 6;
  return [Math.round(soak * 255), Math.round(clamp(spot, 0, 1) * 255), 0, 255];
});

function shadowCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 6, 128, 128, 126);
  g.addColorStop(0, 'rgba(16,30,22,.66)');
  g.addColorStop(0.34, 'rgba(20,34,26,.34)');
  g.addColorStop(0.7, 'rgba(22,36,28,.1)');
  g.addColorStop(1, 'rgba(22,36,28,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return c;
}

function envTexture(renderer) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 32);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.45, '#eef1e6');
  g.addColorStop(0.75, '#cfd8c6');
  g.addColorStop(1, '#9fae94');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 32);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(t).texture;
  pmrem.dispose();
  t.dispose();
  return env;
}

/* Ages the scanned albedo in-shader. The scan is a ripe golden fruit, so every
   earlier stage is a colour grade away from it: green for the immature shell,
   magenta for the inflorescence, rot blotches for the far end. Shell and crown
   are separated by normalised height so leaves brown on their own schedule. */
function ageShader(mat, maskTex) {
  const u = {
    uToFruit: { value: new THREE.Matrix4() },  // geometry space → fruit-root space
    uUp: { value: new THREE.Vector3(0, 1, 0) },
    uYMin: { value: 0 },
    uYRange: { value: 1 },
    uSplit: { value: 0.58 },         // shell/crown boundary, 0..1 of model height
    uGreen: { value: 0 },            // unripe shell
    uFlower: { value: 0 },           // inflorescence magenta
    uRipeLine: { value: 1 },         // how far up the gold has climbed
    uRipeDeep: { value: 0 },         // golden → amber
    uRot: { value: 0 },              // soak + black spot
    uShrivel: { value: 0 },          // late desaturation and darkening
    uCrownDry: { value: 0 },         // leaf tip browning
    uCrownGrow: { value: 1 },
    uMask: { value: maskTex }
  };
  mat.userData.u = u;
  mat.onBeforeCompile = (s) => {
    Object.keys(u).forEach((k) => { s.uniforms[k] = u[k]; });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', [
        '#include <common>',
        'varying float vH;',
        'varying vec3 vLocal;',
        'uniform mat4 uToFruit;',
        'uniform vec3 uUp;',
        'uniform float uYMin, uYRange;'
      ].join('\n'))
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'vLocal = position;',
        'vec3 _fp = (uToFruit * vec4(position, 1.0)).xyz;',
        'vH = clamp((dot(_fp, uUp) - uYMin) / max(uYRange, 0.0001), 0.0, 1.0);'
      ].join('\n'));
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', [
        '#include <common>',
        'varying float vH;',
        'varying vec3 vLocal;',
        'uniform float uSplit, uGreen, uFlower, uRipeLine, uRipeDeep, uRot, uShrivel, uCrownDry, uCrownGrow;',
        'uniform mat4 uToFruit;',
        'uniform vec3 uUp;',
        'uniform float uYMin, uYRange;',
        'uniform sampler2D uMask;',
        'vec3 sat(vec3 c, float s){ float l = dot(c, vec3(0.2126,0.7152,0.0722)); return mix(vec3(l), c, s); }'
      ].join('\n'))
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        'float isCrown = smoothstep(uSplit - 0.04, uSplit + 0.04, vH);',
        'float shellT = clamp(vH / max(uSplit, 0.001), 0.0, 1.0);',
        'vec3 c = diffuseColor.rgb;',
        '',
        '// --- shell: drive both ends explicitly, the scan albedo is a mid-green fruit',
        'vec3 unripe = sat(c, 0.5) * vec3(0.40, 0.62, 0.26);',
        'vec3 gold   = sat(c, 1.3) * vec3(1.62, 1.10, 0.40);',
        'vec3 amber  = sat(c, 1.25) * vec3(1.40, 0.66, 0.16);',
        '// degreening climbs from the peduncle end, so the base is always ahead',
        'float ripe = clamp(uRipeLine * 1.45 - shellT * 0.55, 0.0, 1.0);',
        'ripe = smoothstep(0.0, 1.0, ripe);',
        'vec3 shell = mix(unripe, gold, ripe);',
        'shell = mix(shell, amber, clamp(uRipeDeep * 1.25, 0.0, 1.0) * ripe);',
        '// inflorescence: a red-magenta bract cone, no fruit colour at all',
        'vec3 bract = sat(c, 0.22) * vec3(1.55, 0.30, 0.46) + vec3(0.10, 0.0, 0.03);',
        'shell = mix(shell, bract, uFlower);',
        '',
        '// --- crown',
        'vec3 leaf = sat(c, 0.75) * vec3(0.38, 0.60, 0.32);',
        'float tip = smoothstep(uSplit + 0.1, 1.0, vH);',
        'vec3 crown = mix(leaf, vec3(0.36, 0.26, 0.13), uCrownDry * mix(0.2, 1.0, tip));',
        '',
        'c = mix(shell, crown, isCrown);',
        '',
        '// --- decay: water-soak from the base and eyes, then sunken black rot',
        'vec2 mUv = vLocal.xy * 3.4 + vec2(vH * 3.0, 0.0);',
        'vec2 m = texture2D(uMask, mUv).rg;',
        'float fromBase = 1.0 - smoothstep(0.0, 0.85, shellT);',
        'float soak = smoothstep(0.04, 0.5, m.r) * uRot * mix(0.7, 1.0, fromBase);',
        'c = mix(c, vec3(0.21, 0.115, 0.05), clamp(soak * 1.7, 0.0, 1.0));',
        'float spot = smoothstep(0.14, 0.58, m.g) * uRot;',
        'c = mix(c, vec3(0.035, 0.03, 0.026), clamp(spot * 1.9, 0.0, 1.0));',
        '// a fermenting fruit goes dark and dull, not chalky',
        'c = sat(c, 1.0 - uShrivel * 0.28) * (1.0 - uShrivel * 0.5);',
        '',
        'diffuseColor.rgb = c;'
      ].join('\n'));
  };
  mat.customProgramCacheKey = () => 'pine-age';
}

/* Violet florets opening across the shell during the flowering window. */
function buildFlorets() {
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#8b53c8'), roughness: 0.5, metalness: 0,
    sheen: 0.6, sheenColor: new THREE.Color('#d9a7ef'), clearcoat: 0.3,
    side: THREE.DoubleSide, transparent: true, opacity: 0.96
  });
  const geo = new THREE.ConeGeometry(0.075, 0.19, 5, 1, true);
  geo.translate(0, 0.08, 0);
  geo.rotateX(Math.PI / 2);
  const N = 92;
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.castShadow = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const slots = [];
  const GOLD = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N;                 // 0 base .. 1 top of the shell
    const ang = i * GOLD;
    slots.push({ t, ang, open: hash(i * 3.1, i * 7.7) });
  }
  return { mesh, mat, slots };
}

export function createViewer(host, mode) {
  const spec = MODELS[mode] || MODELS.pineapple;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:grab;touch-action:none';
  host.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.environment = envTexture(renderer);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0.9, 8.0);
  camera.lookAt(0, -0.05, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xa8b79e, 0.62));
  const key = new THREE.DirectionalLight(0xfff4e2, 2.35);
  key.position.set(3.6, 5.6, 3.8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1; key.shadow.camera.far = 24;
  key.shadow.camera.left = -4.5; key.shadow.camera.right = 4.5;
  key.shadow.camera.top = 4.5; key.shadow.camera.bottom = -4.5;
  key.shadow.bias = -0.0012;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xe6ecdd, 0.6);
  fill.position.set(-4.2, 1.5, 3.2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 1.0);
  rim.position.set(-2.4, 3.0, -4.6);
  scene.add(rim);

  const maskCanvasTex = new THREE.CanvasTexture(rotMask());
  maskCanvasTex.wrapS = maskCanvasTex.wrapT = THREE.RepeatWrapping;

  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 7),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas()), transparent: true, depthWrite: false, opacity: 0.8 })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.scale.setScalar(0.24);
  scene.add(shadowPlane);

  const root = new THREE.Group();
  scene.add(root);

  /* the Sketchfab wrapper node already stands the scan upright, so this group
     carries no rotation; the florets get their own Z-up frame below */
  const stand = new THREE.Group();
  root.add(stand);

  const floretHost = new THREE.Group();
  floretHost.rotation.x = -Math.PI / 2;
  stand.add(floretHost);

  const florets = buildFlorets();
  floretHost.add(florets.mesh);

  const api = { mode };
  let day = 150;
  let fruit = null, mats = [], baseScale = 1, groundY = -1.5, topZ = 3.25;
  const dummy = new THREE.Object3D();

  function apply(d) {
    /* 0 inflorescence · 30 anthesis · 60–140 fruit fill · 150 harvest · 200 rotten */
    const cone = inv(d, 0, 26);                 // red cone pushes up out of the plant
    const bloom = inv(d, 24, 40);               // violet florets open
    const bloomOut = inv(d, 44, 62);            // florets wither, fruitlets fuse
    const fill01 = inv(d, 40, 132);             // shell swells to full size
    const degreen = inv(d, 126, 162);           // gold climbs from the base
    const deep = inv(d, 158, 178);              // amber, fully ripe
    const rot = inv(d, 170, 198);               // soak, black spot
    const collapse = inv(d, 184, 200);

    if (!mats.length) return;
    const u0 = mats[0].userData.u;
    if (u0) {
      mats.forEach((m) => {
        const u = m.userData.u;
        if (!u) return;
        u.uGreen.value = clamp(1 - degreen, 0, 1);
        u.uRipeLine.value = degreen;
        u.uRipeDeep.value = deep;
        u.uFlower.value = clamp(1 - inv(d, 20, 56), 0, 1);
        u.uRot.value = rot;
        u.uShrivel.value = collapse * 0.8;
        u.uCrownDry.value = clamp(inv(d, 150, 200) * 0.9, 0, 1);
        m.roughness = lerp(0.78, 0.46, degreen) + collapse * 0.26;
        m.clearcoat = lerp(0.04, 0.42, degreen) * (1 - rot * 0.9);
        m.clearcoatRoughness = lerp(0.5, 0.28, degreen);
      });
    }

    /* size: a fist-sized cone at anthesis, full fruit by day 132, sagging at the end */
    const s = baseScale * lerp(0.2, 1, Math.pow(lerp(cone * 0.35, 1, fill01), 0.9)) * (1 - collapse * 0.09);
    stand.scale.setScalar(s);
    /* base stays on a fixed ground line; only the top grows, so the shadow never moves */
    stand.position.y = groundY;

    /* florets ride the shell surface, opening in a spiral then withering off */
    const show = bloom * (1 - bloomOut);
    florets.mesh.visible = show > 0.02;
    if (florets.mesh.visible) {
      const shellTop = topZ * 0.52;
      florets.slots.forEach((f, i) => {
        const z = 0.12 + f.t * (shellTop - 0.2);
        const prof = Math.sin(Math.PI * clamp(f.t * 0.92 + 0.08, 0, 1));
        const rad = 0.5 + prof * 0.28;
        dummy.position.set(Math.cos(f.ang) * rad, Math.sin(f.ang) * rad, z);
        dummy.lookAt(0, 0, z);
        dummy.rotateY(Math.PI);
        const open = clamp((show - f.open * 0.45) / 0.55, 0, 1);
        dummy.scale.setScalar(open * (0.75 + f.open * 0.5));
        dummy.updateMatrix();
        florets.mesh.setMatrixAt(i, dummy.matrix);
      });
      florets.mesh.instanceMatrix.needsUpdate = true;
      florets.mat.opacity = 0.96 * (1 - bloomOut);
      florets.mat.color.setStyle('#8b53c8').lerp(new THREE.Color('#5a2a3c'), bloomOut);
    }

    root.rotation.y = spin;
    root.rotation.x = tilt;
    renderer.render(scene, camera);
  }

  let drag = null, spin = -0.35, tilt = 0.06, idle = 0;

  api.setDay = (d) => { day = d; apply(d); };

  api.ready = gltfLoader()
    .then((loader) => new Promise((res, rej) => {
      loader.load(new URL(spec.url, document.baseURI).href, res, undefined, rej);
    }))
    .then((gltf) => {
      fruit = gltf.scene;
      fruit.updateWorldMatrix(true, true);

      /* the scan's local frame varies by exporter, so measure it: whichever axis
         of the fruit's own space is tallest becomes the ripening axis */
      const fruitInv = new THREE.Matrix4().copy(fruit.matrixWorld).invert();
      const localBox = new THREE.Box3();
      const meshes = [];
      fruit.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        meshes.push(o);
        const toFruit = new THREE.Matrix4().multiplyMatrices(fruitInv, o.matrixWorld);
        o.userData.toFruit = toFruit;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const gb = o.geometry.boundingBox.clone().applyMatrix4(toFruit);
        localBox.union(gb);
      });
      const lSize = localBox.getSize(new THREE.Vector3());
      const upAxis = lSize.y >= lSize.x && lSize.y >= lSize.z
        ? new THREE.Vector3(0, 1, 0)
        : (lSize.z >= lSize.x ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0));
      const yMin = localBox.min.dot(upAxis);
      const yRange = Math.max(lSize.dot(upAxis.clone().multiply(upAxis)) || lSize.y, 0.0001);

      meshes.forEach((o) => {
        o.castShadow = true;
        o.receiveShadow = true;
        const list = Array.isArray(o.material) ? o.material : [o.material];
        const cloned = list.map((m) => {
          if (!m) return m;
          const c = m.clone();
          if (c.map) { c.map.colorSpace = THREE.SRGBColorSpace; c.map.anisotropy = 8; }
          if (c.normalMap && c.normalScale) c.normalScale.set(1.35, 1.35);
          c.metalness = 0;
          c.side = THREE.FrontSide;
          ageShader(c, maskCanvasTex);
          c.userData.u.uToFruit.value.copy(o.userData.toFruit);
          c.userData.u.uUp.value.copy(upAxis);
          c.userData.u.uYMin.value = yMin;
          c.userData.u.uYRange.value = yRange;
          c.needsUpdate = true;
          mats.push(c);
          return c;
        });
        o.material = Array.isArray(o.material) ? cloned : cloned[0];
      });

      const box = new THREE.Box3().setFromObject(fruit);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      topZ = size.y || 3.25;
      baseScale = spec.fit / Math.max(size.x, size.y, size.z, 0.0001);
      /* centre in X/Z, sit the base at the group origin so scaling grows upward */
      const holder = new THREE.Group();
      holder.position.set(-center.x, -box.min.y, -center.z);
      holder.add(fruit);
      stand.add(holder);
      floretHost.scale.setScalar(topZ / 3.25);

      groundY = -(topZ * baseScale) / 2;
      stand.position.y = groundY;
      shadowPlane.position.y = groundY - 0.3;

      apply(day);
      return api;
    })
    .catch((err) => { console.error('pineapple model failed', err && (err.message || err.type), err); return api; });

  const down = (e) => { drag = { x: e.clientX, y: e.clientY, s: spin, t: tilt }; if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId); };
  const move = (e) => {
    if (!drag) return;
    idle = 0;
    spin = drag.s + (e.clientX - drag.x) * 0.008;
    tilt = clamp(drag.t + (e.clientY - drag.y) * 0.006, -0.4, 0.7);
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
    if (!drag) { idle += 1; if (idle > 50) spin += 0.0022; }
    root.rotation.y = spin;
    root.rotation.x = tilt;
    renderer.render(scene, camera);
  };
  tick();

  api.reset = () => { spin = -0.35; tilt = 0.06; };
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
    maskCanvasTex.dispose();
    if (scene.environment) scene.environment.dispose();
    renderer.dispose();
    /* dispose() alone leaves the GL context alive; browsers cap how many a page
       may hold, so a stale one starves the next viewer and it paints nothing */
    if (renderer.forceContextLoss) renderer.forceContextLoss();
    canvas.remove();
  };
  return api;
}
