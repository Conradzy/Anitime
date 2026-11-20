import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { buildNetwork, routeNetwork } from '../lib/road-network.mjs';

const a = [125, 7], b = [125.01, 7], c = [125.01, 7.01];
const directed = buildNetwork([{ roads: [[1, [a, b, c]]] }]);
assert.equal(routeNetwork(directed, a, c)?.path.length, 3);
assert.equal(routeNetwork(directed, c, a), null, 'Do not drive against one-way roads');
assert.equal(routeNetwork(directed, [120, 7], c), null, 'Do not snap distant places');
const crossBorder = buildNetwork([{ roads: [[0, [a, b]]] }, { roads: [[0, [b, c]]] }]);
assert.equal(routeNetwork(crossBorder, a, c)?.path.length, 3, 'Join province files at shared road nodes');
const disconnected = buildNetwork([{ roads: [[0, [a, b]], [0, [[126, 8], [126.01, 8]]]] }]);
assert.equal(routeNetwork(disconnected, a, [126, 8]), null);
const detour = [125, 7.02];
const weighted = buildNetwork([{ roads: [[0, [a, detour, c]], [0, [a, b, c]]] }]);
assert.deepEqual(routeNetwork(weighted, a, c)?.path, [[7, 125], [7, 125.01], [7.01, 125.01]], 'Choose lower distance');
for (const file of readdirSync('routing-data').filter(name => name.endsWith('.json.gz'))) {
  const data = JSON.parse(gunzipSync(readFileSync(`routing-data/${file}`)));
  const graph = buildNetwork([data]);
  assert.ok(graph.nodes.length > 0);
  const [direction, line] = data.roads.find(([, points]) => points.length > 10);
  const from = direction === -1 ? line.at(-1) : line[0];
  const to = direction === -1 ? line[0] : line.at(-1);
  const route = routeNetwork(graph, from, to);
  assert.ok(route && route.km > 0, `${file}: known road must be routable`);
  console.log(`${file}: ${graph.nodes.length} nodes; road route verified`);
}
console.log('Routing checks passed');
