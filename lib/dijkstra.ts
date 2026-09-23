/**
 * A textbook Dijkstra's-algorithm implementation over a weighted graph.
 * This is the canonical reference — the file to open during a defense to
 * walk through how the shortest path is found.
 *
 * The app's actual delivery routes aren't computed by calling this in the
 * browser: they're precomputed offline (see scripts/build-delivery-routes.mjs,
 * which runs this exact algorithm — reimplemented there in plain JS so the
 * script has no TypeScript build step — against a ~79,000-edge real road
 * graph built from OpenStreetMap data) and written to
 * lib/delivery-routes.generated.ts, which the app imports directly. That
 * keeps the browser from having to download tens of thousands of graph
 * edges or re-run the algorithm on every page load just to show five fixed
 * routes. This module stays as the live, reusable implementation — safe to
 * call directly against any Graph, including a bigger one, since it uses a
 * binary min-heap rather than a linear scan.
 */

export type Graph = Record<string, Record<string, number>>;

export type DijkstraResult = {
  /** Node ids from start to end, inclusive. */
  path: string[];
  /** Shortest known distance from start to every node reached before the target. */
  distances: Record<string, number>;
  /** Total distance of the path (same as distances[end]). */
  totalDistance: number;
};

/** Minimal binary min-heap keyed by [distance, nodeId] pairs. */
class MinHeap {
  private items: [number, string][] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: [number, string]): void {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent][0] <= a[i][0]) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }

  pop(): [number, string] | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length && last) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let smallest = i;
        if (l < a.length && a[l][0] < a[smallest][0]) smallest = l;
        if (r < a.length && a[r][0] < a[smallest][0]) smallest = r;
        if (smallest === i) break;
        [a[smallest], a[i]] = [a[i], a[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

export function dijkstra(graph: Graph, start: string, end: string): DijkstraResult | null {
  const dist: Record<string, number> = { [start]: 0 };
  const prev: Record<string, string | null> = {};
  const visited = new Set<string>();
  const heap = new MinHeap();
  heap.push([0, start]);

  while (heap.size) {
    const popped = heap.pop();
    if (!popped) break;
    const [d, current] = popped;

    if (visited.has(current)) continue; // stale heap entry from an earlier, worse distance
    visited.add(current);
    if (current === end) break; // shortest path to the target is finalized

    for (const [neighbor, weight] of Object.entries(graph[current] ?? {})) {
      if (visited.has(neighbor)) continue;
      const candidate = d + weight;
      if (dist[neighbor] === undefined || candidate < dist[neighbor]) {
        dist[neighbor] = candidate;
        prev[neighbor] = current;
        heap.push([candidate, neighbor]);
      }
    }
  }

  if (dist[end] === undefined) return null; // no route exists

  const path: string[] = [];
  let node: string | null = end;
  while (node !== null) {
    path.unshift(node);
    node = prev[node] ?? null;
  }

  return { path, distances: dist, totalDistance: dist[end] };
}
