import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as Cesium from 'cesium';

// Exercise the shipped button handlers with a real Cesium camera, without WebGL.
const source = ts.createSourceFile('map.tsx', readFileSync('components/DeliveryMap3D.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = source.statements.filter(node => ts.isFunctionDeclaration(node) && ['orbit', 'cancelOrbit'].includes(node.name?.text));
const javascript = ts.transpileModule(functions.map(node => node.getText(source)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const frames = [];
const sandbox = vm.createContext({ requestAnimationFrame: callback => frames.push(callback) });
vm.runInContext(javascript, sandbox);
let renders = 0;
const scene = {
  mapProjection: new Cesium.GeographicProjection(),
  ellipsoid: Cesium.Ellipsoid.WGS84,
  canvas: { clientWidth: 1200, clientHeight: 800 },
  drawingBufferWidth: 1200, drawingBufferHeight: 800,
  mode: Cesium.SceneMode.SCENE3D,
  screenSpaceCameraController: { maximumZoomDistance: 1500000 },
  requestRender: () => renders++,
  pickPositionSupported: false, // Rotation must work before photorealistic tiles load.
};
const camera = new Cesium.Camera(scene);
scene.camera = camera;
const ctx = { Cesium, viewer: { scene, camera, canvas: scene.canvas, isDestroyed: () => false }, orbitId: 0 };
function finish() { while (frames.length) frames.shift()(); }
function setView(height) {
  camera.setView({ destination: Cesium.Cartesian3.fromDegrees(125.45, 7.1, height), orientation: { heading: 0, pitch: Cesium.Math.toRadians(-55), roll: 0 } });
}
for (const height of [1800, 260000]) {
  setView(height);
  const before = Cesium.Cartesian3.clone(camera.positionWC);
  const heading = camera.heading;
  renders = 0;
  sandbox.orbit(ctx, 0, 20); finish();
  assert.ok(Cesium.Math.negativePiToPi(camera.heading - heading) > .2, 'Right rotation changes heading');
  assert.ok(Cesium.Cartesian3.distance(before, camera.positionWC) > 10, 'Camera orbits the ground target');
  assert.ok(Cesium.Matrix4.equals(camera.transform, Cesium.Matrix4.IDENTITY), 'Gesture control is released after rotation');
  assert.equal(renders, 18, 'Idle map gets every animation frame');
  const rightHeading = camera.heading;
  sandbox.orbit(ctx, 0, -20); finish();
  assert.ok(Cesium.Math.negativePiToPi(camera.heading - rightHeading) < -.2, 'Left rotation changes heading');
  sandbox.orbit(ctx, 0, 20);
  frames.shift()();
  sandbox.cancelOrbit(ctx);
  const stopped = Cesium.Cartesian3.clone(camera.positionWC);
  finish();
  assert.ok(Cesium.Cartesian3.equals(stopped, camera.positionWC), 'A gesture can interrupt button rotation');
}
console.log('Rotation passed at shop and regional zoom levels: both directions, unloaded tiles, explicit redraw and interruption.');
