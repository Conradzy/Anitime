// Directed distance-weighted graph. Only shared source vertices connect roads:
// geometric crossings alone must not join bridges and tunnels.
export function distance(a, b) {
  const rad = Math.PI / 180;
  const h = Math.sin((b[1] - a[1]) * rad / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin((b[0] - a[0]) * rad / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function buildNetwork(datasets) {
  const nodes = [], edges = [], ids = new Map();
  function node(point) {
    const key = point.map(n => n.toFixed(7)).join(',');
    if (!ids.has(key)) { ids.set(key, nodes.length); nodes.push(point); edges.push(new Map()); }
    return ids.get(key);
  }
  for (const dataset of datasets) for (const [direction, line] of dataset.roads) {
    for (let i = 1; i < line.length; i++) {
      const a = node(line[i - 1]), b = node(line[i]);
      const km = distance(line[i - 1], line[i]);
      if (a === b || km === 0) continue;
      if (direction !== -1) edges[a].set(b, km);
      if (direction !== 1) edges[b].set(a, km);
    }
  }
  return { nodes, edges };
}
export function routeNetwork(graph, from, to) {
  const { nodes, edges } = graph;
  function nearest(point) {
    let best = -1, km = 0.3;
    nodes.forEach((p, i) => { const d = distance(point, p); if (d < km) { best = i; km = d; } });
    return best;
  }
  const start = nearest(from), end = nearest(to);
  if (start < 0 || end < 0 || (start === end && distance(from, to) > 0.01)) return null;
  const costs = new Float64Array(nodes.length).fill(Infinity), prev = new Int32Array(nodes.length).fill(-1);
  const heap = [];
  function push(item) {
    heap.push(item); let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= item[0]) break; heap[i] = heap[p]; i = p; }
    heap[i] = item;
  }
  function pop() {
    const first = heap[0], last = heap.pop();
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let c = i * 2 + 1;
        if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++;
        if (heap[c][0] >= last[0]) break;
        heap[i] = heap[c]; i = c;
      }
      heap[i] = last;
    }
    return first;
  }
  costs[start] = 0; push([0, start]);
  while (heap.length) {
    const [cost, u] = pop();
    if (cost !== costs[u]) continue;
    if (u === end) break;
    for (const [v, weight] of edges[u]) {
      const next = cost + weight;
      if (next < costs[v]) { costs[v] = next; prev[v] = u; push([next, v]); }
    }
  }
  if (!Number.isFinite(costs[end])) return null;
  const path = [];
  for (let u = end; u !== -1; u = prev[u]) path.push([nodes[u][1], nodes[u][0]]);
  path.reverse();
  // Endpoints stay snapped to the road; never append an invented off-road line.
  if (path.length === 1) path.push([...path[0]]);
  return { km: costs[end], path, source: 'road' };
}
