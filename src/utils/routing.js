// Builds road-following loops using the public OSRM instance hosted by
// OpenStreetMap Germany - no API key required.
// https://routing.openstreetmap.de/about.html
//
// The "foot" profile is what keeps suggestions legal and safe to run: its
// routable highway list covers primary through residential, service, track,
// path, steps, pedestrian, footway and pier, and pointedly does *not*
// include motorway, motorway_link, trunk or trunk_link. It also honours
// access restrictions, refusing ways tagged no/private/agricultural/
// forestry/delivery and foot=use_sidepath. Switching this endpoint to
// another profile (routed-car, say) would silently start routing people
// onto motorways, so it must not be changed casually.
//
// The central problem when generating a loop this way is that every
// waypoint handed to the router is a *hard constraint*: the route must
// pass through it. A waypoint that lands on a cul-de-sac, inside a block,
// or across a railway can only be visited by detouring in and back out
// again - which is exactly the "spur" that makes a generated route feel
// unpleasant. Two things here work against that:
//
//   1. `continue_straight=true` forbids U-turns at waypoints, so the router
//      cannot satisfy a waypoint by doubling back on itself.
//   2. The response reports how far each waypoint had to be snapped to
//      reach the network (`waypoints[].distance`), which lets the caller
//      identify and discard waypoints that landed somewhere unroutable.

const OSRM_ROUTE_URL = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot';
const CORS_PROXY_URL = 'https://corsproxy.io/?url=';

// The public instance asks for at most one request per second.
const MIN_REQUEST_INTERVAL_MS = 1100;
let nextRequestAt = 0;

async function throttle() {
  const now = Date.now();
  const waitMs = Math.max(0, nextRequestAt - now);
  nextRequestAt = Math.max(now, nextRequestAt) + MIN_REQUEST_INTERVAL_MS;
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

async function requestJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Routing request failed: ${res.status}`);
  }
  return res.json();
}

// `points` is an ordered loop of [lat, lng] waypoints, starting and ending
// at the same location. Returns the road-following geometry as [lat, lng]
// pairs, the real route distance in km, and how far each waypoint had to be
// snapped onto the network (metres).
export async function planRoadLoop(points) {
  const coords = points.map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';');
  const url =
    `${OSRM_ROUTE_URL}/${coords}` +
    '?overview=full&geometries=geojson&continue_straight=true';

  await throttle();

  let data;
  try {
    data = await requestJson(url);
  } catch {
    data = await requestJson(`${CORS_PROXY_URL}${encodeURIComponent(url)}`);
  }

  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(`Routing error: ${data.message || data.code}`);
  }

  const route = data.routes[0];
  return {
    points: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distanceKm: route.distance / 1000,
    snapDistances: (data.waypoints || []).map((w) => w.distance ?? 0),
  };
}
