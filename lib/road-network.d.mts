export type RoadDataset = { roads: [number, [number, number][]][] };
export type Network = { nodes: [number, number][]; edges: Map<number, number>[] };
export function distance(a: number[], b: number[]): number;
export function buildNetwork(data: RoadDataset[]): Network;
export function routeNetwork(graph: Network, from: number[], to: number[]): { km: number; path: [number, number][]; source: 'road' } | null;
