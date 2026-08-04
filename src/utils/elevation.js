// OpenTopoData client - no API key required.
// https://www.opentopodata.org/

const OPEN_TOPO_URL = 'https://api.opentopodata.org/v1/aster30m';
const MAX_LOCATIONS_PER_REQUEST = 100;

async function fetchElevationBatch(points) {
  const locations = points.map(([lat, lng]) => `${lat.toFixed(6)},${lng.toFixed(6)}`).join('|');
  const url = `${OPEN_TOPO_URL}?locations=${encodeURIComponent(locations)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OpenTopoData request failed: ${res.status}`);
  }
  const data = await res.json();
  if (data.status !== 'OK') {
    throw new Error(`OpenTopoData error: ${data.error || data.status}`);
  }
  return data.results.map((r) => (typeof r.elevation === 'number' ? r.elevation : 0));
}

// Fetch elevations for a flat list of points, chunking requests to respect
// the API's per-request location limit.
export async function fetchElevations(points) {
  const elevations = [];
  for (let i = 0; i < points.length; i += MAX_LOCATIONS_PER_REQUEST) {
    const chunk = points.slice(i, i + MAX_LOCATIONS_PER_REQUEST);
    const chunkElevations = await fetchElevationBatch(chunk);
    elevations.push(...chunkElevations);
  }
  return elevations;
}

// Total ascent (m) across a series of elevations.
export function elevationGain(elevations) {
  let gain = 0;
  for (let i = 1; i < elevations.length; i++) {
    const diff = elevations[i] - elevations[i - 1];
    if (diff > 0) gain += diff;
  }
  return gain;
}
