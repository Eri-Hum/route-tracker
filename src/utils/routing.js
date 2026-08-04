// Builds a road-following loop through a scattered set of waypoints using
// the public OSRM instance hosted by OpenStreetMap Germany - no API key
// required. https://routing.openstreetmap.de/about.html
//
// We use the "trip" service (a Travelling-Salesman solver), not "route".
// "route" connects waypoints in the exact order given, which - for points
// scattered loosely around a target radius - forces it to backtrack and
// zigzag between parallel streets to hit each one in sequence. "trip" with
// roundtrip=true instead finds the visiting order that minimizes total
// distance, which naturally follows a sensible street path instead.
//
// We use the "foot" profile since routes are generated for running/walking.

const OSRM_TRIP_URL = 'https://routing.openstreetmap.de/routed-foot/trip/v1/foot';
const CORS_PROXY_URL = 'https://corsproxy.io/?url=';

async function requestJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Routing request failed: ${res.status}`);
  }
  return res.json();
}

// `points` is a scattered set of [lat, lng] waypoints around a target loop,
// with `points[0]` being the fixed start/end location. Returns the
// road-following loop geometry as [lat, lng] pairs plus its actual distance
// in km.
export async function planRoadLoop(points) {
  const coords = points.map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';');
  const url = `${OSRM_TRIP_URL}/${coords}?roundtrip=true&source=first&destination=last&overview=full&geometries=geojson`;

  let data;
  try {
    data = await requestJson(url);
  } catch {
    data = await requestJson(`${CORS_PROXY_URL}${encodeURIComponent(url)}`);
  }

  if (data.code !== 'Ok' || !data.trips?.length) {
    throw new Error(`Routing error: ${data.message || data.code}`);
  }

  const trip = data.trips[0];
  return {
    points: trip.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distanceKm: trip.distance / 1000,
  };
}
