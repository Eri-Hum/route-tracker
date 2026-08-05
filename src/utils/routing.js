// Builds road-following loops using the public OSRM instance hosted by
// OpenStreetMap Germany - no API key required.
// https://routing.openstreetmap.de/about.html
//
// The routing profile is what keeps suggestions legal and safe to travel.
// Neither the foot nor the bicycle profile lists motorway, motorway_link,
// trunk or trunk_link among its routable highway types, and both honour
// access restrictions, refusing ways tagged no/private/agricultural/
// forestry/delivery and use_sidepath. Pointing any of this at a driving
// profile (routed-car) would silently start routing people onto motorways,
// so the activity's service path must not be changed casually.
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

const OSRM_HOST = 'https://routing.openstreetmap.de';
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
// at the same location, and `activity` selects the routing profile. Returns
// the road-following geometry as [lat, lng] pairs, the real route distance
// in km, the profile's own travel time in hours, and how far each waypoint
// had to be snapped onto the network (metres).
export async function planRoadLoop(points, activity) {
  const coords = points.map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';');
  const url =
    `${OSRM_HOST}/${activity.service}/route/v1/${activity.profile}/${coords}` +
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
    // The profile's own travel time. Useful beyond showing a duration: the
    // bicycle profile drops to walking pace on footways and steps, so a
    // route far slower than the profile cruises at is one spent pushing.
    durationH: (route.duration ?? 0) / 3600,
    snapDistances: (data.waypoints || []).map((w) => w.distance ?? 0),
  };
}
