import { generateLoopRoute, resamplePath } from './geo';
import { pathDistance } from './haversine';
import { fetchElevations, elevationGain } from './elevation';
import { planRoadLoop } from './routing';

// Waypoints handed to the router; the trip service reorders them for an
// efficient loop, so this can be a bit more generous than a forced-order
// route without reintroducing zigzagging.
const POINTS_PER_ROUTE = 10;
const ELEVATION_SAMPLE_POINTS = 20;
// How many rotations to try when biasing toward a flat/hilly suggestion.
const TERRAIN_SEARCH_ATTEMPTS = 3;
// Waypoints for consecutive suggestions are spread using the golden angle,
// which gives good, non-repeating coverage around the circle indefinitely.
const GOLDEN_ANGLE_DEG = 137.5;

// Baseline running pace (min/km) plus Naismith-style penalty for ascent.
const BASE_PACE_MIN_PER_KM = 6;
const MIN_PER_M_ASCENT = 0.1;

function estimateMinutes(distanceKm, gainM) {
  return distanceKm * BASE_PACE_MIN_PER_KM + gainM * MIN_PER_M_ASCENT;
}

function classify(gainM, distanceKm) {
  const gainPerKm = distanceKm > 0 ? gainM / distanceKm : 0;
  return gainPerKm < 8 ? 'flat' : 'hilly';
}

// Plan a single candidate loop and snap it to the road network. Falls back
// to the raw geometric loop if the routing service is unavailable, so a
// failed request doesn't sink the whole suggestion.
async function planCandidate(points) {
  try {
    return await planRoadLoop(points);
  } catch {
    return { points, distanceKm: pathDistance(points) };
  }
}

// Path length scales roughly linearly with the loop's radius, so one
// correction pass - regenerate at a rescaled distance based on the measured
// error - gets noticeably closer to the requested distance.
async function planWithDistanceCorrection(start, distanceKm, rotation, shape) {
  const first = await planCandidate(
    generateLoopRoute(start, distanceKm, rotation, shape, POINTS_PER_ROUTE)
  );
  if (first.distanceKm <= 0) return first;

  const errorRatio = Math.abs(first.distanceKm - distanceKm) / distanceKm;
  if (errorRatio < 0.08) return first;

  const scale = distanceKm / first.distanceKm;
  const corrected = await planCandidate(
    generateLoopRoute(start, distanceKm * scale, rotation, shape, POINTS_PER_ROUTE)
  );

  const correctedError = Math.abs(corrected.distanceKm - distanceKm);
  const firstError = Math.abs(first.distanceKm - distanceKm);
  return correctedError < firstError ? corrected : first;
}

async function withElevation(route) {
  const samples = resamplePath(route.points, ELEVATION_SAMPLE_POINTS);
  const elevations = await fetchElevations(samples);
  const gainM = elevationGain(elevations);
  return {
    points: route.points,
    distanceKm: route.distanceKm,
    elevationGainM: gainM,
    estimatedMinutes: estimateMinutes(route.distanceKm, gainM),
    terrain: classify(gainM, route.distanceKm),
  };
}

// Generates the `index`-th suggestion for this search (0-based). Each index
// gets a distinct rotation via the golden angle, so repeated calls with
// increasing indexes produce an effectively unlimited stream of varied
// suggestions rather than a fixed pool. For a specific terrain preference,
// a few rotations near that index are tried and the best match is kept.
export async function generateRouteSuggestion(start, distanceKm, terrain, index) {
  const attempts = terrain === 'any' ? 1 : TERRAIN_SEARCH_ATTEMPTS;
  const shapes = [0, 0.6, -0.6];

  let best = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const slot = index * attempts + attempt;
    const rotation = (slot * GOLDEN_ANGLE_DEG) % 360;
    const shape = shapes[slot % shapes.length];

    const route = await planWithDistanceCorrection(start, distanceKm, rotation, shape);
    const candidate = await withElevation(route);

    if (terrain === 'any') return { id: `route-${index}`, ...candidate };
    if (
      !best ||
      (terrain === 'flat' && candidate.elevationGainM < best.elevationGainM) ||
      (terrain === 'hilly' && candidate.elevationGainM > best.elevationGainM)
    ) {
      best = candidate;
    }
  }
  return { id: `route-${index}`, ...best };
}
