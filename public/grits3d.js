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

const MODELS = {
  grits: { url: 'uploads/white-corn-grits.glb', fit: 2.6, exposure: 0.62 }
};

function shadowCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 126);
  g.addColorStop(0, 'rgba(18,32,24,.6)');
  g.addColorStop(0.38, 'rgba(20,34,26,.3)');
  g.addColorStop(0.72, 'rgba(22,36,28,.09)');
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

/* Scanned-asset viewer: shows the uploaded mesh as authored — textures, vertex
   colours and UVs untouched. Only sRGB decoding and shadow flags are set. */
export function createViewer(host, mode) {
  const spec = MODELS[mode] || MODELS.grits;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:grab;touch-action:none';
  host.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = spec.exposure || 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.environment = envTexture(renderer);
  scene.environmentIntensity = 0.3;

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 3.6, 5.0);
  camera.lookAt(0, -0.25, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8f9c86, 0.22));
  const key = new THREE.DirectionalLight(0xffeaba, 2.9);
  key.position.set(4.4, 3.6, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1; key.shadow.camera.far = 20;
  key.shadow.camera.left = -4; key.shadow.camera.right = 4;
  key.shadow.camera.top = 4; key.shadow.camera.bottom = -4;
  key.shadow.bias = -0.0012;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd6ddcc, 0.22);
  fill.position.set(-4, 1.4, 3.2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xe4ebd8, 0.6);
  rim.position.set(-2.6, 2.4, -4.6);
  scene.add(rim);

  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 8),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas()), transparent: true, depthWrite: false, opacity: 0.7 })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  scene.add(shadowPlane);



  const root = new THREE.Group();
  scene.add(root);

  const api = { mode };
  api.setDay = () => {};

  api.ready = gltfLoader()
    .then((loader) => new Promise((res, rej) => {
      loader.load(new URL(spec.url, document.baseURI).href, res, undefined, rej);
    }))
    .then((gltf) => {
      const obj = gltf.scene;
      obj.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
        const list = Array.isArray(o.material) ? o.material : [o.material];
        list.forEach((m) => {
          if (!m) return;
          if (m.map) { m.map.colorSpace = THREE.SRGBColorSpace; m.map.anisotropy = 8; }
          if (m.emissiveMap) m.emissiveMap.colorSpace = THREE.SRGBColorSpace;
          if (m.color) m.color.multiplyScalar(0.62);
          m.roughness = Math.max(0.8, m.roughness || 0);
          m.metalness = 0;
          m.side = THREE.FrontSide;
          m.needsUpdate = true;
        });
      });

      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = spec.fit / Math.max(size.x, size.y, size.z, 0.0001);
      obj.scale.setScalar(scale);
      obj.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
      root.add(obj);

      const b2 = new THREE.Box3().setFromObject(obj);
      shadowPlane.position.y = b2.min.y - 0.12;
      shadowPlane.scale.setScalar(0.28);
      return api;
    })
    .catch((err) => { console.error('grits model failed', err && (err.message || err.type), err); return api; });

  let drag = null, spin = -0.4, tilt = 0.05, idle = 0;
  const down = (e) => { drag = { x: e.clientX, y: e.clientY, s: spin, t: tilt }; if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId); };
  const move = (e) => {
    if (!drag) return;
    idle = 0;
    spin = drag.s + (e.clientX - drag.x) * 0.008;
    tilt = Math.max(-0.35, Math.min(0.85, drag.t + (e.clientY - drag.y) * 0.006));
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

  api.reset = () => { spin = -0.4; tilt = 0.05; };
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
    if (scene.environment) scene.environment.dispose();
    renderer.dispose();
    /* dispose() alone leaves the GL context alive; browsers cap how many a page
       may hold, so a stale one starves the next viewer and it paints nothing */
    if (renderer.forceContextLoss) renderer.forceContextLoss();
    canvas.remove();
  };
  return api;
}
