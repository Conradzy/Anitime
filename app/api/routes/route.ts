import { requireUser } from '@/lib/marketplace';
import { fetchLocalRoadRoute } from '@/lib/routing-server';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  if (!(await requireUser())) return Response.json({ error: 'Not signed in.' }, { status: 401 });
  const query = new URL(request.url).searchParams;
  const keys = ['fromLat', 'fromLng', 'toLat', 'toLng'];
  const values = keys.map(key => query.get(key));
  if (values.some(value => value === null || value.trim() === '')) return Response.json({ error: 'Missing coordinates.' }, { status: 400 });
  const [fromLat, fromLng, toLat, toLng] = values.map(Number);
  if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite) || Math.abs(fromLat) > 90 || Math.abs(toLat) > 90 || Math.abs(fromLng) > 180 || Math.abs(toLng) > 180) return Response.json({ error: 'Invalid coordinates.' }, { status: 400 });
  const route = await fetchLocalRoadRoute({ lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng }, request.signal);
  return Response.json(route);
}
