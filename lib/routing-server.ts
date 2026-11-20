import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { buildNetwork, routeNetwork } from './road-network.mjs';
import { fetchExternalRoadRoute, type LatLng, type RouteResult } from './routing';

let network: Promise<ReturnType<typeof buildNetwork>> | undefined;
async function loadNetwork() {
  const folder = path.join(process.cwd(), 'routing-data');
  const files = (await readdir(folder)).filter(file => file.endsWith('.json.gz')).sort();
  const datasets = await Promise.all(files.map(async file => JSON.parse(gunzipSync(await readFile(path.join(folder, file))).toString())));
  return buildNetwork(datasets);
}
export async function fetchLocalRoadRoute(from: LatLng, to: LatLng, signal?: AbortSignal): Promise<RouteResult> {
  signal?.throwIfAborted();
  try {
    network ??= loadNetwork().catch(error => { network = undefined; throw error; });
    const graph = await network;
    signal?.throwIfAborted();
    const route = routeNetwork(graph, [from.lng, from.lat], [to.lng, to.lat]);
    if (route) return route;
  } catch (error) {
    signal?.throwIfAborted();
    console.error('Local road routing unavailable:', error);
  }
  return fetchExternalRoadRoute(from, to, signal);
}
