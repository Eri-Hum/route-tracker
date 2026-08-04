// Snaps a loop of waypoints onto the real road/path network using the
// public OSRM instance hosted by OpenStreetMap Germany - no API key
// required. https://routing.openstreetmap.de/about.html
//
// We use the "foot" profile since routes are generated for running/walking.

const OSRM_ROUTE_URL = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot';
const CORS_PROXY_URL = 'https://corsproxy.io/?url=';

async function requestJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Routing request failed: ${res.status}`);
  }
  return res.json();
}

// `points` is a closed loop of [lat, lng] waypoints. Returns the
// road-following geometry as [lat, lng] pairs plus the actual route
// distance in km.
export async function snapRouteToRoads(points) {
  const coords = points.map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';');
  const url = `${OSRM_ROUTE_URL}/${coords}?overview=full&geometries=geojson`;

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
  };
}
